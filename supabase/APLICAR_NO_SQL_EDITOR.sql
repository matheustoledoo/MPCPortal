-- =====================================================================
-- PortalMPC — migrations pendentes, prontas para o SQL Editor
-- Gerado em 2026-08-06T17:40:59.351Z
-- Inclui: 0001_core_perfis_e_permissoes.sql, 0002_legalizacao_empresas.sql, 0003_dados_administrativos.sql, 0004_auditoria_e_importacao.sql, 0005_tabelas_referencia.sql, 0006_rls_politicas.sql, 0007_rpc_estatisticas.sql, 0008_restringir_execucao_de_funcoes.sql, 0009_corrigir_tokens_nulos_auth_users.sql, 0010_permissoes_modulares.sql, 0011_atribuicoes.sql, 0012_colunas_por_usuario.sql, 0013_permitir_manutencao_sem_sessao.sql, 0014_revogar_gatilhos_novos.sql
--
-- Cole tudo de uma vez no SQL Editor do Supabase e execute.
-- É seguro rodar mais de uma vez.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0001_core_perfis_e_permissoes.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0001 — Núcleo: extensões, enums, perfis e helpers de permissão
-- ---------------------------------------------------------------------
-- Todas as verificações de permissão do PortalMPC nascem aqui. As funções
-- helper são SECURITY DEFINER para poderem ler `profiles` sem disparar
-- recursão infinita nas próprias políticas de RLS da tabela.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums de domínio
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_area as enum (
    'legalizacao', 'fiscal', 'contabil', 'departamento_pessoal', 'administracao'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('admin', 'gestor', 'colaborador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.origem_registro as enum (
    'planilha_saude', 'planilha_adm', 'ambas', 'manual'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_acao as enum (
    'INSERT', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT', 'LOGIN', 'ADMIN_READ', 'ADMIN_UPDATE'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles — espelho aplicativo do Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text        not null,
  email       text        not null,
  area        public.app_area not null default 'legalizacao',
  role        public.app_role not null default 'colaborador',
  ativo       boolean     not null default true,
  telefone    text,
  ultimo_acesso timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_email_unico unique (email),
  constraint profiles_nome_nao_vazio check (length(btrim(nome)) > 0)
);

comment on table public.profiles is
  'Perfil de aplicação vinculado ao Supabase Auth. Define área e função (role) do usuário.';

create index if not exists profiles_area_idx on public.profiles (area);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_ativo_idx on public.profiles (ativo);

-- ---------------------------------------------------------------------
-- Helpers de permissão (SECURITY DEFINER → ignoram RLS de profiles)
-- ---------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.ativo from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'admin' and p.ativo
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

create or replace function public.user_area()
returns public.app_area
language sql
stable
security definer
set search_path = ''
as $$
  select p.area from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

-- Pode LER a base geral de Legalização
create or replace function public.can_read_legalizacao()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.ativo and (p.role = 'admin' or p.area in ('legalizacao', 'administracao'))
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

-- Pode CRIAR / EDITAR na base geral de Legalização
create or replace function public.can_write_legalizacao()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.ativo and (p.role = 'admin' or p.area = 'legalizacao')
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

-- Pode EXCLUIR registros de Legalização (admin ou gestor da área)
create or replace function public.can_delete_legalizacao()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.ativo and (p.role = 'admin' or (p.area = 'legalizacao' and p.role = 'gestor'))
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

comment on function public.is_admin() is
  'Verdadeiro somente para usuários ativos com role = admin. Base de toda proteção dos dados administrativos.';

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Blindagem: usuário comum não altera a própria role/área/ativo
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.area is distinct from old.area
     or new.ativo is distinct from old.ativo then
    raise exception 'Apenas administradores podem alterar função, área ou status de um usuário.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_privileges on public.profiles;
create trigger trg_profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------
-- Criação automática do profile no signup
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, area, role, ativo)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'area')::public.app_area, 'legalizacao'),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'colaborador'),
    coalesce((new.raw_user_meta_data ->> 'ativo')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 0002_legalizacao_empresas.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 0003_dados_administrativos.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 0004_auditoria_e_importacao.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0004 — Auditoria, logs de importação e divergências
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id                bigint generated always as identity primary key,
  usuario_id        uuid references auth.users (id) on delete set null,
  usuario_email     text,
  usuario_nome      text,
  acao              public.audit_acao not null,
  tabela            text not null,
  registro_id       text,
  dados_anteriores  jsonb,
  dados_novos       jsonb,
  campos_alterados  text[],
  contexto          jsonb,          -- { ip, user_agent, rota, origem }
  created_at        timestamptz not null default now()
);

comment on table public.audit_logs is
  'Trilha de auditoria: criação, edição, exclusão, importação, exportação e leitura de dados administrativos.';

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_usuario_idx    on public.audit_logs (usuario_id);
create index if not exists audit_logs_tabela_idx     on public.audit_logs (tabela);
create index if not exists audit_logs_acao_idx       on public.audit_logs (acao);
create index if not exists audit_logs_registro_idx   on public.audit_logs (tabela, registro_id);

-- ---------------------------------------------------------------------
-- Gatilho genérico de auditoria
-- ---------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_nome      text;
  v_antes     jsonb;
  v_depois    jsonb;
  v_registro  text;
  v_campos    text[];
begin
  select p.email, p.nome into v_email, v_nome
  from public.profiles p where p.id = v_uid;

  if tg_op = 'DELETE' then
    v_antes    := to_jsonb(old);
    v_registro := (to_jsonb(old) ->> 'id');
  elsif tg_op = 'INSERT' then
    v_depois   := to_jsonb(new);
    v_registro := (to_jsonb(new) ->> 'id');
  else
    v_antes    := to_jsonb(old);
    v_depois   := to_jsonb(new);
    v_registro := (to_jsonb(new) ->> 'id');

    select coalesce(array_agg(chave order by chave), '{}')
      into v_campos
    from (
      select key as chave
      from jsonb_each(v_depois)
      where key not in ('updated_at', 'updated_by')
        and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
    ) diff;

    -- Nada de relevante mudou: não polui a auditoria
    if v_campos = '{}' then
      return new;
    end if;
  end if;

  insert into public.audit_logs (
    usuario_id, usuario_email, usuario_nome, acao, tabela,
    registro_id, dados_anteriores, dados_novos, campos_alterados, contexto
  ) values (
    v_uid, v_email, v_nome,
    case
      when tg_op = 'UPDATE' and tg_table_name = 'legalizacao_dados_administrativos' then 'ADMIN_UPDATE'::public.audit_acao
      else tg_op::public.audit_acao
    end,
    tg_table_name,
    v_registro, v_antes, v_depois, v_campos,
    jsonb_build_object('origem', 'trigger', 'schema', tg_table_schema)
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_legalizacao_empresas on public.legalizacao_empresas;
create trigger trg_audit_legalizacao_empresas
  after insert or update or delete on public.legalizacao_empresas
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_audit_dados_administrativos on public.legalizacao_dados_administrativos;
create trigger trg_audit_dados_administrativos
  after insert or update or delete on public.legalizacao_dados_administrativos
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Registro de auditoria a partir da aplicação (export, leitura admin…)
-- ---------------------------------------------------------------------
create or replace function public.registrar_evento_auditoria(
  p_acao        public.audit_acao,
  p_tabela      text,
  p_registro_id text default null,
  p_contexto    jsonb default '{}'::jsonb,
  p_dados_novos jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_nome  text;
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.' using errcode = '42501';
  end if;

  select p.email, p.nome into v_email, v_nome
  from public.profiles p where p.id = v_uid;

  insert into public.audit_logs (
    usuario_id, usuario_email, usuario_nome, acao, tabela, registro_id, dados_novos, contexto
  ) values (
    v_uid, v_email, v_nome, p_acao, p_tabela, p_registro_id, p_dados_novos,
    coalesce(p_contexto, '{}'::jsonb) || jsonb_build_object('origem', 'aplicacao')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.registrar_evento_auditoria(public.audit_acao, text, text, jsonb, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- import_logs — cada execução do ETL
-- ---------------------------------------------------------------------
create table if not exists public.import_logs (
  id                uuid primary key default gen_random_uuid(),
  iniciado_em       timestamptz not null default now(),
  finalizado_em     timestamptz,
  status            text not null default 'em_andamento',   -- em_andamento | concluido | erro
  executado_por     uuid references public.profiles (id) on delete set null,
  executado_por_desc text,
  arquivos          jsonb not null default '[]'::jsonb,
  resumo            jsonb not null default '{}'::jsonb,
  mensagem_erro     text,
  created_at        timestamptz not null default now()
);

comment on table public.import_logs is
  'Log de cada execução do ETL de mesclagem das planilhas, com o relatório completo em `resumo`.';

create index if not exists import_logs_iniciado_idx on public.import_logs (iniciado_em desc);

-- ---------------------------------------------------------------------
-- import_divergencias — conflitos entre as duas fontes
-- ---------------------------------------------------------------------
create table if not exists public.import_divergencias (
  id                 uuid primary key default gen_random_uuid(),
  import_log_id      uuid references public.import_logs (id) on delete cascade,
  empresa_id         uuid references public.legalizacao_empresas (id) on delete cascade,
  chave              text not null,
  razao_social       text,
  campo              text not null,
  valor_planilha_saude text,
  valor_planilha_adm   text,
  valor_aplicado     text,
  fonte_vencedora    text,          -- 'adm' (regra padrão) | 'saude' | 'unico'
  confidencial       boolean not null default false,
  resolvido          boolean not null default false,
  resolvido_por      uuid references public.profiles (id) on delete set null,
  resolvido_em       timestamptz,
  observacao         text,
  created_at         timestamptz not null default now()
);

comment on table public.import_divergencias is
  'Divergências entre Planilha Saúde e Adm.xlsx para a mesma empresa. Nenhum dado é descartado silenciosamente.';

create index if not exists import_divergencias_log_idx     on public.import_divergencias (import_log_id);
create index if not exists import_divergencias_empresa_idx on public.import_divergencias (empresa_id);
create index if not exists import_divergencias_resolvido_idx on public.import_divergencias (resolvido);
create index if not exists import_divergencias_confid_idx  on public.import_divergencias (confidencial);


-- ---------------------------------------------------------------------
-- 0005_tabelas_referencia.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 0006_rls_politicas.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0006 — Row Level Security
-- ---------------------------------------------------------------------
-- Regra de ouro: a permissão vive no BANCO. O frontend apenas reflete.
-- Um usuário da área de Legalização não consegue ler
-- `legalizacao_dados_administrativos` nem por API, nem por SQL, nem
-- por join aninhado do PostgREST.
-- =====================================================================

alter table public.profiles                          enable row level security;
alter table public.legalizacao_empresas              enable row level security;
alter table public.legalizacao_dados_administrativos enable row level security;
alter table public.audit_logs                        enable row level security;
alter table public.import_logs                       enable row level security;
alter table public.import_divergencias               enable row level security;
alter table public.legalizacao_cidades_links         enable row level security;
alter table public.legalizacao_documentos_necessarios enable row level security;
alter table public.legalizacao_opcoes                enable row level security;
alter table public.legalizacao_checklist_referencia  enable row level security;

-- Ninguém, nem admin, escapa da RLS por ser dono da tabela
alter table public.legalizacao_dados_administrativos force row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or (public.user_role() = 'gestor' and public.is_active() and area = public.user_area())
  );

drop policy if exists profiles_update_proprio on public.profiles;
create policy profiles_update_proprio on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin() and id <> (select auth.uid()));

-- ---------------------------------------------------------------------
-- legalizacao_empresas — base geral
-- ---------------------------------------------------------------------
drop policy if exists legalizacao_empresas_select on public.legalizacao_empresas;
create policy legalizacao_empresas_select on public.legalizacao_empresas
  for select to authenticated
  using (public.can_read_legalizacao());

drop policy if exists legalizacao_empresas_insert on public.legalizacao_empresas;
create policy legalizacao_empresas_insert on public.legalizacao_empresas
  for insert to authenticated
  with check (public.can_write_legalizacao());

drop policy if exists legalizacao_empresas_update on public.legalizacao_empresas;
create policy legalizacao_empresas_update on public.legalizacao_empresas
  for update to authenticated
  using (public.can_write_legalizacao())
  with check (public.can_write_legalizacao());

drop policy if exists legalizacao_empresas_delete on public.legalizacao_empresas;
create policy legalizacao_empresas_delete on public.legalizacao_empresas
  for delete to authenticated
  using (public.can_delete_legalizacao());

-- ---------------------------------------------------------------------
-- legalizacao_dados_administrativos — SOMENTE ADMIN
-- ---------------------------------------------------------------------
drop policy if exists dados_administrativos_admin_select on public.legalizacao_dados_administrativos;
create policy dados_administrativos_admin_select on public.legalizacao_dados_administrativos
  for select to authenticated
  using (public.is_admin());

drop policy if exists dados_administrativos_admin_insert on public.legalizacao_dados_administrativos;
create policy dados_administrativos_admin_insert on public.legalizacao_dados_administrativos
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists dados_administrativos_admin_update on public.legalizacao_dados_administrativos;
create policy dados_administrativos_admin_update on public.legalizacao_dados_administrativos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists dados_administrativos_admin_delete on public.legalizacao_dados_administrativos;
create policy dados_administrativos_admin_delete on public.legalizacao_dados_administrativos
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- audit_logs — leitura restrita a admin; escrita só via triggers/RPC
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- Nenhuma policy de INSERT/UPDATE/DELETE: a trilha é imutável para clientes.
-- As gravações ocorrem por funções SECURITY DEFINER.

-- ---------------------------------------------------------------------
-- import_logs / import_divergencias
-- ---------------------------------------------------------------------
drop policy if exists import_logs_select on public.import_logs;
create policy import_logs_select on public.import_logs
  for select to authenticated
  using (public.can_read_legalizacao());

drop policy if exists import_logs_admin_write on public.import_logs;
create policy import_logs_admin_write on public.import_logs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists import_divergencias_select on public.import_divergencias;
create policy import_divergencias_select on public.import_divergencias
  for select to authenticated
  using (
    public.is_admin()
    or (public.can_read_legalizacao() and confidencial = false)
  );

drop policy if exists import_divergencias_update on public.import_divergencias;
create policy import_divergencias_update on public.import_divergencias
  for update to authenticated
  using (public.is_admin() or (public.can_write_legalizacao() and confidencial = false))
  with check (public.is_admin() or (public.can_write_legalizacao() and confidencial = false));

drop policy if exists import_divergencias_admin_write on public.import_divergencias;
create policy import_divergencias_admin_write on public.import_divergencias
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists import_divergencias_admin_delete on public.import_divergencias;
create policy import_divergencias_admin_delete on public.import_divergencias
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Tabelas de referência — leitura para usuários ativos, escrita admin
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'legalizacao_cidades_links',
    'legalizacao_documentos_necessarios',
    'legalizacao_opcoes',
    'legalizacao_checklist_referencia'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active())', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Revoga acesso direto do anon
-- ---------------------------------------------------------------------
revoke all on public.legalizacao_dados_administrativos from anon;
revoke all on public.legalizacao_empresas              from anon;
revoke all on public.profiles                          from anon;
revoke all on public.audit_logs                        from anon;
revoke all on public.import_logs                       from anon;
revoke all on public.import_divergencias               from anon;


-- ---------------------------------------------------------------------
-- 0007_rpc_estatisticas.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0007 — RPCs de apoio (dashboard e verificação de acesso)
-- =====================================================================

-- Estatísticas gerais — SECURITY INVOKER: respeita a RLS do chamador.
create or replace function public.legalizacao_estatisticas()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total_empresas',       (select count(*) from public.legalizacao_empresas),
    'ativas',               (select count(*) from public.legalizacao_empresas where upper(status) = 'ATIVO'),
    'inativas',             (select count(*) from public.legalizacao_empresas where upper(status) <> 'ATIVO'),
    'necessitam_revisao',   (select count(*) from public.legalizacao_empresas where necessita_revisao),
    'cnpj_invalido',        (select count(*) from public.legalizacao_empresas where not cnpj_valido),
    'sem_alvara',           (select count(*) from public.legalizacao_empresas where upper(coalesce(alvara, '')) in ('NÃO', 'NAO')),
    'com_alvara',           (select count(*) from public.legalizacao_empresas where upper(coalesce(alvara, '')) = 'SIM'),
    'por_origem',           (select coalesce(jsonb_object_agg(origem, qtd), '{}'::jsonb)
                             from (select origem::text as origem, count(*) as qtd
                                   from public.legalizacao_empresas group by 1) o),
    'por_cidade',           (select coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(cidade, 'Não informado') as cidade, count(*) as qtd
                                   from public.legalizacao_empresas group by 1 order by 2 desc limit 10) c),
    'por_tributacao',       (select coalesce(jsonb_agg(jsonb_build_object('tributacao', tributacao, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(tributacao, 'Não informado') as tributacao, count(*) as qtd
                                   from public.legalizacao_empresas group by 1) t),
    'por_seguimento',       (select coalesce(jsonb_agg(jsonb_build_object('seguimento', seguimento, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(nullif(btrim(seguimento), ''), 'Não informado') as seguimento, count(*) as qtd
                                   from public.legalizacao_empresas group by 1 order by 2 desc limit 12) s),
    'vencimentos_proximos', (select coalesce(jsonb_agg(v order by (v ->> 'validade')), '[]'::jsonb)
                             from (
                               select jsonb_build_object(
                                        'id', id, 'razao_social', razao_social, 'documento', doc,
                                        'validade', validade
                                      ) as v
                               from (
                                 select id, razao_social, 'AVCB/CLCB' as doc, avcb_clcb_validade as validade
                                 from public.legalizacao_empresas where avcb_clcb_validade is not null
                                 union all
                                 select id, razao_social, 'Vigilância Sanitária', vigilancia_sanitaria_validade
                                 from public.legalizacao_empresas where vigilancia_sanitaria_validade is not null
                                 union all
                                 select id, razao_social, 'Responsável Técnico', validade_data
                                 from public.legalizacao_empresas where validade_data is not null
                               ) uni
                               where validade <= (current_date + interval '180 days')
                               order by validade
                               limit 25
                             ) x)
  );
$$;

grant execute on function public.legalizacao_estatisticas() to authenticated;

-- Estatísticas financeiras — exclusivas de admin.
create or replace function public.admin_estatisticas_financeiras()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'registros',            count(*),
    'faturamento_mensal',   coalesce(sum(valor_honorario), 0),
    'ticket_medio',         coalesce(round(avg(nullif(valor_honorario, 0)), 2), 0),
    'maior_honorario',      coalesce(max(valor_honorario), 0),
    'sem_honorario',        count(*) filter (where coalesce(valor_honorario, 0) = 0),
    'por_vencimento',       (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', qtd) order by dia), '[]'::jsonb)
                             from (select dia_vencimento as dia, count(*) as qtd
                                   from public.legalizacao_dados_administrativos
                                   where dia_vencimento is not null group by 1) d)
  )
  into v
  from public.legalizacao_dados_administrativos;

  return v;
end;
$$;

grant execute on function public.admin_estatisticas_financeiras() to authenticated;

-- Sonda de segurança: quantos registros administrativos o chamador enxerga.
-- Serve de evidência automatizada de que a RLS está ativa.
create or replace function public.verificar_acesso_administrativo()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'usuario',              (select auth.uid()),
    'is_admin',             public.is_admin(),
    'area',                 public.user_area(),
    'role',                 public.user_role(),
    'empresas_visiveis',    (select count(*) from public.legalizacao_empresas),
    'dados_adm_visiveis',   (select count(*) from public.legalizacao_dados_administrativos),
    'logs_auditoria_visiveis', (select count(*) from public.audit_logs)
  );
$$;

grant execute on function public.verificar_acesso_administrativo() to authenticated;


-- ---------------------------------------------------------------------
-- 0008_restringir_execucao_de_funcoes.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0008 — Superfície de RPC mínima
-- ---------------------------------------------------------------------
-- O PostgreSQL concede EXECUTE a PUBLIC por padrão, e o PostgREST publica
-- toda função do schema `public` como /rest/v1/rpc/<nome>. Nenhuma delas
-- vazava dado (todas checam permissão), mas não há motivo para expor
-- helpers internos e funções de gatilho a quem nem fez login.
--
-- Depois desta migration o linter de segurança do Supabase não aponta mais
-- nenhuma função executável pelo papel `anon`.
-- =====================================================================

-- 1. Funções de GATILHO: ninguém deve chamá-las diretamente.
--    O PostgreSQL não exige EXECUTE do usuário que dispara o DML, então
--    revogar aqui não quebra a auditoria (validado por teste de regressão).
do $$
declare f text;
begin
  foreach f in array array[
    'public.handle_new_user()',
    'public.protect_profile_privileges()',
    'public.registrar_auditoria()',
    'public.set_updated_at()',
    'public.legalizacao_empresas_normalizar()',
    'public.legalizacao_dados_adm_autoria()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2. Helpers de permissão: as políticas de RLS os avaliam com os privilégios
--    de quem consulta, então `authenticated` precisa executá-los. `anon` não.
--    Cada um devolve apenas o status do próprio chamador.
do $$
declare f text;
begin
  foreach f in array array[
    'public.current_profile()',
    'public.is_active()',
    'public.is_admin()',
    'public.user_area()',
    'public.user_role()',
    'public.can_read_legalizacao()',
    'public.can_write_legalizacao()',
    'public.can_delete_legalizacao()',
    'public.cnpj_digitos(text)',
    'public.cnpj_valido(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 3. RPCs de aplicação: exigem sessão autenticada.
revoke all on function public.legalizacao_estatisticas() from public, anon;
grant execute on function public.legalizacao_estatisticas() to authenticated;

revoke all on function public.admin_estatisticas_financeiras() from public, anon;
grant execute on function public.admin_estatisticas_financeiras() to authenticated;

revoke all on function public.verificar_acesso_administrativo() from public, anon;
grant execute on function public.verificar_acesso_administrativo() to authenticated;

revoke all on function public.registrar_evento_auditoria(public.audit_acao, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.registrar_evento_auditoria(public.audit_acao, text, text, jsonb, jsonb)
  to authenticated;

comment on function public.admin_estatisticas_financeiras() is
  'SECURITY DEFINER por precisar agregar a tabela confidencial; a primeira linha do corpo exige is_admin().';


-- ---------------------------------------------------------------------
-- 0009_corrigir_tokens_nulos_auth_users.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0009 — Corrige contas criadas por INSERT direto em auth.users
-- ---------------------------------------------------------------------
-- O GoTrue (Supabase Auth) lê `confirmation_token`, `recovery_token`,
-- `email_change` e afins como `string` do Go, não como ponteiro. Um NULL
-- nessas colunas derruba o login com HTTP 500 "Database error querying
-- schema" ANTES de a senha ser conferida — e o usuário vê apenas a
-- mensagem genérica de falha.
--
-- Isso só acontece com contas criadas por SQL. A Admin API usada em
-- `npm run seed:usuarios` já grava string vazia nessas colunas.
--
-- Esta migration é idempotente e segura de reexecutar.
-- =====================================================================

update auth.users
set confirmation_token          = coalesce(confirmation_token, ''),
    recovery_token              = coalesce(recovery_token, ''),
    email_change                = coalesce(email_change, ''),
    email_change_token_new      = coalesce(email_change_token_new, ''),
    email_change_token_current  = coalesce(email_change_token_current, ''),
    phone_change                = coalesce(phone_change, ''),
    phone_change_token          = coalesce(phone_change_token, ''),
    reauthentication_token      = coalesce(reauthentication_token, ''),
    email_change_confirm_status = coalesce(email_change_confirm_status, 0),
    aud                         = coalesce(nullif(aud, ''), 'authenticated'),
    role                        = coalesce(nullif(role, ''), 'authenticated')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null
   or aud is null
   or role is null;


-- ---------------------------------------------------------------------
-- 0010_permissoes_modulares.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0010 — Permissões modulares por usuário
-- ---------------------------------------------------------------------
-- Sai do modelo "3 funções fixas" para permissões explícitas, marcadas em
-- checkbox pelo administrador. Cada usuário passa a ter:
--   * um TIME (a área que já existia);
--   * um conjunto de permissões (telas + capacidades sobre os dados);
--   * opcionalmente, a lista de colunas que pode editar.
--
-- Regra inegociável: permissões marcadas como `somente_admin` nunca podem
-- ser concedidas a quem não é admin — garantido por gatilho no banco, não
-- apenas escondendo o checkbox na tela.
-- =====================================================================

create table if not exists public.permissoes_catalogo (
  chave         text primary key,
  rotulo        text not null,
  descricao     text,
  grupo         text not null,          -- telas | dados | administracao
  rota          text,                   -- rota protegida, quando a permissão é de tela
  somente_admin boolean not null default false,
  ordem         integer not null default 0
);

comment on table public.permissoes_catalogo is
  'Catálogo de tudo que pode ser concedido. Alimenta os checkboxes da tela de usuários.';

insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('tela.inicio',         'Início',               'Painel pessoal com suas atribuições e prazos.',   'telas', '/inicio',               false,  1),
  ('tela.legalizacao',    'Planilha Legalização', 'Base geral de empresas.',                         'telas', '/legalizacao',          false,  2),
  ('tela.referencias',    'Consultas por cidade', 'Portais das prefeituras e checklists.',           'telas', '/referencias',          false,  3),
  ('tela.importacoes',    'Importações',          'Relatório da consolidação das planilhas.',        'telas', '/importacoes',          false,  4),
  ('tela.atribuicoes',    'Atribuições',          'Responsabilidades recorrentes da equipe.',        'telas', '/atribuicoes',          false,  5),
  ('tela.fiscal',         'Fiscal',               'Módulo Fiscal.',                                  'telas', '/fiscal',               false,  6),
  ('tela.contabil',       'Contábil',             'Módulo Contábil.',                                'telas', '/contabil',             false,  7),
  ('tela.dp',             'Departamento Pessoal', 'Módulo de Departamento Pessoal.',                 'telas', '/departamento-pessoal', false,  8),
  ('tela.dashboard',      'Dashboard',            'Painel gerencial com indicadores.',               'telas', '/dashboard',            false,  9),
  ('tela.administrativo', 'Planilha ADM',         'Honorários e dados contratuais. CONFIDENCIAL.',   'telas', '/administrativo',       true,  10),
  ('tela.auditoria',      'Auditoria',            'Trilha de todas as alterações.',                  'telas', '/auditoria',            true,  11),
  ('tela.configuracoes',  'Configurações',        'Estrutura do sistema e matriz de permissões.',    'telas', '/configuracoes',        true,  12),

  ('dados.legalizacao.criar',      'Criar empresas',       'Cadastrar novas empresas na base.',              'dados', null, false, 20),
  ('dados.legalizacao.editar',     'Editar empresas',      'Alterar dados da base geral.',                   'dados', null, false, 21),
  ('dados.legalizacao.excluir',    'Excluir empresas',     'Remover registros da base.',                     'dados', null, false, 22),
  ('dados.legalizacao.exportar',   'Exportar Legalização', 'Baixar a base em Excel.',                        'dados', null, false, 23),
  ('dados.administrativo.editar',  'Editar dados ADM',     'Alterar honorários e condições. CONFIDENCIAL.',  'dados', null, true,  24),
  ('dados.administrativo.exportar','Exportar ADM',         'Baixar planilha com honorários. CONFIDENCIAL.',  'dados', null, true,  25),

  ('admin.usuarios.gerenciar',    'Gerenciar usuários',    'Criar usuários, definir time e ativar/desativar.', 'administracao', null, false, 30),
  ('admin.usuarios.permissoes',   'Conceder permissões',   'Marcar o que os outros usuários podem fazer.',     'administracao', null, false, 31),
  ('admin.atribuicoes.gerenciar', 'Gerenciar atribuições', 'Definir de quem é cada responsabilidade.',         'administracao', null, false, 32)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem;

-- ---------------------------------------------------------------------
-- Permissões concedidas
-- ---------------------------------------------------------------------
create table if not exists public.usuario_permissoes (
  usuario_id    uuid not null references public.profiles (id) on delete cascade,
  chave         text not null references public.permissoes_catalogo (chave) on delete cascade,
  concedido_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (usuario_id, chave)
);

create index if not exists usuario_permissoes_usuario_idx on public.usuario_permissoes (usuario_id);

-- ---------------------------------------------------------------------
-- Colunas que o usuário pode editar.
-- Nenhuma linha = pode editar todas as colunas liberadas para o time dele.
-- ---------------------------------------------------------------------
create table if not exists public.usuario_colunas (
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  tabela     text not null default 'legalizacao_empresas',
  coluna     text not null,
  created_at timestamptz not null default now(),
  primary key (usuario_id, tabela, coluna)
);

create index if not exists usuario_colunas_usuario_idx on public.usuario_colunas (usuario_id, tabela);

-- ---------------------------------------------------------------------
-- Blindagem: permissão confidencial só existe para admin
-- ---------------------------------------------------------------------
create or replace function public.proteger_permissoes_de_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_somente_admin boolean;
  v_role public.app_role;
begin
  select somente_admin into v_somente_admin
  from public.permissoes_catalogo where chave = new.chave;

  if coalesce(v_somente_admin, false) then
    select role into v_role from public.profiles where id = new.usuario_id;
    if v_role is distinct from 'admin' then
      raise exception 'A permissão "%" é exclusiva de administradores.', new.chave
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_permissoes_admin on public.usuario_permissoes;
create trigger trg_proteger_permissoes_admin
  before insert or update on public.usuario_permissoes
  for each row execute function public.proteger_permissoes_de_admin();

-- Rebaixar alguém de admin retira automaticamente as permissões confidenciais.
create or replace function public.limpar_permissoes_ao_rebaixar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    delete from public.usuario_permissoes up
    using public.permissoes_catalogo pc
    where up.chave = pc.chave and pc.somente_admin and up.usuario_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limpar_permissoes_ao_rebaixar on public.profiles;
create trigger trg_limpar_permissoes_ao_rebaixar
  after update of role on public.profiles
  for each row execute function public.limpar_permissoes_ao_rebaixar();

-- ---------------------------------------------------------------------
-- Consulta de permissão
-- ---------------------------------------------------------------------
create or replace function public.tem_permissao(p_chave text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.ativo and (
      p.role = 'admin'
      or exists (
        select 1 from public.usuario_permissoes up
        where up.usuario_id = p.id and up.chave = p_chave
      )
    )
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;

comment on function public.tem_permissao(text) is
  'Admin tem tudo. Os demais, apenas o que foi concedido explicitamente.';

revoke all on function public.tem_permissao(text) from public, anon;
grant execute on function public.tem_permissao(text) to authenticated;

-- Colunas editáveis pelo usuário atual (array vazio = sem restrição de coluna)
create or replace function public.minhas_colunas_editaveis(p_tabela text default 'legalizacao_empresas')
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(uc.coluna order by uc.coluna), '{}')
  from public.usuario_colunas uc
  where uc.usuario_id = (select auth.uid()) and uc.tabela = p_tabela;
$$;

revoke all on function public.minhas_colunas_editaveis(text) from public, anon;
grant execute on function public.minhas_colunas_editaveis(text) to authenticated;

-- ---------------------------------------------------------------------
-- As regras de acesso à base passam a considerar as permissões.
-- Mantêm o comportamento anterior para quem já tinha acesso pelo papel.
-- ---------------------------------------------------------------------
create or replace function public.can_read_legalizacao()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.ativo and (
      p.role = 'admin'
      or exists (select 1 from public.usuario_permissoes up
                 where up.usuario_id = p.id and up.chave = 'tela.legalizacao')
    )
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

create or replace function public.can_write_legalizacao()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.ativo and (
      p.role = 'admin'
      or exists (select 1 from public.usuario_permissoes up
                 where up.usuario_id = p.id
                   and up.chave in ('dados.legalizacao.editar', 'dados.legalizacao.criar'))
    )
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

create or replace function public.can_delete_legalizacao()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.ativo and (
      p.role = 'admin'
      or exists (select 1 from public.usuario_permissoes up
                 where up.usuario_id = p.id and up.chave = 'dados.legalizacao.excluir')
    )
    from public.profiles p where p.id = (select auth.uid())
  ), false);
$$;

-- Quem pode administrar usuários (admin ou delegado)
create or replace function public.pode_gerenciar_usuarios()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('admin.usuarios.gerenciar');
$$;

create or replace function public.pode_conceder_permissoes()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('admin.usuarios.permissoes');
$$;

revoke all on function public.pode_gerenciar_usuarios() from public, anon;
grant execute on function public.pode_gerenciar_usuarios() to authenticated;
revoke all on function public.pode_conceder_permissoes() from public, anon;
grant execute on function public.pode_conceder_permissoes() to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.permissoes_catalogo enable row level security;
alter table public.usuario_permissoes  enable row level security;
alter table public.usuario_colunas     enable row level security;

drop policy if exists permissoes_catalogo_select on public.permissoes_catalogo;
create policy permissoes_catalogo_select on public.permissoes_catalogo
  for select to authenticated using (public.is_active());

drop policy if exists usuario_permissoes_select on public.usuario_permissoes;
create policy usuario_permissoes_select on public.usuario_permissoes
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.pode_gerenciar_usuarios());

drop policy if exists usuario_permissoes_escrita on public.usuario_permissoes;
create policy usuario_permissoes_escrita on public.usuario_permissoes
  for all to authenticated
  using (public.pode_conceder_permissoes())
  with check (public.pode_conceder_permissoes());

drop policy if exists usuario_colunas_select on public.usuario_colunas;
create policy usuario_colunas_select on public.usuario_colunas
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.pode_gerenciar_usuarios());

drop policy if exists usuario_colunas_escrita on public.usuario_colunas;
create policy usuario_colunas_escrita on public.usuario_colunas
  for all to authenticated
  using (public.pode_conceder_permissoes())
  with check (public.pode_conceder_permissoes());

-- Qualquer pessoa do portal enxerga o cadastro dos colegas.
--
-- Isto é deliberado: as atribuições dizem "fulano cuida da coluna Alvará", e
-- foi pedido que qualquer um possa ver de quem é a responsabilidade. Sem esta
-- política o nome do responsável viria em branco para todo mundo que não
-- administra usuários. `profiles` guarda apenas dados de crachá — nome,
-- e-mail, time, função. O que é confidencial (honorários) mora em outra
-- tabela, com FORCE ROW LEVEL SECURITY e política exclusiva de admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_active());

drop policy if exists profiles_update_proprio on public.profiles;
create policy profiles_update_proprio on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.pode_gerenciar_usuarios())
  with check (id = (select auth.uid()) or public.pode_gerenciar_usuarios());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.pode_gerenciar_usuarios());

-- O gatilho que protege role/area/ativo passa a aceitar o delegado também.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_admin() or public.pode_gerenciar_usuarios() then
    -- Só admin promove alguém a admin.
    if new.role = 'admin' and old.role is distinct from 'admin' and not public.is_admin() then
      raise exception 'Apenas administradores podem promover outro usuário a administrador.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.area is distinct from old.area
     or new.ativo is distinct from old.ativo then
    raise exception 'Apenas administradores podem alterar função, área ou status de um usuário.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Semeia as permissões de quem já existe, espelhando o que podia fazer
-- antes desta migration: ninguém ganha nem perde acesso na virada.
-- ---------------------------------------------------------------------
insert into public.usuario_permissoes (usuario_id, chave)
select p.id, c.chave
from public.profiles p
cross join lateral (
  select unnest(
    case
      when p.role = 'admin' then (select array_agg(chave) from public.permissoes_catalogo)
      when p.area = 'legalizacao' then
        array['tela.inicio','tela.legalizacao','tela.referencias','tela.importacoes','tela.atribuicoes',
              'dados.legalizacao.criar','dados.legalizacao.editar','dados.legalizacao.exportar']
        || case when p.role = 'gestor'
                then array['dados.legalizacao.excluir','admin.atribuicoes.gerenciar']
                else '{}'::text[] end
      when p.area = 'fiscal'               then array['tela.inicio','tela.fiscal']
      when p.area = 'contabil'             then array['tela.inicio','tela.contabil']
      when p.area = 'departamento_pessoal' then array['tela.inicio','tela.dp']
      when p.area = 'administracao'        then array['tela.inicio','tela.dashboard','tela.legalizacao',
                                                      'tela.referencias','tela.importacoes','tela.atribuicoes']
      else array['tela.inicio']
    end
  ) as chave
) c
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 0011_atribuicoes.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0011 — Atribuições recorrentes
-- ---------------------------------------------------------------------
-- "Fulano, do time de Legalização, é responsável por manter a coluna
--  ALVARÁ de todos os clientes atualizada todo mês."
--
-- Cada atribuição guarda: responsável, colunas sob sua guarda, com que
-- frequência revisar, o próximo prazo e com quantos dias de antecedência
-- avisar. Ao concluir um ciclo o prazo avança sozinho.
-- =====================================================================

do $$ begin
  create type public.periodicidade as enum (
    'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'avulsa'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.atribuicoes (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  descricao         text,
  responsavel_id    uuid not null references public.profiles (id) on delete cascade,
  area              public.app_area not null default 'legalizacao',
  tabela            text not null default 'legalizacao_empresas',
  -- Colunas sob responsabilidade. Vazio = a linha inteira.
  colunas           text[] not null default '{}',
  periodicidade     public.periodicidade not null default 'mensal',
  proximo_prazo     date not null default (current_date + 30),
  alerta_dias_antes integer not null default 5,
  ativa             boolean not null default true,
  criado_por        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint atribuicoes_titulo_nao_vazio check (length(btrim(titulo)) > 0),
  constraint atribuicoes_alerta_valido check (alerta_dias_antes between 0 and 90)
);

comment on table public.atribuicoes is
  'Responsabilidades recorrentes: quem cuida de quais colunas e com que frequência.';

create index if not exists atribuicoes_responsavel_idx on public.atribuicoes (responsavel_id);
create index if not exists atribuicoes_prazo_idx on public.atribuicoes (proximo_prazo) where ativa;
create index if not exists atribuicoes_area_idx on public.atribuicoes (area);

drop trigger if exists trg_atribuicoes_updated_at on public.atribuicoes;
create trigger trg_atribuicoes_updated_at
  before update on public.atribuicoes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Histórico de ciclos concluídos
-- ---------------------------------------------------------------------
create table if not exists public.atribuicao_execucoes (
  id             uuid primary key default gen_random_uuid(),
  atribuicao_id  uuid not null references public.atribuicoes (id) on delete cascade,
  competencia    date not null,               -- o prazo daquele ciclo
  concluida_em   timestamptz not null default now(),
  concluida_por  uuid references public.profiles (id) on delete set null,
  observacao     text,
  constraint atribuicao_execucoes_unica unique (atribuicao_id, competencia)
);

create index if not exists atribuicao_execucoes_atribuicao_idx
  on public.atribuicao_execucoes (atribuicao_id, competencia desc);

-- ---------------------------------------------------------------------
-- Avanço do prazo conforme a periodicidade
-- ---------------------------------------------------------------------
create or replace function public.proximo_prazo_apos(p_base date, p_periodicidade public.periodicidade)
returns date
language sql immutable set search_path = ''
as $$
  select case p_periodicidade
    when 'semanal'    then p_base + interval '7 days'
    when 'quinzenal'  then p_base + interval '15 days'
    when 'mensal'     then p_base + interval '1 month'
    when 'bimestral'  then p_base + interval '2 months'
    when 'trimestral' then p_base + interval '3 months'
    when 'semestral'  then p_base + interval '6 months'
    when 'anual'      then p_base + interval '1 year'
    else p_base
  end::date;
$$;

revoke all on function public.proximo_prazo_apos(date, public.periodicidade) from public, anon;
grant execute on function public.proximo_prazo_apos(date, public.periodicidade) to authenticated;

/**
 * Marca o ciclo atual como concluído e adianta o prazo.
 * Só o responsável, um admin ou quem gerencia atribuições pode chamar.
 */
create or replace function public.concluir_atribuicao(p_atribuicao uuid, p_observacao text default null)
returns public.atribuicoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_atr public.atribuicoes;
  v_uid uuid := (select auth.uid());
begin
  select * into v_atr from public.atribuicoes where id = p_atribuicao;
  if not found then
    raise exception 'Atribuição não encontrada.' using errcode = 'P0002';
  end if;

  if v_atr.responsavel_id <> v_uid
     and not public.is_admin()
     and not public.tem_permissao('admin.atribuicoes.gerenciar') then
    raise exception 'Somente o responsável pode concluir esta atribuição.' using errcode = '42501';
  end if;

  insert into public.atribuicao_execucoes (atribuicao_id, competencia, concluida_por, observacao)
  values (p_atribuicao, v_atr.proximo_prazo, v_uid, p_observacao)
  on conflict (atribuicao_id, competencia) do update
    set concluida_em = now(), concluida_por = excluded.concluida_por, observacao = excluded.observacao;

  -- Atribuição avulsa não se repete: encerra ao ser concluída.
  if v_atr.periodicidade = 'avulsa' then
    update public.atribuicoes set ativa = false where id = p_atribuicao returning * into v_atr;
  else
    update public.atribuicoes
    set proximo_prazo = public.proximo_prazo_apos(
          greatest(v_atr.proximo_prazo, current_date), v_atr.periodicidade)
    where id = p_atribuicao
    returning * into v_atr;
  end if;

  return v_atr;
end;
$$;

revoke all on function public.concluir_atribuicao(uuid, text) from public, anon;
grant execute on function public.concluir_atribuicao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Visão do responsável: o que vence, o que atrasou
-- ---------------------------------------------------------------------
create or replace function public.minhas_atribuicoes()
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(linha order by (linha ->> 'proximo_prazo')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', a.id,
      'titulo', a.titulo,
      'descricao', a.descricao,
      'colunas', a.colunas,
      'periodicidade', a.periodicidade,
      'proximo_prazo', a.proximo_prazo,
      'alerta_dias_antes', a.alerta_dias_antes,
      'dias_restantes', (a.proximo_prazo - current_date),
      'situacao', case
        when a.proximo_prazo < current_date then 'atrasada'
        when a.proximo_prazo - current_date <= a.alerta_dias_antes then 'proxima'
        else 'em_dia'
      end,
      'ultima_conclusao', (
        select max(e.concluida_em) from public.atribuicao_execucoes e where e.atribuicao_id = a.id
      )
    ) as linha
    from public.atribuicoes a
    where a.ativa and a.responsavel_id = (select auth.uid())
  ) x;
$$;

revoke all on function public.minhas_atribuicoes() from public, anon;
grant execute on function public.minhas_atribuicoes() to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.atribuicoes         enable row level security;
alter table public.atribuicao_execucoes enable row level security;

-- Todo mundo do portal enxerga as atribuições: saber "de quem é isso"
-- foi pedido explicitamente. Editar é que exige permissão.
drop policy if exists atribuicoes_select on public.atribuicoes;
create policy atribuicoes_select on public.atribuicoes
  for select to authenticated using (public.is_active());

drop policy if exists atribuicoes_escrita on public.atribuicoes;
create policy atribuicoes_escrita on public.atribuicoes
  for all to authenticated
  using (public.tem_permissao('admin.atribuicoes.gerenciar'))
  with check (public.tem_permissao('admin.atribuicoes.gerenciar'));

drop policy if exists atribuicao_execucoes_select on public.atribuicao_execucoes;
create policy atribuicao_execucoes_select on public.atribuicao_execucoes
  for select to authenticated using (public.is_active());

-- Gravação apenas via concluir_atribuicao() (SECURITY DEFINER), que confere
-- se quem chamou é o responsável.
drop policy if exists atribuicao_execucoes_gestor on public.atribuicao_execucoes;
create policy atribuicao_execucoes_gestor on public.atribuicao_execucoes
  for all to authenticated
  using (public.tem_permissao('admin.atribuicoes.gerenciar'))
  with check (public.tem_permissao('admin.atribuicoes.gerenciar'));

-- ---------------------------------------------------------------------
-- Auditoria também para as novas tabelas
-- ---------------------------------------------------------------------
drop trigger if exists trg_audit_atribuicoes on public.atribuicoes;
create trigger trg_audit_atribuicoes
  after insert or update or delete on public.atribuicoes
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_audit_usuario_permissoes on public.usuario_permissoes;
create trigger trg_audit_usuario_permissoes
  after insert or delete on public.usuario_permissoes
  for each row execute function public.registrar_auditoria();


-- ---------------------------------------------------------------------
-- 0012_colunas_por_usuario.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0012 — Restrição de colunas aplicada no banco
-- ---------------------------------------------------------------------
-- A migration 0010 criou `usuario_colunas` e a função de leitura
-- `minhas_colunas_editaveis()`, mas nada impedia a escrita: a restrição
-- vivia só na interface. RLS não sabe distinguir coluna, então a regra
-- precisa de um gatilho.
--
-- Regra: se o usuário tem colunas atribuídas, ele altera SOMENTE essas.
-- Lista vazia continua significando "sem restrição" — assim ninguém fica
-- travado por engano, e o time inteiro segue podendo editar a planilha,
-- como foi pedido.
-- =====================================================================

/**
 * Colunas da base geral que um usuário comum pode alterar.
 * Espelha `COLUNAS_GERAIS.filter(c => c.editavel)` em `src/lib/colunas.ts`.
 * As demais (chave_identificacao, cnpj_valido, origem, updated_by…) são
 * mantidas por gatilho e ficam fora da conferência.
 */
create or replace function public.colunas_editaveis_legalizacao()
returns text[]
language sql immutable set search_path = ''
as $$
  select array[
    'razao_social', 'cnpj', 'codigo', 'cidade', 'data_inicio', 'status',
    'tributacao', 'tipo', 'seguimento', 'socio', 'estabelecido',
    'inscricao_municipal', 'alvara', 'avcb_clcb', 'avcb_clcb_validade',
    'lta', 'cnes', 'cetesb', 'amlurb_tx_lixo', 'vigilancia_sanitaria',
    'vigilancia_sanitaria_validade', 'extramuros', 'responsavel_tecnico',
    'profissional', 'orgao', 'validade', 'validade_data', 'observacoes',
    'necessita_revisao'
  ]::text[];
$$;

revoke all on function public.colunas_editaveis_legalizacao() from public, anon;
grant execute on function public.colunas_editaveis_legalizacao() to authenticated;

create or replace function public.aplicar_colunas_permitidas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitidas text[];
  v_antes      jsonb := to_jsonb(old);
  v_depois     jsonb := to_jsonb(new);
  v_campo      text;
  v_bloqueadas text[] := '{}';
begin
  -- Sem sessão (importação via service_role, seeds, manutenção): não restringe.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Admin altera qualquer coluna, sempre.
  if public.is_admin() then
    return new;
  end if;

  select coalesce(array_agg(uc.coluna), '{}')
    into v_permitidas
  from public.usuario_colunas uc
  where uc.usuario_id = (select auth.uid())
    and uc.tabela = 'legalizacao_empresas';

  -- Sem atribuição de coluna = pode editar tudo o que a RLS já permitiu.
  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    return new;
  end if;

  foreach v_campo in array public.colunas_editaveis_legalizacao() loop
    if (v_antes -> v_campo) is distinct from (v_depois -> v_campo)
       and not (v_campo = any (v_permitidas)) then
      v_bloqueadas := v_bloqueadas || v_campo;
    end if;
  end loop;

  if coalesce(array_length(v_bloqueadas, 1), 0) > 0 then
    raise exception
      'Você não tem atribuição para alterar: %. Suas colunas são: %.',
      array_to_string(v_bloqueadas, ', '),
      array_to_string(v_permitidas, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.aplicar_colunas_permitidas() from public, anon, authenticated;

comment on function public.aplicar_colunas_permitidas() is
  'Gatilho: barra alterações fora das colunas atribuídas ao usuário (usuario_colunas).';

-- O nome começa com "zz" de propósito: gatilhos BEFORE disparam em ordem
-- alfabética, e este precisa ver a linha já normalizada pelos anteriores.
drop trigger if exists trg_zz_colunas_permitidas on public.legalizacao_empresas;
create trigger trg_zz_colunas_permitidas
  before update on public.legalizacao_empresas
  for each row execute function public.aplicar_colunas_permitidas();


-- ---------------------------------------------------------------------
-- 0013_permitir_manutencao_sem_sessao.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0013 — Manutenção de perfil sem sessão de usuário
-- ---------------------------------------------------------------------
-- `protect_profile_privileges` recusava qualquer alteração de role/area/
-- ativo quando `auth.uid()` era nulo. Parecia conservador, mas quebrava o
-- caminho legítimo de criação de usuário:
--
--   1. a rota POST /api/admin/usuarios chama admin.auth.admin.createUser();
--   2. o gatilho handle_new_user já cria a linha em `profiles`;
--   3. a rota faz `upsert` para garantir nome/time/função — e o upsert vira
--      UPDATE, porque a linha existe;
--   4. esse UPDATE roda com a service_role, sem `auth.uid()`, e o gatilho
--      levantava 42501. A rota então apagava o usuário do Auth e devolvia
--      "Falha ao criar o perfil".
--
-- Chegar até aqui exige a service_role, que nunca sai do servidor. Quem
-- tem essa chave já pode alterar qualquer linha de qualquer tabela — o
-- gatilho não estava protegendo nada nesse caminho, apenas atrapalhando.
-- A proteção que importa continua intacta: para QUALQUER sessão de usuário
-- (`auth.uid()` presente) as regras seguem exatamente as mesmas.
-- =====================================================================

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Sem sessão de usuário: service_role, seed ou manutenção pelo SQL Editor.
  -- A barreira desse caminho é a posse da chave, não este gatilho.
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.is_admin() or public.pode_gerenciar_usuarios() then
    -- Só admin promove alguém a admin.
    if new.role = 'admin' and old.role is distinct from 'admin' and not public.is_admin() then
      raise exception 'Apenas administradores podem promover outro usuário a administrador.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.area is distinct from old.area
     or new.ativo is distinct from old.ativo then
    raise exception 'Apenas administradores podem alterar função, área ou status de um usuário.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.protect_profile_privileges() is
  'Impede que um usuário mude a própria função/área/situação. Escrita sem sessão (service_role) passa: quem tem a chave já contorna a RLS inteira.';


-- ---------------------------------------------------------------------
-- 0014_revogar_gatilhos_novos.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- PortalMPC — 0014 — Fecha a superfície de RPC das funções novas
-- ---------------------------------------------------------------------
-- A migration 0008 estabeleceu a regra: nenhuma função de gatilho fica
-- executável por `anon` ou `authenticated`, porque o PostgREST publica
-- toda função de `public` como /rest/v1/rpc/<nome>.
--
-- As duas funções de gatilho criadas na 0010 nasceram com o EXECUTE que o
-- PostgreSQL concede a PUBLIC por padrão, e o linter de segurança do
-- Supabase voltou a apontá-las. Chamá-las fora de um gatilho só produziria
-- "trigger functions can only be called as triggers", mas manter a
-- superfície fechada é o padrão do projeto — e um alerta que se aceita
-- hoje é um alerta que se ignora amanhã.
--
-- Revogar EXECUTE aqui não afeta os gatilhos: o PostgreSQL não exige esse
-- privilégio de quem dispara o DML.
-- =====================================================================

revoke all on function public.proteger_permissoes_de_admin()
  from public, anon, authenticated;

revoke all on function public.limpar_permissoes_ao_rebaixar()
  from public, anon, authenticated;


commit;
