-- =====================================================================
-- PortalMPC — migrations pendentes, prontas para o SQL Editor
-- Gerado em 2026-08-06T15:05:59.206Z
-- Inclui: 0010_permissoes_modulares.sql, 0011_atribuicoes.sql, 0012_colunas_por_usuario.sql
--
-- Cole tudo de uma vez no SQL Editor do Supabase e execute.
-- É seguro rodar mais de uma vez.
-- =====================================================================

begin;


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


commit;
