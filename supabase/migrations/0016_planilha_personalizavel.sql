-- =====================================================================
-- PortalMPC — 0016 — Planilha personalizável, importação e ajustes
-- ---------------------------------------------------------------------
-- O que muda:
--   1. Colunas criadas pela equipe (inclusive com fórmula), nas três
--      planilhas: Legalização, ADM e Controle Legalização. Os valores ficam
--      em `campos_extras` (jsonb) da própria linha, então a RLS de cada
--      tabela continua valendo sem nenhuma regra nova.
--   2. Preferências por usuário (colunas visíveis, ordem, larguras).
--   3. Importação de planilhas: permissão própria e a possibilidade de
--      "adicionar mesmo assim" uma empresa cujo CNPJ já existe.
--   4. A tela Importações sai do portal; o Controle Geral vira
--      Controle Legalização.
--
-- Escrito sem DROP/DELETE de propósito: tudo aqui é aditivo e pode ser
-- reaplicado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Utilitário: o "hoje" do escritório, não o do servidor (UTC)
-- ---------------------------------------------------------------------
create or replace function public.hoje_brasil()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

revoke all on function public.hoje_brasil() from public, anon;
grant execute on function public.hoje_brasil() to authenticated;

-- ---------------------------------------------------------------------
-- 1. Catálogo de permissões
-- ---------------------------------------------------------------------
alter table public.permissoes_catalogo
  add column if not exists ativo boolean not null default true;

comment on column public.permissoes_catalogo.ativo is
  'Permissão aposentada continua no catálogo (histórico), mas some da tela de usuários.';

update public.permissoes_catalogo
set ativo = false,
    descricao = 'Tela removida em out/2026. O relatório da carga inicial segue em docs/RELATORIO-IMPORTACAO.md.'
where chave = 'tela.importacoes';

update public.permissoes_catalogo
set rotulo = 'Controle Legalização',
    rota = '/controle-legalizacao',
    descricao = 'Processos de legalização em andamento nos órgãos (antigo Controle Geral).'
where chave = 'tela.processos';

insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('dados.legalizacao.importar',   'Importar planilhas',     'Trazer empresas de qualquer planilha Excel ou CSV para a base.', 'dados', null, false, 40),
  ('dados.planilha.colunas',       'Personalizar colunas',   'Criar, remover e ocultar colunas das planilhas, inclusive com fórmula.', 'dados', null, false, 41),
  ('dados.administrativo.importar','Importar dados ADM',     'Importar honorários e condições por planilha. CONFIDENCIAL.', 'dados', null, true, 42)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem;

-- Quem já cadastra empresas passa a poder importar; quem é gestor e edita
-- a base passa a poder mexer nas colunas.
insert into public.usuario_permissoes (usuario_id, chave)
select up.usuario_id, 'dados.legalizacao.importar'
from public.usuario_permissoes up
where up.chave = 'dados.legalizacao.criar'
on conflict do nothing;

insert into public.usuario_permissoes (usuario_id, chave)
select up.usuario_id, 'dados.planilha.colunas'
from public.usuario_permissoes up
join public.profiles p on p.id = up.usuario_id
where up.chave = 'dados.legalizacao.editar' and p.role = 'gestor'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Valores das colunas criadas pela equipe
-- ---------------------------------------------------------------------
alter table public.legalizacao_empresas
  add column if not exists campos_extras jsonb not null default '{}'::jsonb;
alter table public.legalizacao_dados_administrativos
  add column if not exists campos_extras jsonb not null default '{}'::jsonb;
alter table public.legalizacao_processos
  add column if not exists campos_extras jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'legalizacao_empresas_extras_objeto') then
    alter table public.legalizacao_empresas
      add constraint legalizacao_empresas_extras_objeto check (jsonb_typeof(campos_extras) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'legalizacao_dados_adm_extras_objeto') then
    alter table public.legalizacao_dados_administrativos
      add constraint legalizacao_dados_adm_extras_objeto check (jsonb_typeof(campos_extras) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'legalizacao_processos_extras_objeto') then
    alter table public.legalizacao_processos
      add constraint legalizacao_processos_extras_objeto check (jsonb_typeof(campos_extras) = 'object');
  end if;
end $$;

comment on column public.legalizacao_empresas.campos_extras is
  'Valores das colunas criadas pela equipe (planilha_colunas). Chave = planilha_colunas.campo.';
comment on column public.legalizacao_processos.campos_extras is
  'Campos opcionais do processo: colunas da equipe e pares "rótulo → valor" livres.';

-- ---------------------------------------------------------------------
-- 3. Definição das colunas
-- ---------------------------------------------------------------------
create table if not exists public.planilha_colunas (
  id            uuid primary key default gen_random_uuid(),
  tabela        text not null,
  campo         text not null,
  -- false = ajuste de uma coluna nativa (ocultar para todos, renomear)
  personalizada boolean not null default true,
  rotulo        text not null,
  tipo          text not null default 'texto',
  -- Expressão no estilo do Excel, ex.: =SE(DIAS([Validade AVCB])<30;"Renovar";"OK")
  formula       text,
  -- Como exibir o resultado da fórmula
  formato       text not null default 'texto',
  opcoes        text[] not null default '{}',
  largura       integer not null default 160,
  ordem         integer not null default 0,
  oculta        boolean not null default false,
  descricao     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by    uuid references public.profiles (id) on delete set null,

  constraint planilha_colunas_unica unique (tabela, campo),
  constraint planilha_colunas_tabela check (
    tabela in ('legalizacao_empresas', 'legalizacao_dados_administrativos', 'legalizacao_processos')),
  constraint planilha_colunas_campo check (campo ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint planilha_colunas_rotulo check (length(btrim(rotulo)) between 1 and 80),
  constraint planilha_colunas_tipo check (
    tipo in ('texto', 'longo', 'numero', 'moeda', 'data', 'status', 'booleano', 'formula')),
  constraint planilha_colunas_formato check (
    formato in ('texto', 'numero', 'moeda', 'data', 'status', 'booleano')),
  constraint planilha_colunas_largura check (largura between 60 and 640),
  constraint planilha_colunas_formula check (
    tipo <> 'formula' or length(btrim(coalesce(formula, ''))) > 1)
);

comment on table public.planilha_colunas is
  'Colunas criadas pela equipe nas planilhas do portal e ajustes das colunas nativas.';

create index if not exists planilha_colunas_tabela_idx on public.planilha_colunas (tabela, ordem);

create or replace function public.planilha_colunas_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.rotulo := btrim(new.rotulo);
  if new.tipo <> 'formula' then new.formula := null; end if;
  return new;
end;
$$;

revoke all on function public.planilha_colunas_carimbo() from public, anon, authenticated;

create or replace trigger trg_planilha_colunas_carimbo
  before insert or update on public.planilha_colunas
  for each row execute function public.planilha_colunas_carimbo();

create or replace trigger trg_audit_planilha_colunas
  after insert or update or delete on public.planilha_colunas
  for each row execute function public.registrar_auditoria();

alter table public.planilha_colunas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'planilha_colunas' and policyname = 'planilha_colunas_select') then
    create policy planilha_colunas_select on public.planilha_colunas
      for select to authenticated
      using (public.is_active() and (tabela <> 'legalizacao_dados_administrativos' or public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'planilha_colunas' and policyname = 'planilha_colunas_escrita') then
    create policy planilha_colunas_escrita on public.planilha_colunas
      for all to authenticated
      using (public.tem_permissao('dados.planilha.colunas')
             and (tabela <> 'legalizacao_dados_administrativos' or public.is_admin()))
      with check (public.tem_permissao('dados.planilha.colunas')
             and (tabela <> 'legalizacao_dados_administrativos' or public.is_admin()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. A restrição de colunas passa a valer também para as colunas novas
-- ---------------------------------------------------------------------
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
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  select coalesce(array_agg(uc.coluna), '{}')
    into v_permitidas
  from public.usuario_colunas uc
  where uc.usuario_id = (select auth.uid())
    and uc.tabela = 'legalizacao_empresas';

  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    return new;
  end if;

  foreach v_campo in array public.colunas_editaveis_legalizacao() loop
    if (v_antes -> v_campo) is distinct from (v_depois -> v_campo)
       and not (v_campo = any (v_permitidas)) then
      v_bloqueadas := v_bloqueadas || v_campo;
    end if;
  end loop;

  -- Colunas criadas pela equipe: a chave dentro de campos_extras é o nome
  -- da coluna, e é ela que precisa estar na lista do usuário.
  if (v_antes -> 'campos_extras') is distinct from (v_depois -> 'campos_extras') then
    for v_campo in
      select k from jsonb_object_keys(coalesce(v_antes -> 'campos_extras', '{}'::jsonb)) as k
      union
      select k from jsonb_object_keys(coalesce(v_depois -> 'campos_extras', '{}'::jsonb)) as k
    loop
      if (v_antes -> 'campos_extras' -> v_campo) is distinct from (v_depois -> 'campos_extras' -> v_campo)
         and not (v_campo = any (v_permitidas)) then
        v_bloqueadas := v_bloqueadas || v_campo;
      end if;
    end loop;
  end if;

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

-- ---------------------------------------------------------------------
-- 5. CNPJ repetido: bloqueado, a não ser que a importação peça
-- ---------------------------------------------------------------------
-- A planilha que a equipe traz pode ter a mesma empresa duas vezes de
-- propósito (filial lançada com o CNPJ da matriz, cadastro antigo). A
-- importação oferece "adicionar mesmo assim"; nesse caso a chave vem como
-- "<cnpj>#<n>" e a linha nasce marcada para revisão. Fora disso, o CNPJ
-- continua único — agora garantido por gatilho, que sabe a diferença.
alter table public.legalizacao_empresas
  drop constraint if exists legalizacao_empresas_cnpj_unico;

create index if not exists legalizacao_empresas_cnpj_idx on public.legalizacao_empresas (cnpj);

create or replace function public.legalizacao_empresas_duplicidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente text;
begin
  if new.cnpj is null then
    return new;
  end if;

  -- Duas importações simultâneas com o mesmo CNPJ não passam juntas.
  perform pg_advisory_xact_lock(hashtext('cnpj:' || new.cnpj));

  select e.razao_social into v_existente
  from public.legalizacao_empresas e
  where e.cnpj = new.cnpj and e.id <> new.id
  order by e.created_at
  limit 1;

  if v_existente is null then
    return new;
  end if;

  if new.chave_identificacao like new.cnpj || '#%' then
    new.necessita_revisao := true;
    new.revisao_motivo := coalesce(
      nullif(btrim(new.revisao_motivo), ''),
      'CNPJ repetido: adicionado em duplicidade pela importação (já existia "' || v_existente || '").'
    );
    return new;
  end if;

  raise exception 'Já existe uma empresa cadastrada com este CNPJ (%).', v_existente
    using errcode = '23505';
end;
$$;

revoke all on function public.legalizacao_empresas_duplicidade() from public, anon, authenticated;

-- "w" vem depois de "normalizar": o CNPJ já chega aqui só com dígitos.
create or replace trigger trg_legalizacao_empresas_w_duplicidade
  before insert or update of cnpj, chave_identificacao on public.legalizacao_empresas
  for each row execute function public.legalizacao_empresas_duplicidade();

-- O vínculo automático do processo pelo CNPJ escolhe o cadastro original.
create or replace function public.legalizacao_processos_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cnpj    := nullif(public.cnpj_digitos(new.cnpj), '');
  new.empresa := btrim(new.empresa);

  if new.empresa_id is null and new.cnpj is not null then
    select e.id into new.empresa_id
    from public.legalizacao_empresas e
    where e.cnpj = new.cnpj
    order by (e.chave_identificacao = e.cnpj) desc, e.created_at
    limit 1;
  end if;

  if new.empresa_id is not null then
    select coalesce(nullif(btrim(e.razao_social), ''), new.empresa), coalesce(e.cnpj, new.cnpj)
      into new.empresa, new.cnpj
    from public.legalizacao_empresas e
    where e.id = new.empresa_id;
  end if;

  new.ultima_atualizacao := now();
  new.updated_at         := now();
  new.updated_by         := coalesce((select auth.uid()), new.updated_by);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;

  return new;
end;
$$;

revoke all on function public.legalizacao_processos_normalizar() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Preferências por usuário
-- ---------------------------------------------------------------------
create table if not exists public.usuario_preferencias (
  usuario_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  chave      text not null,
  valor      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, chave),
  constraint usuario_preferencias_chave check (length(chave) between 1 and 120)
);

comment on table public.usuario_preferencias is
  'Ajustes pessoais de tela: colunas visíveis, ordem, larguras, filtros salvos.';

alter table public.usuario_preferencias enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'usuario_preferencias' and policyname = 'usuario_preferencias_proprias') then
    create policy usuario_preferencias_proprias on public.usuario_preferencias
      for all to authenticated
      using (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Vencimentos por mês de qualquer ano (o gráfico do Controle
--    Legalização passa a navegar entre anos e filtrar a tabela)
-- ---------------------------------------------------------------------
create or replace function public.processos_vencimentos_por_mes(p_ano integer default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.pode_ler_processos() then '[]'::jsonb else (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'mes', g.mes,
        'total', coalesce(v.total, 0),
        'abertos', coalesce(v.abertos, 0),
        'atrasados', coalesce(v.atrasados, 0)
      ) order by g.mes),
      '[]'::jsonb)
    from generate_series(1, 12) as g(mes)
    left join (
      select extract(month from prazo)::int as mes,
             count(*) as total,
             count(*) filter (where not public.processo_encerrado(status)) as abertos,
             count(*) filter (where not public.processo_encerrado(status) and prazo < public.hoje_brasil()) as atrasados
      from public.legalizacao_processos
      where prazo is not null
        and extract(year from prazo) = coalesce(p_ano, extract(year from public.hoje_brasil())::int)
      group by 1
    ) v on v.mes = g.mes
  ) end;
$$;

revoke all on function public.processos_vencimentos_por_mes(integer) from public, anon;
grant execute on function public.processos_vencimentos_por_mes(integer) to authenticated;
