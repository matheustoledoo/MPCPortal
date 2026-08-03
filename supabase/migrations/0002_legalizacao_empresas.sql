-- =====================================================================
-- PortalMPC — 0002 — Base geral de Legalização
-- ---------------------------------------------------------------------
-- Colunas derivadas da análise real dos dois arquivos:
--   * Planilha_Saúde.xlsx  → aba "Bese"          (cabeçalho na linha 3, dados a partir da linha 5)
--   * Adm.xlsx             → aba "Pagadores (4)" (cabeçalho na linha 1, dados a partir da linha 2)
--
-- Campos gerais (visíveis para a área de Legalização) ficam AQUI.
-- Campos financeiros/contratuais confidenciais ficam em
-- `legalizacao_dados_administrativos` (migration 0003), protegidos por RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Validação de CNPJ (dígitos verificadores) — usada em check e relatórios
-- ---------------------------------------------------------------------
create or replace function public.cnpj_digitos(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when v is null then null
           when regexp_replace(v, '\D', '', 'g') = '' then null
           else lpad(regexp_replace(v, '\D', '', 'g'), 14, '0')
         end;
$$;

create or replace function public.cnpj_valido(v text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := public.cnpj_digitos(v);
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int := 0;
  resto int;
  dv1 int;
  dv2 int;
  i int;
begin
  if d is null or length(d) <> 14 then return false; end if;
  if d = repeat(substr(d, 1, 1), 14) then return false; end if;

  for i in 1..12 loop
    soma := soma + (substr(d, i, 1))::int * pesos1[i];
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;
  if dv1 <> (substr(d, 13, 1))::int then return false; end if;

  soma := 0;
  for i in 1..13 loop
    soma := soma + (substr(d, i, 1))::int * pesos2[i];
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;

  return dv2 = (substr(d, 14, 1))::int;
end;
$$;

comment on function public.cnpj_valido(text) is
  'Valida os dígitos verificadores de um CNPJ já normalizado ou formatado.';

-- ---------------------------------------------------------------------
-- Tabela principal
-- ---------------------------------------------------------------------
create table if not exists public.legalizacao_empresas (
  id                       uuid primary key default gen_random_uuid(),

  -- Identificação --------------------------------------------------
  cnpj                     text,                       -- 14 dígitos normalizados
  chave_identificacao      text not null,              -- CNPJ ou hash(razão+cidade) quando não há CNPJ
  cnpj_valido              boolean not null default false,
  razao_social             text not null,
  nome_fantasia            text,
  codigo                   text,                       -- COD (numérico, "MEI", "D"…)
  cidade                   text,
  data_inicio              date,

  -- Planilha Saúde (aba "Bese") ------------------------------------
  socio                    text,
  estabelecido             text,                       -- SIM / NÃO
  seguimento               text,
  inscricao_municipal      text,
  alvara                   text,                       -- SIM / NÃO
  avcb_clcb                text,
  avcb_clcb_validade       date,
  lta                      text,
  cnes                     text,
  cetesb                   text,
  amlurb_tx_lixo           text,
  vigilancia_sanitaria     text,
  vigilancia_sanitaria_validade date,
  extramuros               text,
  responsavel_tecnico      text,
  profissional             text,
  orgao                    text,
  validade                 text,
  validade_data            date,

  -- Adm.xlsx — campos gerais (não confidenciais) --------------------
  tributacao               text,
  tipo                     text,
  status                   text not null default 'ATIVO',

  -- Controle / rastreabilidade -------------------------------------
  origem                   public.origem_registro not null default 'manual',
  numero_origem_saude      integer,
  numero_origem_adm        integer,
  linha_origem_saude       integer,
  linha_origem_adm         integer,
  observacoes              text,
  necessita_revisao        boolean not null default false,
  revisao_motivo           text,
  responsavel_id           uuid references public.profiles (id) on delete set null,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.profiles (id) on delete set null,
  updated_by               uuid references public.profiles (id) on delete set null,

  constraint legalizacao_empresas_chave_unica unique (chave_identificacao),
  constraint legalizacao_empresas_cnpj_unico  unique (cnpj),
  constraint legalizacao_empresas_cnpj_formato check (cnpj is null or cnpj ~ '^\d{14}$'),
  constraint legalizacao_empresas_razao_nao_vazia check (length(btrim(razao_social)) > 0)
);

comment on table public.legalizacao_empresas is
  'Base geral consolidada de Legalização (Planilha Saúde + Adm.xlsx). Não contém dados financeiros confidenciais.';
comment on column public.legalizacao_empresas.chave_identificacao is
  'Chave de deduplicação: CNPJ normalizado quando existir; caso contrário "SEMCNPJ:" + razão social + nome fantasia + município normalizados.';
comment on column public.legalizacao_empresas.origem is
  'Rastreabilidade: planilha_saude, planilha_adm, ambas ou manual.';

create index if not exists legalizacao_empresas_razao_trgm_idx
  on public.legalizacao_empresas using gin (razao_social extensions.gin_trgm_ops);
create index if not exists legalizacao_empresas_cnpj_trgm_idx
  on public.legalizacao_empresas using gin (cnpj extensions.gin_trgm_ops);
create index if not exists legalizacao_empresas_cidade_idx  on public.legalizacao_empresas (cidade);
create index if not exists legalizacao_empresas_status_idx  on public.legalizacao_empresas (status);
create index if not exists legalizacao_empresas_origem_idx  on public.legalizacao_empresas (origem);
create index if not exists legalizacao_empresas_codigo_idx  on public.legalizacao_empresas (codigo);
create index if not exists legalizacao_empresas_revisao_idx on public.legalizacao_empresas (necessita_revisao)
  where necessita_revisao;

drop trigger if exists trg_legalizacao_empresas_updated_at on public.legalizacao_empresas;
create trigger trg_legalizacao_empresas_updated_at
  before update on public.legalizacao_empresas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Preenche automaticamente cnpj_valido, chave e autoria
-- ---------------------------------------------------------------------
create or replace function public.legalizacao_empresas_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cnpj := public.cnpj_digitos(new.cnpj);
  new.cnpj_valido := public.cnpj_valido(new.cnpj);

  if new.chave_identificacao is null or btrim(new.chave_identificacao) = '' then
    new.chave_identificacao := coalesce(
      new.cnpj,
      'SEMCNPJ:' || upper(regexp_replace(
        coalesce(new.razao_social, '') || '|' || coalesce(new.nome_fantasia, '') || '|' || coalesce(new.cidade, ''),
        '\s+', ' ', 'g'))
    );
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);

  return new;
end;
$$;

drop trigger if exists trg_legalizacao_empresas_normalizar on public.legalizacao_empresas;
create trigger trg_legalizacao_empresas_normalizar
  before insert or update on public.legalizacao_empresas
  for each row execute function public.legalizacao_empresas_normalizar();
