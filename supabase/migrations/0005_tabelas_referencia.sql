-- =====================================================================
-- PortalMPC — 0005 — Tabelas de referência da Legalização
-- ---------------------------------------------------------------------
-- Conteúdo real extraído das abas auxiliares da Planilha_Saúde.xlsx:
--   "Caminhos"          → links das prefeituras por cidade
--   "Docs Necessários"  → checklist de documentos
--   "Base"              → listas de valores (status, ação, profissional, órgão)
--   "Status"/"Conferência" → modelos de diagnóstico por órgão
-- Essas abas eram consultadas manualmente; agora ficam disponíveis no portal.
-- =====================================================================

create table if not exists public.legalizacao_cidades_links (
  id                       uuid primary key default gen_random_uuid(),
  cidade                   text not null,
  cidade_normalizada       text not null,
  url_contribuinte_mobiliario text,
  url_contribuinte_2025    text,
  url_consulta_cfm         text,
  observacao               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint legalizacao_cidades_links_unica unique (cidade_normalizada, url_contribuinte_mobiliario)
);

comment on table public.legalizacao_cidades_links is
  'Portais de prefeitura por cidade (ISSQN/Alvará e consulta CFM), extraídos da aba "Caminhos".';

create index if not exists legalizacao_cidades_links_cidade_idx
  on public.legalizacao_cidades_links (cidade_normalizada);

create table if not exists public.legalizacao_documentos_necessarios (
  id          uuid primary key default gen_random_uuid(),
  ordem       integer not null,
  descricao   text not null,
  grupo       text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint legalizacao_documentos_descricao_unica unique (descricao)
);

comment on table public.legalizacao_documentos_necessarios is
  'Documentos necessários para andamento de processos de legalização (aba "Docs Necessários").';

create table if not exists public.legalizacao_opcoes (
  id          uuid primary key default gen_random_uuid(),
  grupo       text not null,   -- status_documentacao | acao | profissional | orgao | sim_nao
  valor       text not null,
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint legalizacao_opcoes_unica unique (grupo, valor)
);

comment on table public.legalizacao_opcoes is
  'Listas de valores usadas nos selects da planilha (aba "Base"). Alimenta os filtros e editores do portal.';

create index if not exists legalizacao_opcoes_grupo_idx on public.legalizacao_opcoes (grupo, ordem);

create table if not exists public.legalizacao_checklist_referencia (
  id                   uuid primary key default gen_random_uuid(),
  bloco                text not null,   -- "Modelo 1", "Modelo 2", "Conferência"…
  ordem                integer not null default 0,
  item                 text not null,   -- CFM/CCM, VISA, LTA, CNES…
  status               text,
  acao                 text,
  responsavel_tecnico  text,
  observacao           text,
  created_at           timestamptz not null default now()
);

comment on table public.legalizacao_checklist_referencia is
  'Modelos de diagnóstico por órgão (abas "Status" e "Conferência") usados como referência de parecer.';

create index if not exists legalizacao_checklist_bloco_idx
  on public.legalizacao_checklist_referencia (bloco, ordem);

drop trigger if exists trg_cidades_links_updated_at on public.legalizacao_cidades_links;
create trigger trg_cidades_links_updated_at
  before update on public.legalizacao_cidades_links
  for each row execute function public.set_updated_at();
