-- =====================================================================
-- PortalMPC — 0027 — Tarefas e lembretes (Kanban)
-- ---------------------------------------------------------------------
-- Quadro com as colunas A fazer · Em andamento · Em revisão · Concluído ·
-- Cancelado. Cada tarefa pode ter vários responsáveis, prioridade, prazo
-- (data e hora), checklist, comentários, anexos e histórico.
-- Tarefa com prazo entra sozinha na agenda central (0025): aparece no
-- calendário de cada responsável e gera os avisos de atribuição e de prazo.
-- =====================================================================

create table if not exists public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text not null default '',
  tipo            text not null default 'tarefa',
  status          text not null default 'a_fazer',
  prioridade      text not null default 'normal',
  categoria       text,
  vencimento      date,
  hora            time,
  responsaveis    uuid[] not null default '{}',
  privada         boolean not null default false,
  empresa_id      uuid references public.legalizacao_empresas (id) on delete set null,
  empresa         text,
  checklist       jsonb not null default '[]'::jsonb,
  ordem           double precision not null default extract(epoch from now()),
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  concluida_em    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tarefas_titulo check (length(btrim(titulo)) between 1 and 160),
  constraint tarefas_tipo check (tipo in ('tarefa', 'lembrete')),
  constraint tarefas_status check (status in ('a_fazer', 'em_andamento', 'em_revisao', 'concluido', 'cancelado')),
  constraint tarefas_prioridade check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  constraint tarefas_checklist check (jsonb_typeof(checklist) = 'array')
);

create index if not exists tarefas_status_idx on public.tarefas (status, ordem);
create index if not exists tarefas_responsaveis_idx on public.tarefas using gin (responsaveis);
create index if not exists tarefas_vencimento_idx on public.tarefas (vencimento);

create table if not exists public.tarefa_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.tarefas (id) on delete cascade,
  autor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  autor_nome  text,
  texto       text not null,
  created_at  timestamptz not null default now(),
  constraint tarefa_comentarios_texto check (length(btrim(texto)) between 1 and 4000)
);

create table if not exists public.tarefa_anexos (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references public.tarefas (id) on delete cascade,
  nome         text not null,
  caminho      text not null unique,
  tipo         text,
  tamanho      bigint,
  enviado_por  uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_por_nome text,
  created_at   timestamptz not null default now()
);

create table if not exists public.tarefa_historico (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.tarefas (id) on delete cascade,
  autor_id    uuid references public.profiles (id) on delete set null,
  autor_nome  text,
  acao        text not null,
  de          text,
  para        text,
  created_at  timestamptz not null default now()
);

create index if not exists tarefa_comentarios_tarefa_idx on public.tarefa_comentarios (tarefa_id, created_at);
create index if not exists tarefa_anexos_tarefa_idx on public.tarefa_anexos (tarefa_id);
create index if not exists tarefa_historico_tarefa_idx on public.tarefa_historico (tarefa_id, created_at);

-- ---------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------
create or replace function public.tarefa_pode_ver(p_tarefa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa
      and ((select auth.uid()) = any (t.responsaveis) or t.criado_por = (select auth.uid())
           or (not t.privada and public.tem_permissao('tela.tarefas')))
  );
$$;

create or replace function public.tarefa_pode_editar(p_tarefa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('tela.tarefas') and exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa
      and ((select auth.uid()) = any (t.responsaveis) or t.criado_por = (select auth.uid())
           or (not t.privada and public.tem_permissao('dados.tarefas.gerenciar')))
  );
$$;

revoke all on function public.tarefa_pode_ver(uuid) from public, anon;
revoke all on function public.tarefa_pode_editar(uuid) from public, anon;
grant execute on function public.tarefa_pode_ver(uuid) to authenticated;
grant execute on function public.tarefa_pode_editar(uuid) to authenticated;

alter table public.tarefas            enable row level security;
alter table public.tarefa_comentarios enable row level security;
alter table public.tarefa_anexos      enable row level security;
alter table public.tarefa_historico   enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tarefas' and policyname = 'tarefas_select') then
    create policy tarefas_select on public.tarefas for select to authenticated
      using (public.is_active() and ((select auth.uid()) = any (responsaveis) or criado_por = (select auth.uid())
             or (not privada and public.tem_permissao('tela.tarefas'))));
    create policy tarefas_insert on public.tarefas for insert to authenticated
      with check (public.tem_permissao('tela.tarefas') and criado_por = (select auth.uid()));
    create policy tarefas_update on public.tarefas for update to authenticated
      using (public.tem_permissao('tela.tarefas') and ((select auth.uid()) = any (responsaveis) or criado_por = (select auth.uid())
             or (not privada and public.tem_permissao('dados.tarefas.gerenciar'))))
      with check (public.tem_permissao('tela.tarefas'));
    create policy tarefas_delete on public.tarefas for delete to authenticated
      using (public.tem_permissao('tela.tarefas') and (criado_por = (select auth.uid())
             or (not privada and public.tem_permissao('dados.tarefas.gerenciar'))));

    create policy tarefa_comentarios_select on public.tarefa_comentarios for select to authenticated
      using (public.tarefa_pode_ver(tarefa_id));
    create policy tarefa_comentarios_insert on public.tarefa_comentarios for insert to authenticated
      with check (public.tarefa_pode_ver(tarefa_id) and autor_id = (select auth.uid()));
    create policy tarefa_comentarios_delete on public.tarefa_comentarios for delete to authenticated
      using (autor_id = (select auth.uid()) or public.tem_permissao('dados.tarefas.gerenciar'));

    create policy tarefa_anexos_select on public.tarefa_anexos for select to authenticated
      using (public.tarefa_pode_ver(tarefa_id));
    create policy tarefa_anexos_insert on public.tarefa_anexos for insert to authenticated
      with check (public.tarefa_pode_ver(tarefa_id) and enviado_por = (select auth.uid()));
    create policy tarefa_anexos_delete on public.tarefa_anexos for delete to authenticated
      using (enviado_por = (select auth.uid()) or public.tem_permissao('dados.tarefas.gerenciar'));

    -- O histórico é escrito só pelos gatilhos.
    create policy tarefa_historico_select on public.tarefa_historico for select to authenticated
      using (public.tarefa_pode_ver(tarefa_id));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Carimbos, histórico, agenda e avisos
-- ---------------------------------------------------------------------
create or replace function public.tarefa_rotulo_status(p text)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'a_fazer' then 'A fazer' when 'em_andamento' then 'Em andamento' when 'em_revisao' then 'Em revisão'
                when 'concluido' then 'Concluído' when 'cancelado' then 'Cancelado' else p end;
$$;

create or replace function public.tarefa_carimbo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.titulo := btrim(new.titulo);
  new.responsaveis := coalesce(array(select distinct x from unnest(new.responsaveis) x where x is not null), '{}');
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.criado_por := (select auth.uid()); end if;
    new.criado_por_nome := (select nome from public.profiles where id = new.criado_por);
  else
    new.criado_por := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.status = 'concluido' then
    new.concluida_em := coalesce(case when tg_op = 'UPDATE' and old.status = 'concluido' then old.concluida_em end, now());
  else
    new.concluida_em := null;
  end if;
  if new.vencimento is null then new.hora := null; end if;
  return new;
end;
$$;

create or replace function public.tarefa_depois()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nome text := (select nome from public.profiles where id = (select auth.uid()));
  p uuid;
begin
  if tg_op = 'DELETE' then
    perform public.agenda_remover('tarefas', old.id::text, null);
    return old;
  end if;

  -- Histórico
  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, para)
    values (new.id, v_uid, v_nome, 'criou', public.tarefa_rotulo_status(new.status));
  else
    if new.status is distinct from old.status then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, de, para)
      values (new.id, v_uid, v_nome, 'moveu', public.tarefa_rotulo_status(old.status), public.tarefa_rotulo_status(new.status));
    end if;
    if new.responsaveis is distinct from old.responsaveis then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, de, para)
      values (new.id, v_uid, v_nome, 'responsáveis',
              (select string_agg(nome, ', ' order by nome) from public.profiles where id = any (old.responsaveis)),
              (select string_agg(nome, ', ' order by nome) from public.profiles where id = any (new.responsaveis)));
    end if;
    if new.vencimento is distinct from old.vencimento or new.hora is distinct from old.hora then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, de, para)
      values (new.id, v_uid, v_nome, 'prazo',
              to_char(old.vencimento, 'DD/MM/YYYY') || coalesce(' ' || to_char(old.hora, 'HH24:MI'), ''),
              to_char(new.vencimento, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH24:MI'), ''));
    end if;
    if new.prioridade is distinct from old.prioridade then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, de, para)
      values (new.id, v_uid, v_nome, 'prioridade', old.prioridade, new.prioridade);
    end if;
    if new.titulo is distinct from old.titulo then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, de, para)
      values (new.id, v_uid, v_nome, 'título', old.titulo, new.titulo);
    end if;
    if new.descricao is distinct from old.descricao then
      insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao) values (new.id, v_uid, v_nome, 'descrição');
    end if;
  end if;

  -- Agenda central: com prazo, entra no calendário de cada responsável.
  perform public.agenda_publicar(
    p_modulo => 'tarefas', p_tabela => 'tarefas', p_id => new.id::text,
    p_titulo => case when new.tipo = 'lembrete' then 'Lembrete: ' else '' end || new.titulo,
    p_data => new.vencimento, p_hora => new.hora,
    p_responsaveis => case when cardinality(new.responsaveis) = 0 then array[new.criado_por] else new.responsaveis end,
    p_status => case new.status when 'concluido' then 'concluido' when 'cancelado' then 'cancelado' else 'pendente' end,
    p_link => '/tarefas?tarefa=' || new.id, p_permissao => 'tela.tarefas',
    p_descricao => concat_ws(' · ', 'Prioridade ' || new.prioridade, public.tarefa_rotulo_status(new.status), nullif(left(new.descricao, 300), '')),
    p_categoria => 'Interna', p_empresa_id => new.empresa_id, p_empresa => new.empresa,
    p_privado => new.privada);

  -- Sem prazo não há evento: o aviso de atribuição sai daqui.
  if new.vencimento is null and new.status not in ('concluido', 'cancelado') then
    foreach p in array new.responsaveis loop
      if tg_op = 'INSERT' or not (p = any (old.responsaveis)) then
        perform public.notificar(p, 'atribuicao', 'tarefa_atribuida',
          'Tarefa no seu nome: ' || new.titulo, coalesce(v_nome, 'O portal') || ' atribuiu a você (sem prazo definido).',
          '/tarefas?tarefa=' || new.id, case when new.prioridade in ('alta', 'urgente') then 'alta' else 'normal' end,
          v_uid, 'tarefas', new.id::text, null, 'tarefa:atribuida:' || new.id, '{}'::jsonb, true);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.tarefa_filho_carimbo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nome text := (select nome from public.profiles where id = (select auth.uid()));
  t public.tarefas;
  p uuid;
begin
  select * into t from public.tarefas where id = new.tarefa_id;
  if tg_table_name = 'tarefa_comentarios' then
    new.autor_id := coalesce(v_uid, new.autor_id);
    new.autor_nome := coalesce(v_nome, new.autor_nome);
    foreach p in array (t.responsaveis || t.criado_por) loop
      perform public.notificar(p, 'atribuicao', 'tarefa_comentario',
        'Novo comentário: ' || t.titulo, coalesce(v_nome, 'Alguém') || ': ' || left(new.texto, 140),
        '/tarefas?tarefa=' || t.id, 'normal', v_uid, 'tarefas', t.id::text, null,
        'tarefa:comentario:' || t.id, '{}'::jsonb, true);
    end loop;
  else
    new.enviado_por := coalesce(v_uid, new.enviado_por);
    new.enviado_por_nome := coalesce(v_nome, new.enviado_por_nome);
    insert into public.tarefa_historico (tarefa_id, autor_id, autor_nome, acao, para)
    values (new.tarefa_id, v_uid, v_nome, 'anexou', new.nome);
  end if;
  return new;
end;
$$;

revoke all on function public.tarefa_carimbo() from public, anon, authenticated;
revoke all on function public.tarefa_depois() from public, anon, authenticated;
revoke all on function public.tarefa_filho_carimbo() from public, anon, authenticated;

create or replace trigger trg_tarefa_carimbo
  before insert or update on public.tarefas
  for each row execute function public.tarefa_carimbo();
create or replace trigger trg_tarefa_depois
  after insert or update or delete on public.tarefas
  for each row execute function public.tarefa_depois();
create or replace trigger trg_tarefa_comentario_carimbo
  before insert on public.tarefa_comentarios
  for each row execute function public.tarefa_filho_carimbo();
create or replace trigger trg_tarefa_anexo_carimbo
  before insert on public.tarefa_anexos
  for each row execute function public.tarefa_filho_carimbo();

-- Quadro em tempo real: o cartão que um colega move aparece movido para todos.
do $$
declare v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['tarefas', 'tarefa_comentarios'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end $$;
