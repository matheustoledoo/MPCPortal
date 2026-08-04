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
