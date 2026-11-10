-- =====================================================================
-- PortalMPC — 0030 — Central de conhecimento (aprendizagem e procedimentos)
-- ---------------------------------------------------------------------
-- Três formas de registrar conhecimento, numa tabela só (`tipo`):
--   tutorial      → conteúdo em blocos (texto, imagem, vídeo, destaque, arquivo)
--   procedimento  → passo a passo com checklist interativo por pessoa
--   arquivo       → documentos enviados (PDF, Word, Excel, imagens…)
-- Com categorias e subcategorias, departamento, palavras-chave, busca,
-- controle de versões (cada alteração de conteúdo guarda um retrato),
-- favoritos, avaliação "foi útil?" e progresso do checklist.
-- =====================================================================

create or replace function public.texto_normalizado(p text)
returns text
language sql immutable set search_path = ''
as $$
  select translate(lower(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

create table if not exists public.conhecimento_categorias (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text,
  pai_id       uuid references public.conhecimento_categorias (id) on delete set null,
  departamento text,
  ordem        integer not null default 0,
  criado_por   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint conhecimento_categorias_nome check (length(btrim(nome)) between 1 and 80),
  constraint conhecimento_categorias_pai check (pai_id is distinct from id)
);

create table if not exists public.conhecimento_artigos (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  resumo              text not null default '',
  tipo                text not null default 'tutorial',
  categoria_id        uuid references public.conhecimento_categorias (id) on delete set null,
  departamento        text,
  atividade           text,
  palavras_chave      text[] not null default '{}',
  -- [{ id, tipo: 'texto'|'titulo'|'imagem'|'video'|'destaque'|'arquivo', ... }]
  blocos              jsonb not null default '[]'::jsonb,
  -- [{ id, titulo, descricao, importante, imagem }]
  passos              jsonb not null default '[]'::jsonb,
  -- [{ caminho, nome, tipo, tamanho }]
  anexos              jsonb not null default '[]'::jsonb,
  publicado           boolean not null default true,
  destaque            boolean not null default false,
  versao              integer not null default 1,
  nota_alteracao      text,
  visualizacoes       integer not null default 0,
  uteis               integer not null default 0,
  nao_uteis           integer not null default 0,
  texto_busca         text not null default '',
  criado_por          uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome     text,
  atualizado_por      uuid references public.profiles (id) on delete set null,
  atualizado_por_nome text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint conhecimento_artigos_titulo check (length(btrim(titulo)) between 1 and 160),
  constraint conhecimento_artigos_tipo check (tipo in ('tutorial', 'procedimento', 'arquivo')),
  constraint conhecimento_artigos_json check (jsonb_typeof(blocos) = 'array' and jsonb_typeof(passos) = 'array' and jsonb_typeof(anexos) = 'array')
);

create index if not exists conhecimento_artigos_categoria_idx on public.conhecimento_artigos (categoria_id);
create index if not exists conhecimento_artigos_atualizado_idx on public.conhecimento_artigos (updated_at desc);

create table if not exists public.conhecimento_versoes (
  id         uuid primary key default gen_random_uuid(),
  artigo_id  uuid not null references public.conhecimento_artigos (id) on delete cascade,
  versao     integer not null,
  titulo     text not null,
  retrato    jsonb not null,
  nota       text,
  autor_id   uuid references public.profiles (id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now(),
  unique (artigo_id, versao)
);

create table if not exists public.conhecimento_favoritos (
  usuario_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  artigo_id  uuid not null references public.conhecimento_artigos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, artigo_id)
);

create table if not exists public.conhecimento_avaliacoes (
  usuario_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  artigo_id  uuid not null references public.conhecimento_artigos (id) on delete cascade,
  util       boolean not null,
  comentario text,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, artigo_id)
);

create table if not exists public.conhecimento_progresso (
  usuario_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  artigo_id     uuid not null references public.conhecimento_artigos (id) on delete cascade,
  passos_feitos text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  primary key (usuario_id, artigo_id)
);

alter table public.conhecimento_categorias enable row level security;
alter table public.conhecimento_artigos    enable row level security;
alter table public.conhecimento_versoes    enable row level security;
alter table public.conhecimento_favoritos  enable row level security;
alter table public.conhecimento_avaliacoes enable row level security;
alter table public.conhecimento_progresso  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'conhecimento_artigos' and policyname = 'conhecimento_artigos_select') then
    create policy conhecimento_categorias_select on public.conhecimento_categorias for select to authenticated
      using (public.tem_permissao('tela.conhecimento'));
    create policy conhecimento_categorias_insert on public.conhecimento_categorias for insert to authenticated
      with check (public.tem_permissao('dados.conhecimento.editar'));
    create policy conhecimento_categorias_update on public.conhecimento_categorias for update to authenticated
      using (public.tem_permissao('dados.conhecimento.editar')) with check (public.tem_permissao('dados.conhecimento.editar'));
    create policy conhecimento_categorias_delete on public.conhecimento_categorias for delete to authenticated
      using (public.tem_permissao('dados.conhecimento.excluir'));

    -- Rascunho só aparece para quem escreve.
    create policy conhecimento_artigos_select on public.conhecimento_artigos for select to authenticated
      using (public.tem_permissao('tela.conhecimento')
             and (publicado or criado_por = (select auth.uid()) or public.tem_permissao('dados.conhecimento.editar')));
    create policy conhecimento_artigos_insert on public.conhecimento_artigos for insert to authenticated
      with check (public.tem_permissao('dados.conhecimento.editar'));
    create policy conhecimento_artigos_update on public.conhecimento_artigos for update to authenticated
      using (public.tem_permissao('dados.conhecimento.editar')) with check (public.tem_permissao('dados.conhecimento.editar'));
    create policy conhecimento_artigos_delete on public.conhecimento_artigos for delete to authenticated
      using (public.tem_permissao('dados.conhecimento.excluir'));

    create policy conhecimento_versoes_select on public.conhecimento_versoes for select to authenticated
      using (public.tem_permissao('tela.conhecimento'));

    create policy conhecimento_favoritos_proprios on public.conhecimento_favoritos for all to authenticated
      using (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()) and public.tem_permissao('tela.conhecimento'));
    create policy conhecimento_avaliacoes_proprias on public.conhecimento_avaliacoes for all to authenticated
      using (usuario_id = (select auth.uid()) or public.tem_permissao('dados.conhecimento.editar'))
      with check (usuario_id = (select auth.uid()) and public.tem_permissao('tela.conhecimento'));
    create policy conhecimento_progresso_proprio on public.conhecimento_progresso for all to authenticated
      using (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()) and public.tem_permissao('tela.conhecimento'));
  end if;
end $$;

-- Carimbos, texto de busca e controle de versões.
create or replace function public.conhecimento_artigo_carimbo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nome text := (select nome from public.profiles where id = (select auth.uid()));
  v_mudou boolean;
begin
  new.titulo := btrim(new.titulo);
  new.palavras_chave := coalesce(array(select distinct lower(btrim(x)) from unnest(new.palavras_chave) x where btrim(x) <> ''), '{}');

  if tg_op = 'INSERT' then
    if v_uid is not null then new.criado_por := v_uid; end if;
    new.criado_por_nome := coalesce((select nome from public.profiles where id = new.criado_por), new.criado_por_nome);
    new.atualizado_por := new.criado_por;
    new.atualizado_por_nome := new.criado_por_nome;
    new.versao := 1;
    new.visualizacoes := 0; new.uteis := 0; new.nao_uteis := 0;
    v_mudou := true;
  else
    new.criado_por := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.created_at := old.created_at;
    v_mudou := new.titulo is distinct from old.titulo or new.resumo is distinct from old.resumo
            or new.blocos is distinct from old.blocos or new.passos is distinct from old.passos
            or new.anexos is distinct from old.anexos;
    if v_mudou then
      new.versao := old.versao + 1;
      new.updated_at := now();
      new.atualizado_por := coalesce(v_uid, old.atualizado_por);
      new.atualizado_por_nome := coalesce(v_nome, old.atualizado_por_nome);
    else
      new.versao := old.versao;
      -- Contadores e leitura não mexem na data de atualização.
      if new.categoria_id is distinct from old.categoria_id or new.publicado is distinct from old.publicado
         or new.palavras_chave is distinct from old.palavras_chave or new.departamento is distinct from old.departamento then
        new.updated_at := now();
      else
        new.updated_at := old.updated_at;
      end if;
    end if;
  end if;

  new.texto_busca := public.texto_normalizado(concat_ws(' ', new.titulo, new.resumo, new.atividade, new.departamento,
    array_to_string(new.palavras_chave, ' '),
    (select string_agg(concat_ws(' ', b ->> 'texto', b ->> 'titulo', b ->> 'legenda', b ->> 'nome'), ' ') from jsonb_array_elements(new.blocos) b),
    (select string_agg(concat_ws(' ', p ->> 'titulo', p ->> 'descricao'), ' ') from jsonb_array_elements(new.passos) p),
    (select string_agg(a ->> 'nome', ' ') from jsonb_array_elements(new.anexos) a)));
  return new;
end;
$$;

create or replace function public.conhecimento_artigo_versao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.versao is distinct from old.versao then
    insert into public.conhecimento_versoes (artigo_id, versao, titulo, retrato, nota, autor_id, autor_nome)
    values (new.id, new.versao, new.titulo,
            jsonb_build_object('titulo', new.titulo, 'resumo', new.resumo, 'blocos', new.blocos, 'passos', new.passos, 'anexos', new.anexos),
            nullif(btrim(coalesce(new.nota_alteracao, '')), ''), new.atualizado_por, new.atualizado_por_nome)
    on conflict (artigo_id, versao) do nothing;
  end if;
  return null;
end;
$$;

create or replace function public.conhecimento_avaliacao_contar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_artigo uuid := coalesce(new.artigo_id, old.artigo_id);
begin
  update public.conhecimento_artigos a
     set uteis = (select count(*) from public.conhecimento_avaliacoes v where v.artigo_id = v_artigo and v.util),
         nao_uteis = (select count(*) from public.conhecimento_avaliacoes v where v.artigo_id = v_artigo and not v.util)
   where a.id = v_artigo;
  return null;
end;
$$;

revoke all on function public.conhecimento_artigo_carimbo() from public, anon, authenticated;
revoke all on function public.conhecimento_artigo_versao() from public, anon, authenticated;
revoke all on function public.conhecimento_avaliacao_contar() from public, anon, authenticated;

create or replace trigger trg_conhecimento_artigo_carimbo
  before insert or update on public.conhecimento_artigos
  for each row execute function public.conhecimento_artigo_carimbo();
create or replace trigger trg_conhecimento_artigo_versao
  after insert or update on public.conhecimento_artigos
  for each row execute function public.conhecimento_artigo_versao();
create or replace trigger trg_conhecimento_avaliacao_contar
  after insert or update or delete on public.conhecimento_avaliacoes
  for each row execute function public.conhecimento_avaliacao_contar();
create or replace trigger trg_audit_conhecimento_artigos
  after insert or delete on public.conhecimento_artigos
  for each row execute function public.registrar_auditoria();

/** Conta a leitura (uma chamada por abertura do artigo). */
create or replace function public.conhecimento_registrar_leitura(p_artigo uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.conhecimento_artigos set visualizacoes = visualizacoes + 1
  where id = p_artigo and public.tem_permissao('tela.conhecimento');
$$;

revoke all on function public.texto_normalizado(text) from public, anon;
revoke all on function public.conhecimento_registrar_leitura(uuid) from public, anon;
grant execute on function public.texto_normalizado(text) to authenticated;
grant execute on function public.conhecimento_registrar_leitura(uuid) to authenticated;

-- Categorias iniciais: uma por departamento, para a Central não nascer vazia de estrutura.
insert into public.conhecimento_categorias (nome, descricao, departamento, ordem)
select v.nome, v.descricao, v.departamento, v.ordem
from (values
  ('Fiscal', 'Apurações, obrigações acessórias e rotinas fiscais.', 'Fiscal', 1),
  ('Contabilidade', 'Fechamentos, conciliações e demonstrações.', 'Contabilidade', 2),
  ('Departamento Pessoal', 'Admissão, folha, férias, rescisão e eSocial.', 'Departamento Pessoal', 3),
  ('Legalização', 'Abertura, alteração, licenças e órgãos.', 'Legalização', 4),
  ('Qualidade e atendimento', 'Integração de clientes, padrões e atendimento.', 'Qualidade', 5),
  ('Portal e sistemas', 'Como usar o portal e os sistemas do escritório.', null, 6)
) as v(nome, descricao, departamento, ordem)
where not exists (select 1 from public.conhecimento_categorias);
