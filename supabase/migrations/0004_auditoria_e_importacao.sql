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
