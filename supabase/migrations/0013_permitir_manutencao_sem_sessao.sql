-- =====================================================================
-- PortalMPC — 0013 — Manutenção de perfil sem sessão de usuário
-- ---------------------------------------------------------------------
-- `protect_profile_privileges` recusava qualquer alteração de role/area/
-- ativo quando `auth.uid()` era nulo. Parecia conservador, mas quebrava o
-- caminho legítimo de criação de usuário:
--
--   1. a rota POST /api/admin/usuarios chama admin.auth.admin.createUser();
--   2. o gatilho handle_new_user já cria a linha em `profiles`;
--   3. a rota faz `upsert` para garantir nome/time/função — e o upsert vira
--      UPDATE, porque a linha existe;
--   4. esse UPDATE roda com a service_role, sem `auth.uid()`, e o gatilho
--      levantava 42501. A rota então apagava o usuário do Auth e devolvia
--      "Falha ao criar o perfil".
--
-- Chegar até aqui exige a service_role, que nunca sai do servidor. Quem
-- tem essa chave já pode alterar qualquer linha de qualquer tabela — o
-- gatilho não estava protegendo nada nesse caminho, apenas atrapalhando.
-- A proteção que importa continua intacta: para QUALQUER sessão de usuário
-- (`auth.uid()` presente) as regras seguem exatamente as mesmas.
-- =====================================================================

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Sem sessão de usuário: service_role, seed ou manutenção pelo SQL Editor.
  -- A barreira desse caminho é a posse da chave, não este gatilho.
  if (select auth.uid()) is null then
    return new;
  end if;

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

comment on function public.protect_profile_privileges() is
  'Impede que um usuário mude a própria função/área/situação. Escrita sem sessão (service_role) passa: quem tem a chave já contorna a RLS inteira.';
