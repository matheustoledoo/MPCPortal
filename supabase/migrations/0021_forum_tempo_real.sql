-- =====================================================================
-- PortalMPC — 0021 — Fórum em tempo real
-- ---------------------------------------------------------------------
-- O feed avisa "N posts novos" e a conversa recebe respostas sem
-- recarregar. O Realtime respeita a RLS de cada assinante: quem não tem a
-- tela "Fórum da Meta" não recebe nada.
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'forum_posts') then
    alter publication supabase_realtime add table public.forum_posts;
  end if;
end $$;
