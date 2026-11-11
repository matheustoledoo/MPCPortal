-- =====================================================================
-- PortalMPC — 0032: participante do chat só altera a própria leitura
--
-- A política de UPDATE de `chat_participantes` deixa cada pessoa mexer na
-- própria linha, para marcar a conversa como lida. Sem esta trava, a mesma
-- política permitiria, por chamada direta à API, virar "admin" do grupo
-- (`papel`) ou voltar a um grupo de onde foi removida (`saiu_em`).
--
-- Entrar, sair e mudar de papel continuam passando só pelas funções
-- `chat_gerenciar_participante`, `chat_criar_grupo` e
-- `chat_grupo_departamento`, que conferem quem pode fazer o quê.
-- =====================================================================

create or replace function public.chat_participante_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Chamada direta do usuário (as funções do chat rodam como dono do banco).
  if current_user = 'authenticated' then
    new.conversa_id := old.conversa_id;
    new.usuario_id := old.usuario_id;
    new.papel := old.papel;
    new.entrou_em := old.entrou_em;
    new.saiu_em := old.saiu_em;
  end if;
  return new;
end;
$$;

revoke all on function public.chat_participante_proteger() from public, anon, authenticated;

create or replace trigger trg_chat_participante_proteger
  before update on public.chat_participantes
  for each row execute function public.chat_participante_proteger();
