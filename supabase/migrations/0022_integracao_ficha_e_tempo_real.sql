-- =====================================================================
-- PortalMPC — 0022 — Integração: ficha mesclada; tempo real do calendário
-- ---------------------------------------------------------------------
-- A ficha do cliente é comum a todos os departamentos e cada um a edita
-- durante a própria reunião. Gravar o JSON inteiro faria o último a salvar
-- apagar o que o outro acabou de digitar; o app antigo mandava só os campos
-- alterados (merge do Firestore). Esta função faz o mesmo no Postgres.
--
-- SECURITY INVOKER: a RLS de `integracoes` continua valendo — só quem tem a
-- tela "Integração de Clientes" consegue atualizar.
-- =====================================================================

create or replace function public.integracao_atualizar_ficha(p_id text, p_campos jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  update public.integracoes
     set ficha = coalesce(ficha, '{}'::jsonb) || coalesce(p_campos, '{}'::jsonb)
   where id = p_id
     and jsonb_typeof(coalesce(p_campos, '{}'::jsonb)) = 'object'
  returning ficha;
$$;

revoke all on function public.integracao_atualizar_ficha(text, jsonb) from public, anon;
grant execute on function public.integracao_atualizar_ficha(text, jsonb) to authenticated;

-- Tempo real: "Passagem para os departamentos" atualiza sozinha quando
-- outro departamento finaliza, e o calendário mostra na hora o que um
-- colega concluiu ou cadastrou. O Realtime respeita a RLS de cada assinante.
do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['integracao_departamentos', 'integracoes',
                                    'calendario_conclusoes', 'calendario_eventos', 'calendario_regras'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end $$;
