-- =====================================================================
-- PortalMPC — 0019 — Fórum da Meta
-- ---------------------------------------------------------------------
-- Uma rede social interna, no espírito do Twitter: posts com fotos,
-- curtidas, respostas em conversa, citações, enquetes, perfis, seguir
-- com sininho, menções (@apelido), hashtags (#tema) e busca.
--
-- Fotos ficam no Storage, num bucket PRIVADO ("portal"): só quem está
-- logado e ativo consegue abrir, por URL assinada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfil público dentro do portal
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists apelido     text,
  add column if not exists bio         text,
  add column if not exists cargo       text,
  add column if not exists avatar_path text,
  add column if not exists capa_cor    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_apelido_formato') then
    alter table public.profiles add constraint profiles_apelido_formato
      check (apelido is null or apelido ~ '^[a-z0-9._]{3,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_tamanho') then
    alter table public.profiles add constraint profiles_bio_tamanho
      check (bio is null or length(bio) <= 280);
  end if;
end $$;

create unique index if not exists profiles_apelido_unico on public.profiles (apelido) where apelido is not null;

-- Apelido a partir do e-mail (adm@... → @adm), sem acento, com número se repetir.
create or replace function public.gerar_apelido(p_email text, p_nome text, p_id uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_base text;
  v_tentativa text;
  v_n int := 1;
begin
  v_base := lower(split_part(coalesce(p_email, ''), '@', 1));
  if length(v_base) < 3 then
    v_base := lower(coalesce(p_nome, 'pessoa'));
  end if;
  v_base := translate(v_base,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
  v_base := regexp_replace(v_base, '[^a-z0-9._]+', '.', 'g');
  v_base := btrim(v_base, '.');
  if length(v_base) < 3 then v_base := 'pessoa'; end if;
  v_base := left(v_base, 26);

  v_tentativa := v_base;
  while exists (select 1 from public.profiles p where p.apelido = v_tentativa and p.id <> p_id) loop
    v_n := v_n + 1;
    v_tentativa := v_base || v_n;
  end loop;
  return v_tentativa;
end;
$$;

revoke all on function public.gerar_apelido(text, text, uuid) from public, anon, authenticated;

create or replace function public.profiles_apelido_automatico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.apelido is null or btrim(new.apelido) = '' then
    new.apelido := public.gerar_apelido(new.email, new.nome, new.id);
  else
    new.apelido := lower(btrim(new.apelido));
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_apelido_automatico() from public, anon, authenticated;

create or replace trigger trg_profiles_apelido
  before insert or update of apelido on public.profiles
  for each row execute function public.profiles_apelido_automatico();

update public.profiles p
set apelido = public.gerar_apelido(p.email, p.nome, p.id)
where p.apelido is null;

-- ---------------------------------------------------------------------
-- 2. Permissões
-- ---------------------------------------------------------------------
insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('tela.forum',          'Fórum da Meta',    'Rede interna: posts, fotos, curtidas, respostas e perfis.', 'telas', '/forum', false, 2),
  ('dados.forum.moderar', 'Moderar o fórum',  'Fixar posts no topo e remover posts de qualquer pessoa.',   'dados', null,     false, 53)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem;

-- O fórum nasce aberto para quem já usa o portal hoje.
insert into public.usuario_permissoes (usuario_id, chave)
select p.id, 'tela.forum' from public.profiles p where p.ativo and p.role <> 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Posts
-- ---------------------------------------------------------------------
create table if not exists public.forum_posts (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  texto       text not null default '',
  imagens     text[] not null default '{}',
  -- Resposta direta a outro post; `raiz_id` agrupa a conversa inteira.
  pai_id      uuid references public.forum_posts (id) on delete cascade,
  raiz_id     uuid references public.forum_posts (id) on delete cascade,
  -- Citação (repost com comentário)
  citacao_id  uuid references public.forum_posts (id) on delete set null,
  -- {"opcoes": ["A", "B"], "encerra_em": "2026-10-30T18:00:00Z"}
  enquete     jsonb,
  tags        text[] not null default '{}',
  mencoes     uuid[] not null default '{}',
  fixado      boolean not null default false,
  editado_em  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  busca       tsvector generated always as (to_tsvector('portuguese', coalesce(texto, ''))) stored,

  constraint forum_posts_texto check (length(texto) <= 4000),
  constraint forum_posts_imagens check (cardinality(imagens) <= 4),
  constraint forum_posts_conteudo check (
    length(btrim(texto)) > 0 or cardinality(imagens) > 0 or citacao_id is not null or enquete is not null),
  constraint forum_posts_enquete check (
    enquete is null or (
      jsonb_typeof(enquete -> 'opcoes') = 'array'
      and jsonb_array_length(enquete -> 'opcoes') between 2 and 4))
);

comment on table public.forum_posts is 'Fórum da Meta: posts, respostas (pai_id) e citações (citacao_id).';

create index if not exists forum_posts_criacao_idx on public.forum_posts (created_at desc) where pai_id is null;
create index if not exists forum_posts_autor_idx on public.forum_posts (autor_id, created_at desc);
create index if not exists forum_posts_raiz_idx on public.forum_posts (raiz_id, created_at);
create index if not exists forum_posts_pai_idx on public.forum_posts (pai_id);
create index if not exists forum_posts_tags_idx on public.forum_posts using gin (tags);
create index if not exists forum_posts_busca_idx on public.forum_posts using gin (busca);
create index if not exists forum_posts_texto_trgm_idx on public.forum_posts using gin (texto extensions.gin_trgm_ops);

create table if not exists public.forum_curtidas (
  post_id    uuid not null references public.forum_posts (id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, usuario_id)
);

create index if not exists forum_curtidas_usuario_idx on public.forum_curtidas (usuario_id, created_at desc);

create table if not exists public.forum_seguidores (
  seguidor_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  seguido_id  uuid not null references public.profiles (id) on delete cascade,
  -- O sininho: avisar a cada post novo dessa pessoa.
  notificar   boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  constraint forum_seguidores_nao_si_mesmo check (seguidor_id <> seguido_id)
);

create index if not exists forum_seguidores_seguido_idx on public.forum_seguidores (seguido_id);

create table if not exists public.forum_salvos (
  usuario_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.forum_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, post_id)
);

create table if not exists public.forum_votos (
  post_id    uuid not null references public.forum_posts (id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  opcao      smallint not null,
  created_at timestamptz not null default now(),
  primary key (post_id, usuario_id),
  constraint forum_votos_opcao check (opcao between 0 and 3)
);

-- ---------------------------------------------------------------------
-- 4. Antes de gravar: conversa, hashtags, menções e moderação
-- ---------------------------------------------------------------------
create or replace function public.forum_posts_preparar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderador boolean := (select auth.uid()) is null or public.tem_permissao('dados.forum.moderar');
begin
  new.texto := coalesce(new.texto, '');

  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.autor_id := (select auth.uid()); end if;
    if new.pai_id is not null then
      select coalesce(p.raiz_id, p.id) into new.raiz_id from public.forum_posts p where p.id = new.pai_id;
      new.enquete := null;
    else
      new.raiz_id := null;
    end if;
    if not v_moderador then new.fixado := false; end if;
  else
    -- O que não muda depois de publicado
    new.autor_id := old.autor_id;
    new.pai_id := old.pai_id;
    new.raiz_id := old.raiz_id;
    new.created_at := old.created_at;
    if not v_moderador then new.fixado := old.fixado; end if;
    if new.texto is distinct from old.texto or new.imagens is distinct from old.imagens then
      new.editado_em := now();
    end if;
  end if;

  -- #hashtags, minúsculas e sem repetição
  select coalesce(array_agg(distinct lower(m[1])), '{}')
    into new.tags
  from regexp_matches(new.texto, '#([A-Za-z0-9_À-ÿ]{2,40})', 'g') as m;

  -- @menções que existem de verdade
  select coalesce(array_agg(distinct p.id), '{}')
    into new.mencoes
  from regexp_matches(new.texto, '@([a-z0-9._]{3,30})', 'gi') as m
  join public.profiles p on p.apelido = lower(m[1]) and p.ativo;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.forum_posts_preparar() from public, anon, authenticated;

create or replace trigger trg_forum_posts_preparar
  before insert or update on public.forum_posts
  for each row execute function public.forum_posts_preparar();

-- ---------------------------------------------------------------------
-- 5. Depois de gravar: notificações
-- ---------------------------------------------------------------------
create or replace function public.forum_posts_notificar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor_nome text;
  v_trecho text;
  v_pai record;
  v_cit record;
  v_alvo uuid;
begin
  select nome into v_autor_nome from public.profiles where id = new.autor_id;
  v_trecho := left(regexp_replace(new.texto, '\s+', ' ', 'g'), 140);
  if v_trecho = '' then v_trecho := '📷 publicou uma foto'; end if;

  -- Menções (no post novo, ou as que entraram numa edição)
  foreach v_alvo in array new.mencoes loop
    if tg_op = 'INSERT' or not (v_alvo = any (coalesce(old.mencoes, '{}'))) then
      perform public.notificar(
        v_alvo, 'mencao', 'forum_mencao',
        v_autor_nome || ' mencionou você', v_trecho,
        '/forum/post/' || new.id, 'normal', new.autor_id, 'forum_posts', new.id::text, null,
        'mencao:' || new.id, '{}'::jsonb, true);
    end if;
  end loop;

  if tg_op <> 'INSERT' then
    return null;
  end if;

  if new.pai_id is not null then
    -- Resposta: avisa o autor do post respondido e o dono da conversa
    select p.autor_id, p.raiz_id into v_pai from public.forum_posts p where p.id = new.pai_id;
    if not (v_pai.autor_id = any (new.mencoes)) then
      perform public.notificar(
        v_pai.autor_id, 'forum', 'forum_resposta',
        v_autor_nome || ' respondeu você', v_trecho,
        '/forum/post/' || coalesce(new.raiz_id, new.pai_id) || '#p-' || new.id, 'normal', new.autor_id,
        'forum_posts', new.id::text, null, null, '{}'::jsonb, false);
    end if;
    if new.raiz_id is not null and new.raiz_id <> new.pai_id then
      perform public.notificar(
        (select autor_id from public.forum_posts where id = new.raiz_id), 'forum', 'forum_conversa',
        v_autor_nome || ' comentou na sua conversa', v_trecho,
        '/forum/post/' || new.raiz_id || '#p-' || new.id, 'baixa', new.autor_id,
        'forum_posts', new.id::text, null, 'conversa:' || new.raiz_id, '{}'::jsonb, true);
    end if;
  else
    -- Post novo: avisa quem segue o autor com o sininho ligado
    perform public.notificar(
      s.seguidor_id, 'forum', 'forum_post_seguido',
      v_autor_nome || ' publicou no Fórum', v_trecho,
      '/forum/post/' || new.id, 'normal', new.autor_id, 'forum_posts', new.id::text, null,
      null, '{}'::jsonb, false)
    from public.forum_seguidores s
    where s.seguido_id = new.autor_id and s.notificar
      and not (s.seguidor_id = any (new.mencoes));
  end if;

  if new.citacao_id is not null then
    select p.autor_id into v_cit from public.forum_posts p where p.id = new.citacao_id;
    perform public.notificar(
      v_cit.autor_id, 'forum', 'forum_citacao',
      v_autor_nome || ' compartilhou seu post', v_trecho,
      '/forum/post/' || new.id, 'baixa', new.autor_id, 'forum_posts', new.id::text, null,
      null, '{}'::jsonb, false);
  end if;

  return null;
end;
$$;

revoke all on function public.forum_posts_notificar() from public, anon, authenticated;

create or replace trigger trg_forum_posts_notificar
  after insert or update of texto on public.forum_posts
  for each row execute function public.forum_posts_notificar();

create or replace function public.forum_curtidas_notificar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post record;
  v_total int;
  v_nome text;
begin
  select p.id, p.autor_id, left(regexp_replace(p.texto, '\s+', ' ', 'g'), 100) as trecho
    into v_post from public.forum_posts p where p.id = new.post_id;
  select count(*) into v_total from public.forum_curtidas where post_id = new.post_id;
  select nome into v_nome from public.profiles where id = new.usuario_id;

  perform public.notificar(
    v_post.autor_id, 'forum', 'forum_curtida',
    case when v_total > 1 then v_nome || ' e mais ' || (v_total - 1) || ' curtiram seu post'
         else v_nome || ' curtiu seu post' end,
    coalesce(nullif(v_post.trecho, ''), '📷 foto'),
    '/forum/post/' || v_post.id, 'baixa', new.usuario_id, 'forum_posts', v_post.id::text, null,
    'curtida:' || v_post.id, jsonb_build_object('total', v_total), true);
  return null;
end;
$$;

revoke all on function public.forum_curtidas_notificar() from public, anon, authenticated;

create or replace trigger trg_forum_curtidas_notificar
  after insert on public.forum_curtidas
  for each row execute function public.forum_curtidas_notificar();

create or replace function public.forum_seguidores_notificar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notificar(
    new.seguido_id, 'forum', 'forum_seguidor',
    (select nome from public.profiles where id = new.seguidor_id) || ' começou a seguir você',
    'Veja o perfil e siga de volta, se quiser.',
    '/forum/perfil/' || new.seguidor_id, 'baixa', new.seguidor_id, 'profiles', new.seguidor_id::text,
    null, 'seguidor:' || new.seguidor_id, '{}'::jsonb, false);
  return null;
end;
$$;

revoke all on function public.forum_seguidores_notificar() from public, anon, authenticated;

create or replace trigger trg_forum_seguidores_notificar
  after insert on public.forum_seguidores
  for each row execute function public.forum_seguidores_notificar();

-- Voto em enquete só enquanto ela estiver aberta e numa opção que existe.
create or replace function public.forum_votos_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquete jsonb;
begin
  select enquete into v_enquete from public.forum_posts where id = new.post_id;
  if v_enquete is null then
    raise exception 'Este post não tem enquete.' using errcode = '22023';
  end if;
  if new.opcao >= jsonb_array_length(v_enquete -> 'opcoes') then
    raise exception 'Opção inexistente.' using errcode = '22023';
  end if;
  if (v_enquete ->> 'encerra_em') is not null and (v_enquete ->> 'encerra_em')::timestamptz < now() then
    raise exception 'A enquete já foi encerrada.' using errcode = '22023';
  end if;
  new.usuario_id := (select auth.uid());
  return new;
end;
$$;

revoke all on function public.forum_votos_validar() from public, anon, authenticated;

create or replace trigger trg_forum_votos_validar
  before insert or update on public.forum_votos
  for each row execute function public.forum_votos_validar();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.forum_posts      enable row level security;
alter table public.forum_curtidas   enable row level security;
alter table public.forum_seguidores enable row level security;
alter table public.forum_salvos     enable row level security;
alter table public.forum_votos      enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'forum_posts' and policyname = 'forum_posts_select') then
    create policy forum_posts_select on public.forum_posts
      for select to authenticated using (public.tem_permissao('tela.forum'));
    create policy forum_posts_insert on public.forum_posts
      for insert to authenticated
      with check (public.tem_permissao('tela.forum') and autor_id = (select auth.uid()));
    create policy forum_posts_update on public.forum_posts
      for update to authenticated
      using (public.tem_permissao('tela.forum')
             and (autor_id = (select auth.uid()) or public.tem_permissao('dados.forum.moderar')))
      with check (public.tem_permissao('tela.forum'));
    create policy forum_posts_delete on public.forum_posts
      for delete to authenticated
      using (autor_id = (select auth.uid()) or public.tem_permissao('dados.forum.moderar'));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'forum_curtidas' and policyname = 'forum_curtidas_select') then
    create policy forum_curtidas_select on public.forum_curtidas
      for select to authenticated using (public.tem_permissao('tela.forum'));
    create policy forum_curtidas_insert on public.forum_curtidas
      for insert to authenticated
      with check (public.tem_permissao('tela.forum') and usuario_id = (select auth.uid()));
    create policy forum_curtidas_delete on public.forum_curtidas
      for delete to authenticated using (usuario_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'forum_seguidores' and policyname = 'forum_seguidores_select') then
    create policy forum_seguidores_select on public.forum_seguidores
      for select to authenticated using (public.tem_permissao('tela.forum'));
    create policy forum_seguidores_insert on public.forum_seguidores
      for insert to authenticated
      with check (public.tem_permissao('tela.forum') and seguidor_id = (select auth.uid()));
    create policy forum_seguidores_update on public.forum_seguidores
      for update to authenticated
      using (seguidor_id = (select auth.uid())) with check (seguidor_id = (select auth.uid()));
    create policy forum_seguidores_delete on public.forum_seguidores
      for delete to authenticated using (seguidor_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'forum_salvos' and policyname = 'forum_salvos_proprios') then
    create policy forum_salvos_proprios on public.forum_salvos
      for all to authenticated
      using (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()) and public.tem_permissao('tela.forum'));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'forum_votos' and policyname = 'forum_votos_select') then
    create policy forum_votos_select on public.forum_votos
      for select to authenticated using (public.tem_permissao('tela.forum'));
    create policy forum_votos_insert on public.forum_votos
      for insert to authenticated
      with check (public.tem_permissao('tela.forum') and usuario_id = (select auth.uid()));
    create policy forum_votos_update on public.forum_votos
      for update to authenticated
      using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
    create policy forum_votos_delete on public.forum_votos
      for delete to authenticated using (usuario_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Leitura: feed, conversa, perfil, busca — tudo numa função só
-- ---------------------------------------------------------------------
-- Roda com a RLS de quem pergunta (SECURITY INVOKER). Devolve cada post já
-- com autor, contagens, "eu curti", "eu salvei", enquete apurada e o post
-- citado, para a tela não precisar de dez consultas.
create or replace function public.forum_listar(
  p_modo     text default 'todos',
  p_limite   integer default 20,
  p_antes    timestamptz default null,
  p_autor    uuid default null,
  p_tag      text default null,
  p_busca    text default null,
  p_post     uuid default null
)
returns jsonb
language sql stable set search_path = ''
as $$
  with eu as (select (select auth.uid()) as id),
  base as (
    select p.*
    from public.forum_posts p, eu
    where case p_modo
      when 'todos'     then p.pai_id is null
      when 'seguindo'  then p.pai_id is null and (p.autor_id = eu.id or exists (
                              select 1 from public.forum_seguidores s
                              where s.seguidor_id = eu.id and s.seguido_id = p.autor_id))
      when 'em_alta'   then p.pai_id is null and p.created_at >= now() - interval '7 days'
      when 'salvos'    then exists (select 1 from public.forum_salvos sv where sv.usuario_id = eu.id and sv.post_id = p.id)
      when 'perfil'    then p.autor_id = p_autor and p.pai_id is null
      when 'respostas' then p.autor_id = p_autor and p.pai_id is not null
      when 'curtidas'  then exists (select 1 from public.forum_curtidas c where c.usuario_id = p_autor and c.post_id = p.id)
      when 'midia'     then p.autor_id = p_autor and cardinality(p.imagens) > 0
      when 'tag'       then lower(p_tag) = any (p.tags)
      when 'busca'     then (
                              p.busca @@ websearch_to_tsquery('portuguese', coalesce(p_busca, ''))
                              or p.texto ilike '%' || coalesce(p_busca, '') || '%'
                              or exists (select 1 from public.profiles a where a.id = p.autor_id
                                         and (a.nome ilike '%' || coalesce(p_busca, '') || '%'
                                              or a.apelido ilike '%' || coalesce(p_busca, '') || '%')))
      when 'conversa'  then p.id = p_post or p.raiz_id = p_post
      when 'post'      then p.id = p_post
      else false
    end
    and (p_antes is null or p.created_at < p_antes)
  ),
  contado as (
    select b.*,
      (select count(*) from public.forum_curtidas c where c.post_id = b.id) as n_curtidas,
      (select count(*) from public.forum_posts r where r.pai_id = b.id) as n_respostas,
      (select count(*) from public.forum_posts q where q.citacao_id = b.id) as n_citacoes
    from base b
  ),
  ordenado as (
    select c.*,
      row_number() over (order by
        -- fixados no topo da primeira página do feed geral
        case when p_modo = 'todos' and p_antes is null and c.fixado then 0 else 1 end,
        case when p_modo = 'em_alta' then -(c.n_curtidas + 2 * c.n_respostas + c.n_citacoes) else 0 end,
        case when p_modo = 'conversa' then extract(epoch from c.created_at) else -extract(epoch from c.created_at) end
      ) as pos
    from contado c
  ),
  pagina as (
    select * from ordenado where pos <= least(greatest(coalesce(p_limite, 20), 1), 200)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'texto', o.texto,
    'imagens', o.imagens,
    'pai_id', o.pai_id,
    'raiz_id', o.raiz_id,
    'citacao_id', o.citacao_id,
    'enquete', o.enquete,
    'tags', o.tags,
    'fixado', o.fixado,
    'editado_em', o.editado_em,
    'created_at', o.created_at,
    'curtidas', o.n_curtidas,
    'respostas', o.n_respostas,
    'citacoes', o.n_citacoes,
    'curti', exists (select 1 from public.forum_curtidas c, eu where c.post_id = o.id and c.usuario_id = eu.id),
    'salvei', exists (select 1 from public.forum_salvos s, eu where s.post_id = o.id and s.usuario_id = eu.id),
    'meu_voto', (select v.opcao from public.forum_votos v, eu where v.post_id = o.id and v.usuario_id = eu.id),
    'votos', case when o.enquete is null then null else (
      select coalesce(jsonb_agg(coalesce(x.n, 0) order by g.i), '[]'::jsonb)
      from generate_series(0, jsonb_array_length(o.enquete -> 'opcoes') - 1) as g(i)
      left join (select v.opcao, count(*) n from public.forum_votos v where v.post_id = o.id group by v.opcao) x
        on x.opcao = g.i) end,
    'autor', (select jsonb_build_object('id', a.id, 'nome', a.nome, 'apelido', a.apelido,
                     'avatar_path', a.avatar_path, 'cargo', a.cargo, 'area', a.area)
              from public.profiles a where a.id = o.autor_id),
    'respondendo_a', (select jsonb_build_object('id', a.id, 'apelido', a.apelido, 'nome', a.nome)
                      from public.forum_posts pp join public.profiles a on a.id = pp.autor_id
                      where pp.id = o.pai_id),
    'citacao', (select jsonb_build_object(
                  'id', q.id, 'texto', q.texto, 'imagens', q.imagens, 'created_at', q.created_at,
                  'autor', (select jsonb_build_object('id', a.id, 'nome', a.nome, 'apelido', a.apelido,
                                   'avatar_path', a.avatar_path)
                            from public.profiles a where a.id = q.autor_id))
                from public.forum_posts q where q.id = o.citacao_id)
  ) order by o.pos), '[]'::jsonb)
  from pagina o;
$$;

revoke all on function public.forum_listar(text, integer, timestamptz, uuid, text, text, uuid) from public, anon;
grant execute on function public.forum_listar(text, integer, timestamptz, uuid, text, text, uuid) to authenticated;

create or replace function public.forum_perfil(p_usuario uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select case when not public.tem_permissao('tela.forum') then null else (
    select jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'apelido', p.apelido, 'bio', p.bio, 'cargo', p.cargo,
      'area', p.area, 'avatar_path', p.avatar_path, 'capa_cor', p.capa_cor, 'desde', p.created_at,
      'posts', (select count(*) from public.forum_posts f where f.autor_id = p.id and f.pai_id is null),
      'respostas', (select count(*) from public.forum_posts f where f.autor_id = p.id and f.pai_id is not null),
      'seguidores', (select count(*) from public.forum_seguidores s where s.seguido_id = p.id),
      'seguindo', (select count(*) from public.forum_seguidores s where s.seguidor_id = p.id),
      'curtidas_recebidas', (select count(*) from public.forum_curtidas c
                             join public.forum_posts f on f.id = c.post_id where f.autor_id = p.id),
      'eu_sigo', exists (select 1 from public.forum_seguidores s
                         where s.seguidor_id = (select auth.uid()) and s.seguido_id = p.id),
      'sininho', coalesce((select s.notificar from public.forum_seguidores s
                           where s.seguidor_id = (select auth.uid()) and s.seguido_id = p.id), false),
      'me_segue', exists (select 1 from public.forum_seguidores s
                          where s.seguidor_id = p.id and s.seguido_id = (select auth.uid()))
    )
    from public.profiles p where p.id = p_usuario and p.ativo
  ) end;
$$;

revoke all on function public.forum_perfil(uuid) from public, anon;
grant execute on function public.forum_perfil(uuid) to authenticated;

create or replace function public.forum_tendencias(p_dias integer default 14)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'posts', t.n) order by t.n desc, t.tag), '[]'::jsonb)
  from (
    select unnest(p.tags) as tag, count(*) as n
    from public.forum_posts p
    where p.created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 14), 1))
    group by 1
    order by 2 desc, 1
    limit 10
  ) t;
$$;

revoke all on function public.forum_tendencias(integer) from public, anon;
grant execute on function public.forum_tendencias(integer) to authenticated;

create or replace function public.forum_pessoas(p_busca text default null, p_limite integer default 8)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.tem_permissao('tela.forum') then '[]'::jsonb else (
    select coalesce(jsonb_agg(x.j order by x.ordem, x.nome), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'apelido', p.apelido, 'cargo', p.cargo, 'area', p.area,
        'avatar_path', p.avatar_path,
        'seguidores', (select count(*) from public.forum_seguidores s where s.seguido_id = p.id),
        'eu_sigo', exists (select 1 from public.forum_seguidores s
                           where s.seguidor_id = (select auth.uid()) and s.seguido_id = p.id)
      ) as j,
      -- sem busca: sugestões de quem eu ainda não sigo
      case when exists (select 1 from public.forum_seguidores s
                        where s.seguidor_id = (select auth.uid()) and s.seguido_id = p.id) then 1 else 0 end as ordem,
      p.nome
      from public.profiles p
      where p.ativo and p.id <> (select auth.uid())
        and (
          coalesce(btrim(p_busca), '') = ''
          or p.nome ilike '%' || btrim(p_busca) || '%'
          or p.apelido ilike '%' || btrim(p_busca) || '%'
          or coalesce(p.cargo, '') ilike '%' || btrim(p_busca) || '%'
        )
      order by ordem, p.nome
      limit least(greatest(coalesce(p_limite, 8), 1), 50)
    ) x
  ) end;
$$;

revoke all on function public.forum_pessoas(text, integer) from public, anon;
grant execute on function public.forum_pessoas(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Storage: bucket privado para fotos do fórum e de perfil
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal', 'portal', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'portal_ler_logado') then
    create policy portal_ler_logado on storage.objects
      for select to authenticated
      using (bucket_id = 'portal' and public.is_active());
  end if;
  -- Cada pessoa grava só na própria pasta: forum/<id>/... e avatares/<id>/...
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'portal_gravar_propria_pasta') then
    create policy portal_gravar_propria_pasta on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'portal' and public.is_active()
        and (storage.foldername(name))[1] in ('forum', 'avatares')
        and (storage.foldername(name))[2] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'portal_apagar_proprio') then
    create policy portal_apagar_proprio on storage.objects
      for delete to authenticated
      using (bucket_id = 'portal' and (storage.foldername(name))[2] = (select auth.uid())::text);
  end if;
end $$;
