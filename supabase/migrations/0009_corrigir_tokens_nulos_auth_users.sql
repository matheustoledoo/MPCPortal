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
