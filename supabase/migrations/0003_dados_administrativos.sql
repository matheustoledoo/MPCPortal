-- =====================================================================
-- PortalMPC — 0003 — Dados administrativos confidenciais
-- ---------------------------------------------------------------------
-- Bloco financeiro/contratual do Adm.xlsx. Tabela SEPARADA da base geral,
-- com RLS exclusiva de admin (migration 0006). Um usuário da área de
-- Legalização não recebe estes campos em NENHUMA resposta da API.
--
-- Colunas de origem no Adm.xlsx:
--   G  SAÍDA            → data_saida / saida_raw
--   K  DATA DE VENCIM.  → dia_vencimento / dia_vencimento_raw
--   L  OBS.             → observacoes_honorarios (regras de cobrança)
--   M  jul/26           → valor_honorario + competencia (histórico em jsonb)
-- =====================================================================

create table if not exists public.legalizacao_dados_administrativos (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.legalizacao_empresas (id) on delete cascade,

  data_saida             date,
  saida_raw              text,

  dia_vencimento         smallint,
  dia_vencimento_raw     text,

  observacoes_honorarios text,

  valor_honorario        numeric(12,2),
  competencia_honorario  date,
  competencia_label      text,

  -- Histórico completo por competência: [{"competencia":"2026-07-01","label":"jul/26","valor":350.00}]
  honorarios_historico   jsonb not null default '[]'::jsonb,

  observacoes_internas   text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.profiles (id) on delete set null,
  updated_by             uuid references public.profiles (id) on delete set null,

  constraint legalizacao_dados_adm_empresa_unica unique (empresa_id),
  constraint legalizacao_dados_adm_dia_vencimento_valido
    check (dia_vencimento is null or (dia_vencimento between 1 and 31)),
  constraint legalizacao_dados_adm_valor_nao_negativo
    check (valor_honorario is null or valor_honorario >= 0)
);

comment on table public.legalizacao_dados_administrativos is
  'CONFIDENCIAL — honorários, vencimento e condições contratuais. Acesso restrito a role = admin via RLS.';
comment on column public.legalizacao_dados_administrativos.honorarios_historico is
  'Histórico de honorários por competência, preservando cada coluna mensal importada do Adm.xlsx.';

create index if not exists legalizacao_dados_adm_empresa_idx
  on public.legalizacao_dados_administrativos (empresa_id);
create index if not exists legalizacao_dados_adm_valor_idx
  on public.legalizacao_dados_administrativos (valor_honorario);
create index if not exists legalizacao_dados_adm_vencimento_idx
  on public.legalizacao_dados_administrativos (dia_vencimento);

drop trigger if exists trg_legalizacao_dados_adm_updated_at on public.legalizacao_dados_administrativos;
create trigger trg_legalizacao_dados_adm_updated_at
  before update on public.legalizacao_dados_administrativos
  for each row execute function public.set_updated_at();

create or replace function public.legalizacao_dados_adm_autoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_legalizacao_dados_adm_autoria on public.legalizacao_dados_administrativos;
create trigger trg_legalizacao_dados_adm_autoria
  before insert or update on public.legalizacao_dados_administrativos
  for each row execute function public.legalizacao_dados_adm_autoria();
