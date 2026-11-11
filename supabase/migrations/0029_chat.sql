-- =====================================================================
-- PortalMPC — 0029 — Chat interno (conversas individuais e em grupo)
-- ---------------------------------------------------------------------
-- Mensagens e arquivos ficam no banco e no Storage privado: o histórico não
-- depende do navegador e não tem limite de quantidade. Só participa quem está
-- na conversa — a RLS checa isso em cada leitura, inclusive no tempo real.
-- Conversas nascem e mudam por funções (abrir direta, criar grupo, grupo do
-- departamento, entrar/sair), nunca por INSERT direto do navegador.
-- =====================================================================

create table if not exists public.chat_conversas (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  text not null,
  nome                  text,
  departamento          text,
  -- Par de usuários da conversa direta (menor:maior), para nunca haver duas.
  direta_chave          text unique,
  criado_por            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  ultima_mensagem_em    timestamptz not null default now(),
  ultima_mensagem_resumo text,
  ultima_mensagem_autor uuid references public.profiles (id) on delete set null,
  constraint chat_conversas_tipo check (tipo in ('direta', 'grupo')),
  constraint chat_conversas_nome check (tipo = 'direta' or length(btrim(coalesce(nome, ''))) between 1 and 80)
);

create unique index if not exists chat_conversas_departamento_uidx
  on public.chat_conversas (departamento) where departamento is not null;

create table if not exists public.chat_participantes (
  conversa_id       uuid not null references public.chat_conversas (id) on delete cascade,
  usuario_id        uuid not null references public.profiles (id) on delete cascade,
  papel             text not null default 'membro',
  ultima_leitura_em timestamptz not null default now(),
  entrou_em         timestamptz not null default now(),
  -- Saiu ou foi removido do grupo: a linha fica (o histórico é preservado).
  saiu_em           timestamptz,
  primary key (conversa_id, usuario_id),
  constraint chat_participantes_papel check (papel in ('admin', 'membro'))
);

create index if not exists chat_participantes_usuario_idx on public.chat_participantes (usuario_id);

create table if not exists public.chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_conversas (id) on delete cascade,
  autor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  texto       text not null default '',
  -- [{ caminho, nome, tipo, tamanho }]
  anexos      jsonb not null default '[]'::jsonb,
  resposta_a  uuid references public.chat_mensagens (id) on delete set null,
  editada_em  timestamptz,
  excluida_em timestamptz,
  created_at  timestamptz not null default now(),
  constraint chat_mensagens_conteudo check (length(texto) <= 8000 and jsonb_typeof(anexos) = 'array'
                                             and (length(btrim(texto)) > 0 or jsonb_array_length(anexos) > 0 or excluida_em is not null))
);

create index if not exists chat_mensagens_conversa_idx on public.chat_mensagens (conversa_id, created_at desc);

create or replace function public.chat_participa(p_conversa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.chat_participantes p
    where p.conversa_id = p_conversa and p.usuario_id = (select auth.uid()) and p.saiu_em is null);
$$;

revoke all on function public.chat_participa(uuid) from public, anon;
grant execute on function public.chat_participa(uuid) to authenticated;

alter table public.chat_conversas     enable row level security;
alter table public.chat_participantes enable row level security;
alter table public.chat_mensagens     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'chat_mensagens' and policyname = 'chat_mensagens_select') then
    create policy chat_conversas_select on public.chat_conversas for select to authenticated
      using (public.chat_participa(id));
    create policy chat_participantes_select on public.chat_participantes for select to authenticated
      using (public.chat_participa(conversa_id));
    -- A pessoa só mexe na própria linha (marcar como lida).
    create policy chat_participantes_update on public.chat_participantes for update to authenticated
      using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

    create policy chat_mensagens_select on public.chat_mensagens for select to authenticated
      using (public.chat_participa(conversa_id));
    create policy chat_mensagens_insert on public.chat_mensagens for insert to authenticated
      with check (public.tem_permissao('tela.chat') and autor_id = (select auth.uid()) and public.chat_participa(conversa_id));
    create policy chat_mensagens_update on public.chat_mensagens for update to authenticated
      using (autor_id = (select auth.uid()) and public.chat_participa(conversa_id))
      with check (autor_id = (select auth.uid()));
  end if;
end $$;

create or replace function public.chat_mensagem_carimbo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := coalesce((select auth.uid()), new.autor_id);
    new.created_at := now();
    new.editada_em := null;
    new.excluida_em := null;
    return new;
  end if;
  -- Editar ou apagar a própria mensagem: o resto não muda.
  new.conversa_id := old.conversa_id;
  new.autor_id := old.autor_id;
  new.created_at := old.created_at;
  new.resposta_a := old.resposta_a;
  if new.excluida_em is not null and old.excluida_em is null then
    new.excluida_em := now();
    new.texto := '';
    new.anexos := '[]'::jsonb;
  elsif old.excluida_em is not null then
    return old;
  elsif new.texto is distinct from old.texto then
    new.editada_em := now();
    new.anexos := old.anexos;
  end if;
  return new;
end;
$$;

create or replace function public.chat_mensagem_depois()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.chat_conversas c
     set ultima_mensagem_em = new.created_at,
         ultima_mensagem_autor = new.autor_id,
         ultima_mensagem_resumo = case
           when length(btrim(new.texto)) > 0 then left(new.texto, 120)
           else '📎 ' || coalesce(new.anexos -> 0 ->> 'nome', 'Arquivo') end
   where c.id = new.conversa_id;
  update public.chat_participantes
     set ultima_leitura_em = new.created_at
   where conversa_id = new.conversa_id and usuario_id = new.autor_id;
  return null;
end;
$$;

revoke all on function public.chat_mensagem_carimbo() from public, anon, authenticated;
revoke all on function public.chat_mensagem_depois() from public, anon, authenticated;

create or replace trigger trg_chat_mensagem_carimbo
  before insert or update on public.chat_mensagens
  for each row execute function public.chat_mensagem_carimbo();
create or replace trigger trg_chat_mensagem_depois
  after insert on public.chat_mensagens
  for each row execute function public.chat_mensagem_depois();

-- ---------------------------------------------------------------------
-- Funções do chat
-- ---------------------------------------------------------------------
create or replace function public.chat_abrir_direta(p_usuario uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_chave text;
  v_id uuid;
begin
  if not public.tem_permissao('tela.chat') then
    raise exception 'Você não tem acesso ao chat.' using errcode = '42501';
  end if;
  if p_usuario is null or p_usuario = v_uid or not exists (select 1 from public.profiles where id = p_usuario and ativo) then
    raise exception 'Escolha um colega ativo para conversar.' using errcode = '22023';
  end if;
  v_chave := least(v_uid::text, p_usuario::text) || ':' || greatest(v_uid::text, p_usuario::text);
  select id into v_id from public.chat_conversas where direta_chave = v_chave;
  if v_id is null then
    insert into public.chat_conversas (tipo, direta_chave, criado_por) values ('direta', v_chave, v_uid)
    on conflict (direta_chave) do update set direta_chave = excluded.direta_chave
    returning id into v_id;
    insert into public.chat_participantes (conversa_id, usuario_id) values (v_id, v_uid), (v_id, p_usuario)
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

create or replace function public.chat_criar_grupo(p_nome text, p_participantes uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not public.tem_permissao('tela.chat') then
    raise exception 'Você não tem acesso ao chat.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 80 then
    raise exception 'Dê um nome ao grupo (até 80 caracteres).' using errcode = '22023';
  end if;
  insert into public.chat_conversas (tipo, nome, criado_por) values ('grupo', btrim(p_nome), v_uid) returning id into v_id;
  insert into public.chat_participantes (conversa_id, usuario_id, papel) values (v_id, v_uid, 'admin');
  insert into public.chat_participantes (conversa_id, usuario_id)
  select v_id, p.id from public.profiles p
  where p.id = any (coalesce(p_participantes, '{}')) and p.ativo and p.id <> v_uid
  on conflict do nothing;
  return v_id;
end;
$$;

/** Grupo do departamento: um por departamento, com todo mundo ativo daquele time. */
create or replace function public.chat_grupo_departamento(p_departamento text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_dep text := coalesce(p_departamento, public.meu_departamento());
  v_id uuid;
begin
  if not public.tem_permissao('tela.chat') then
    raise exception 'Você não tem acesso ao chat.' using errcode = '42501';
  end if;
  if v_dep is distinct from public.meu_departamento() and not public.is_admin() then
    raise exception 'Você só pode abrir o grupo do seu departamento.' using errcode = '42501';
  end if;
  if v_dep not in ('Matriz', 'Fiscal', 'Departamento Pessoal', 'Contabilidade', 'Legalização', 'Qualidade') then
    raise exception 'Departamento inválido.' using errcode = '22023';
  end if;
  select id into v_id from public.chat_conversas where departamento = v_dep;
  if v_id is null then
    insert into public.chat_conversas (tipo, nome, departamento, criado_por)
    values ('grupo', 'Equipe ' || v_dep, v_dep, v_uid)
    on conflict (departamento) where departamento is not null do update set nome = excluded.nome
    returning id into v_id;
  end if;
  -- Quem entrou no time depois passa a fazer parte ao abrir o grupo.
  insert into public.chat_participantes (conversa_id, usuario_id, ultima_leitura_em)
  select v_id, p.id, now() from public.profiles p
  where p.ativo and public.departamento_de_area(p.area) = v_dep
  on conflict do nothing;
  insert into public.chat_participantes (conversa_id, usuario_id) values (v_id, v_uid) on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.chat_gerenciar_participante(p_conversa uuid, p_usuario uuid, p_acao text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.chat_conversas;
  v_admin boolean;
begin
  select * into c from public.chat_conversas where id = p_conversa;
  if not found or c.tipo <> 'grupo' or not public.chat_participa(p_conversa) then
    raise exception 'Grupo não encontrado.' using errcode = '22023';
  end if;
  v_admin := public.is_admin() or c.criado_por = v_uid or exists (
    select 1 from public.chat_participantes
    where conversa_id = p_conversa and usuario_id = v_uid and papel = 'admin' and saiu_em is null);
  if p_acao = 'adicionar' then
    if not v_admin then
      raise exception 'Só quem administra o grupo adiciona pessoas.' using errcode = '42501';
    end if;
    insert into public.chat_participantes (conversa_id, usuario_id)
    select p_conversa, p.id from public.profiles p where p.id = p_usuario and p.ativo
    on conflict (conversa_id, usuario_id) do update set saiu_em = null, ultima_leitura_em = now();
  elsif p_acao = 'remover' then
    if p_usuario <> v_uid and not v_admin then
      raise exception 'Só quem administra o grupo remove pessoas.' using errcode = '42501';
    end if;
    update public.chat_participantes set saiu_em = now()
     where conversa_id = p_conversa and usuario_id = p_usuario and saiu_em is null;
  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.chat_renomear(p_conversa uuid, p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_participa(p_conversa) or length(btrim(coalesce(p_nome, ''))) not between 1 and 80 then
    raise exception 'Não foi possível renomear.' using errcode = '22023';
  end if;
  update public.chat_conversas set nome = btrim(p_nome) where id = p_conversa and tipo = 'grupo';
end;
$$;

/** Minhas conversas, com o outro lado, a última mensagem e as não lidas. */
create or replace function public.chat_minhas_conversas()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.c order by x.ultima desc), '[]'::jsonb)
  from (
    select c.ultima_mensagem_em as ultima,
      jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'nome', c.nome, 'departamento', c.departamento, 'criado_por', c.criado_por,
        'ultima_mensagem_em', c.ultima_mensagem_em, 'ultima_mensagem_resumo', c.ultima_mensagem_resumo,
        'ultima_mensagem_autor', c.ultima_mensagem_autor, 'meu_papel', eu.papel,
        'nao_lidas', (select count(*) from public.chat_mensagens m
                      where m.conversa_id = c.id and m.created_at > eu.ultima_leitura_em
                        and m.autor_id is distinct from eu.usuario_id and m.excluida_em is null),
        'participantes', (select coalesce(jsonb_agg(jsonb_build_object(
                             'id', p.id, 'nome', p.nome, 'apelido', p.apelido, 'avatar_path', p.avatar_path,
                             'area', p.area, 'cargo', p.cargo, 'papel', cp.papel, 'ativo', p.ativo) order by p.nome), '[]'::jsonb)
                          from public.chat_participantes cp join public.profiles p on p.id = cp.usuario_id
                          where cp.conversa_id = c.id and (cp.saiu_em is null or c.tipo = 'direta'))
      ) as c
    from public.chat_participantes eu
    join public.chat_conversas c on c.id = eu.conversa_id
    where eu.usuario_id = (select auth.uid()) and eu.saiu_em is null and public.is_active()
  ) x;
$$;

create or replace function public.chat_nao_lidas()
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum((select count(*) from public.chat_mensagens m
                       where m.conversa_id = eu.conversa_id and m.created_at > eu.ultima_leitura_em
                         and m.autor_id is distinct from eu.usuario_id and m.excluida_em is null)), 0)::int
  from public.chat_participantes eu
  where eu.usuario_id = (select auth.uid()) and eu.saiu_em is null and public.is_active();
$$;

create or replace function public.chat_marcar_lida(p_conversa uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.chat_participantes set ultima_leitura_em = now()
  where conversa_id = p_conversa and usuario_id = (select auth.uid());
$$;

/** Busca no histórico das MINHAS conversas. */
create or replace function public.chat_buscar(p_termo text, p_conversa uuid default null)
returns table (id uuid, conversa_id uuid, autor_id uuid, autor_nome text, texto text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.conversa_id, m.autor_id, p.nome, m.texto, m.created_at
  from public.chat_mensagens m
  join public.chat_participantes eu on eu.conversa_id = m.conversa_id and eu.usuario_id = (select auth.uid()) and eu.saiu_em is null
  left join public.profiles p on p.id = m.autor_id
  where public.is_active() and length(btrim(coalesce(p_termo, ''))) >= 2 and m.excluida_em is null
    and (p_conversa is null or m.conversa_id = p_conversa)
    and (m.texto ilike '%' || replace(replace(btrim(p_termo), '%', '\%'), '_', '\_') || '%'
         or exists (select 1 from jsonb_array_elements(m.anexos) a
                    where a ->> 'nome' ilike '%' || replace(replace(btrim(p_termo), '%', '\%'), '_', '\_') || '%'))
  order by m.created_at desc
  limit 80;
$$;

revoke all on function public.chat_abrir_direta(uuid) from public, anon;
revoke all on function public.chat_criar_grupo(text, uuid[]) from public, anon;
revoke all on function public.chat_grupo_departamento(text) from public, anon;
revoke all on function public.chat_gerenciar_participante(uuid, uuid, text) from public, anon;
revoke all on function public.chat_renomear(uuid, text) from public, anon;
revoke all on function public.chat_minhas_conversas() from public, anon;
revoke all on function public.chat_nao_lidas() from public, anon;
revoke all on function public.chat_marcar_lida(uuid) from public, anon;
revoke all on function public.chat_buscar(text, uuid) from public, anon;
grant execute on function public.chat_abrir_direta(uuid) to authenticated;
grant execute on function public.chat_criar_grupo(text, uuid[]) to authenticated;
grant execute on function public.chat_grupo_departamento(text) to authenticated;
grant execute on function public.chat_gerenciar_participante(uuid, uuid, text) to authenticated;
grant execute on function public.chat_renomear(uuid, text) to authenticated;
grant execute on function public.chat_minhas_conversas() to authenticated;
grant execute on function public.chat_nao_lidas() to authenticated;
grant execute on function public.chat_marcar_lida(uuid) to authenticated;
grant execute on function public.chat_buscar(text, uuid) to authenticated;

do $$
declare v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['chat_mensagens', 'chat_participantes'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end $$;
