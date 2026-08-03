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
