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
