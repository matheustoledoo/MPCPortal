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
