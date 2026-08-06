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
