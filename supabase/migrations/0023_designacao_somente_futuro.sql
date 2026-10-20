-- =====================================================================
-- PortalMPC — 0023 — Designação no calendário: só o que ainda vai vencer
-- ---------------------------------------------------------------------
-- "Se for colocado algo no nome daquela pessoa, apareça" continua valendo,
-- mas um compromisso com data no passado não gera notificação. Sem isso, a
-- importação do histórico do Portal Meta Plano (Apps Script) encheria o
-- sino de cada colaborador com meses de compromissos já encerrados.
-- =====================================================================

create or replace function public.notificar_designacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_ator_nome text := coalesce((select nome from public.profiles where id = (select auth.uid())), 'O portal');
begin
  if tg_table_name = 'legalizacao_processos' then
    if new.responsavel_id is not null
       and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
      perform public.notificar(
        new.responsavel_id, 'processo', 'processo_designado',
        'Processo no seu nome: ' || new.empresa,
        concat_ws(' · ', v_ator_nome || ' designou para você', new.tipo_servico, new.orgao,
                  case when new.prazo is not null then 'prazo ' || to_char(new.prazo, 'DD/MM/YYYY') end),
        '/controle-legalizacao?processo=' || new.id, 'normal', v_ator,
        'legalizacao_processos', new.id::text, new.prazo, null, '{}'::jsonb, false);
    elsif tg_op = 'UPDATE' and new.responsavel_id is not null
          and old.status is distinct from new.status then
      perform public.notificar(
        new.responsavel_id, 'processo', 'processo_status',
        new.empresa || ': status mudou para ' || new.status,
        v_ator_nome || ' alterou o status (antes: ' || coalesce(old.status, '—') || ').',
        '/controle-legalizacao?processo=' || new.id, 'baixa', v_ator,
        'legalizacao_processos', new.id::text, new.prazo, 'status:processo:' || new.id, '{}'::jsonb, true);
    end if;

  elsif tg_table_name = 'atribuicoes' then
    if new.responsavel_id is not null and new.ativa
       and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
      perform public.notificar(
        new.responsavel_id, 'atribuicao', 'atribuicao_designada',
        'Nova responsabilidade: ' || new.titulo,
        v_ator_nome || ' atribuiu a você. Primeiro prazo: ' || to_char(new.proximo_prazo, 'DD/MM/YYYY') || '.',
        '/atribuicoes', 'normal', v_ator, 'atribuicoes', new.id::text, new.proximo_prazo,
        null, '{}'::jsonb, false);
    end if;

  elsif tg_table_name = 'calendario_eventos' then
    -- Compromisso que já passou não vira aviso (importação do app antigo e
    -- ajustes de histórico não enchem o sino de ninguém). O que se repete
    -- continua valendo daqui para frente, então avisa.
    if new.responsavel_id is not null
       and (new.data >= current_date or new.recorrencia <> 'nenhuma')
       and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
      perform public.notificar(
        new.responsavel_id, 'calendario', 'calendario_designado',
        case when new.tipo = 'Demanda' then 'Demanda designada para você: '
             when new.tipo like 'Reunião%' then new.tipo || ': '
             else 'Compromisso no seu nome: ' end || new.titulo,
        concat_ws(' · ', v_ator_nome || ' designou',
                  case when new.data_inicio is not null
                       then 'de ' || to_char(new.data_inicio, 'DD/MM') || ' a ' || to_char(new.data, 'DD/MM/YYYY')
                       else 'prazo ' || to_char(new.data, 'DD/MM/YYYY') end,
                  new.departamento),
        '/calendario?data=' || to_char(new.data, 'YYYY-MM-DD') || '&item=e:' || new.id || ':' || to_char(new.data, 'YYYY-MM-DD'),
        'normal', v_ator, 'calendario_eventos', new.id, new.data, null, '{}'::jsonb, false);
    end if;

  elsif tg_table_name = 'calendario_regras' then
    if new.responsavel_id is not null
       and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
      perform public.notificar(
        new.responsavel_id, 'calendario', 'calendario_regra_designada',
        'Obrigação fixa no seu nome: ' || new.nome,
        v_ator_nome || ' definiu você como responsável (' || new.departamento || ').',
        '/calendario?aba=regras', 'normal', v_ator, 'calendario_regras', new.id, null,
        null, '{}'::jsonb, false);
    end if;

  elsif tg_table_name = 'legalizacao_empresas' then
    if new.responsavel_id is not null
       and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
      perform public.notificar(
        new.responsavel_id, 'atribuicao', 'empresa_designada',
        'Empresa sob sua responsabilidade: ' || new.razao_social,
        v_ator_nome || ' definiu você como responsável por esta empresa.',
        '/legalizacao?empresa=' || new.id, 'normal', v_ator, 'legalizacao_empresas', new.id::text,
        null, null, '{}'::jsonb, false);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.notificar_designacao() from public, anon, authenticated;
