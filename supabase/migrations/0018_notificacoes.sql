-- =====================================================================
-- PortalMPC — 0018 — Central de notificações
-- ---------------------------------------------------------------------
-- Um lugar só para tudo que pede a atenção de alguém:
--   * prazos — processos, atribuições, obrigações do calendário e
--     documentos das empresas que estão vencendo ou já venceram;
--   * designações — "foi colocado algo no meu nome";
--   * fórum — posts de quem eu sigo com o sininho ligado, menções,
--     respostas e curtidas (os gatilhos ficam na 0019);
--   * integração de clientes.
--
-- Notificações de prazo são geradas sob demanda por
-- `sincronizar_minhas_notificacoes()`, chamada pelo sininho. Cada uma tem
-- uma chave estável, então chamar de novo não duplica nada — e quando o
-- problema some (processo encerrado, prazo empurrado, obrigação
-- concluída), a notificação se resolve sozinha.
-- =====================================================================

create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.profiles (id) on delete cascade,
  categoria     text not null default 'sistema',
  tipo          text not null,
  titulo        text not null,
  mensagem      text,
  link          text,
  prioridade    text not null default 'normal',
  ator_id       uuid references public.profiles (id) on delete set null,
  origem_tabela text,
  origem_id     text,
  prazo         date,
  -- Deduplicação: a mesma situação atualiza a mesma linha.
  chave         text,
  dados         jsonb not null default '{}'::jsonb,
  lida_em       timestamptz,
  concluida_em  timestamptz,
  arquivada_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint notificacoes_categoria check (
    categoria in ('prazo', 'atribuicao', 'processo', 'calendario', 'forum', 'mencao', 'integracao', 'sistema')),
  constraint notificacoes_prioridade check (prioridade in ('baixa', 'normal', 'alta', 'urgente'))
);

comment on table public.notificacoes is
  'Caixa de notificações de cada usuário. Escrita só pelo banco (gatilhos e funções); o usuário lê, marca e arquiva.';

create unique index if not exists notificacoes_chave_unica
  on public.notificacoes (usuario_id, chave) where chave is not null;
create index if not exists notificacoes_usuario_idx
  on public.notificacoes (usuario_id, created_at desc);
create index if not exists notificacoes_pendentes_idx
  on public.notificacoes (usuario_id) where lida_em is null and arquivada_em is null;

alter table public.notificacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'notificacoes' and policyname = 'notificacoes_select') then
    create policy notificacoes_select on public.notificacoes
      for select to authenticated using (usuario_id = (select auth.uid()));
    create policy notificacoes_update on public.notificacoes
      for update to authenticated
      using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
  end if;
end $$;

-- O dono só mexe no estado da notificação, nunca no conteúdo.
revoke insert, update, delete on public.notificacoes from authenticated;
grant update (lida_em, concluida_em, arquivada_em) on public.notificacoes to authenticated;

-- Preferências: categoria desligada não gera notificação nova.
create table if not exists public.notificacao_preferencias (
  usuario_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  categoria  text not null,
  ativo      boolean not null default true,
  primary key (usuario_id, categoria)
);

alter table public.notificacao_preferencias enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'notificacao_preferencias' and policyname = 'notificacao_preferencias_proprias') then
    create policy notificacao_preferencias_proprias on public.notificacao_preferencias
      for all to authenticated
      using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
  end if;
end $$;

-- Para o sininho atualizar sem recarregar a página.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes') then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Gerar uma notificação
-- ---------------------------------------------------------------------
create or replace function public.notificar(
  p_usuario uuid,
  p_categoria text,
  p_tipo text,
  p_titulo text,
  p_mensagem text default null,
  p_link text default null,
  p_prioridade text default 'normal',
  p_ator uuid default null,
  p_origem_tabela text default null,
  p_origem_id text default null,
  p_prazo date default null,
  p_chave text default null,
  p_dados jsonb default '{}'::jsonb,
  -- true: a mesma chave volta a aparecer como não lida (ex.: mais uma curtida)
  p_reabrir boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_usuario is null then return null; end if;
  -- Ninguém é notificado da própria ação.
  if p_ator is not null and p_ator = p_usuario then return null; end if;
  if not exists (select 1 from public.profiles where id = p_usuario and ativo) then return null; end if;
  if exists (
    select 1 from public.notificacao_preferencias np
    where np.usuario_id = p_usuario and np.categoria = p_categoria and not np.ativo
  ) then
    return null;
  end if;

  if p_chave is null then
    insert into public.notificacoes
      (usuario_id, categoria, tipo, titulo, mensagem, link, prioridade, ator_id,
       origem_tabela, origem_id, prazo, dados)
    values
      (p_usuario, p_categoria, p_tipo, left(p_titulo, 300), left(p_mensagem, 1000), p_link,
       coalesce(p_prioridade, 'normal'), p_ator, p_origem_tabela, p_origem_id, p_prazo,
       coalesce(p_dados, '{}'::jsonb))
    returning id into v_id;
    return v_id;
  end if;

  insert into public.notificacoes as n
    (usuario_id, categoria, tipo, titulo, mensagem, link, prioridade, ator_id,
     origem_tabela, origem_id, prazo, chave, dados)
  values
    (p_usuario, p_categoria, p_tipo, left(p_titulo, 300), left(p_mensagem, 1000), p_link,
     coalesce(p_prioridade, 'normal'), p_ator, p_origem_tabela, p_origem_id, p_prazo, p_chave,
     coalesce(p_dados, '{}'::jsonb))
  on conflict (usuario_id, chave) where chave is not null do update set
    titulo     = excluded.titulo,
    mensagem   = excluded.mensagem,
    link       = excluded.link,
    tipo       = excluded.tipo,
    ator_id    = coalesce(excluded.ator_id, n.ator_id),
    prazo      = excluded.prazo,
    dados      = n.dados || excluded.dados,
    updated_at = now(),
    -- Piorou (de "vence em breve" para "atrasado") ou foi pedido: volta a
    -- chamar atenção, mesmo que já tivesse sido lida ou arquivada.
    lida_em = case
      when p_reabrir or n.prioridade is distinct from excluded.prioridade then null
      else n.lida_em end,
    arquivada_em = case
      when (p_reabrir or n.prioridade is distinct from excluded.prioridade) and n.concluida_em is null then null
      else n.arquivada_em end,
    created_at = case when p_reabrir then now() else n.created_at end,
    prioridade = excluded.prioridade
  returning n.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notificar(uuid, text, text, text, text, text, text, uuid, text, text, date, text, jsonb, boolean)
  from public, anon, authenticated;

comment on function public.notificar(uuid, text, text, text, text, text, text, uuid, text, text, date, text, jsonb, boolean) is
  'Cria (ou atualiza, pela chave) uma notificação. Respeita as preferências e ignora a própria ação.';

-- ---------------------------------------------------------------------
-- Ações do usuário sobre as próprias notificações
-- ---------------------------------------------------------------------
create or replace function public.marcar_notificacoes(p_ids uuid[], p_acao text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd integer;
begin
  if (select auth.uid()) is null then return 0; end if;
  if p_acao not in ('lida', 'nao_lida', 'concluir', 'reabrir', 'arquivar', 'restaurar', 'todas_lidas') then
    raise exception 'Ação inválida: %', p_acao using errcode = '22023';
  end if;

  update public.notificacoes n set
    lida_em = case
      when p_acao in ('lida', 'concluir', 'arquivar', 'todas_lidas') then coalesce(n.lida_em, now())
      when p_acao = 'nao_lida' then null
      else n.lida_em end,
    concluida_em = case
      when p_acao = 'concluir' then coalesce(n.concluida_em, now())
      when p_acao = 'reabrir' then null
      else n.concluida_em end,
    arquivada_em = case
      when p_acao = 'arquivar' then coalesce(n.arquivada_em, now())
      when p_acao in ('restaurar', 'reabrir') then null
      else n.arquivada_em end,
    updated_at = now()
  where n.usuario_id = (select auth.uid())
    and (p_acao = 'todas_lidas' and n.lida_em is null and n.arquivada_em is null
         or p_acao <> 'todas_lidas' and n.id = any (coalesce(p_ids, '{}')));

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.marcar_notificacoes(uuid[], text) from public, anon;
grant execute on function public.marcar_notificacoes(uuid[], text) to authenticated;

create or replace function public.contar_notificacoes()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'nao_lidas', count(*) filter (where lida_em is null),
    'urgentes',  count(*) filter (where lida_em is null and prioridade in ('alta', 'urgente')),
    'prazos',    count(*) filter (where categoria = 'prazo' and concluida_em is null),
    'por_categoria', coalesce((
      select jsonb_object_agg(categoria, n) from (
        select categoria, count(*) n from public.notificacoes
        where usuario_id = (select auth.uid()) and lida_em is null and arquivada_em is null
        group by categoria) c), '{}'::jsonb)
  )
  from public.notificacoes
  where usuario_id = (select auth.uid()) and arquivada_em is null;
$$;

revoke all on function public.contar_notificacoes() from public, anon;
grant execute on function public.contar_notificacoes() to authenticated;

-- ---------------------------------------------------------------------
-- Prazos: gerados sob demanda, resolvidos sozinhos
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_minhas_notificacoes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_hoje  date := public.hoje_brasil();
  v_vivas text[] := '{}';
  v_chave text;
  v_dias  int;
  r record;
begin
  if v_uid is null or not public.is_active() then
    return '{}'::jsonb;
  end if;

  -- 1. Processos do Controle Legalização sob minha responsabilidade
  for r in
    select p.id, p.empresa, p.tipo_servico, p.orgao, p.prazo
    from public.legalizacao_processos p
    where p.responsavel_id = v_uid
      and not public.processo_encerrado(p.status)
      and p.prazo is not null
      and p.prazo <= v_hoje + 3
  loop
    v_dias := r.prazo - v_hoje;
    v_chave := 'prazo:processo:' || r.id;
    perform public.notificar(
      v_uid, 'prazo', 'processo_prazo',
      case when v_dias < 0 then 'Processo atrasado há ' || abs(v_dias) || ' dia(s): ' || r.empresa
           when v_dias = 0 then 'Processo vence hoje: ' || r.empresa
           else 'Processo vence em ' || v_dias || ' dia(s): ' || r.empresa end,
      concat_ws(' · ', coalesce(r.tipo_servico, 'Processo'), r.orgao, 'prazo ' || to_char(r.prazo, 'DD/MM/YYYY')),
      '/controle-legalizacao?processo=' || r.id,
      case when v_dias < 0 then 'urgente' else 'alta' end,
      null, 'legalizacao_processos', r.id::text, r.prazo, v_chave,
      jsonb_build_object('situacao', case when v_dias < 0 then 'atrasado' else 'atencao' end));
    v_vivas := v_vivas || v_chave;
  end loop;

  -- 2. Atribuições recorrentes
  for r in
    select a.id, a.titulo, a.proximo_prazo, a.alerta_dias_antes
    from public.atribuicoes a
    where a.ativa and a.responsavel_id = v_uid
      and a.proximo_prazo - v_hoje <= a.alerta_dias_antes
  loop
    v_dias := r.proximo_prazo - v_hoje;
    v_chave := 'prazo:atribuicao:' || r.id || ':' || r.proximo_prazo;
    perform public.notificar(
      v_uid, 'prazo', 'atribuicao_prazo',
      case when v_dias < 0 then 'Responsabilidade atrasada: ' || r.titulo
           when v_dias = 0 then 'Vence hoje: ' || r.titulo
           else 'Vence em ' || v_dias || ' dia(s): ' || r.titulo end,
      'Prazo ' || to_char(r.proximo_prazo, 'DD/MM/YYYY') || '. Conclua o ciclo para liberar o próximo.',
      '/atribuicoes', case when v_dias < 0 then 'urgente' else 'alta' end,
      null, 'atribuicoes', r.id::text, r.proximo_prazo, v_chave,
      jsonb_build_object('acao', 'concluir_atribuicao', 'atribuicao_id', r.id));
    v_vivas := v_vivas || v_chave;
  end loop;

  -- 3. Calendário de Obrigações: o que está no meu nome e não foi concluído
  if public.tem_permissao('tela.calendario') then
    for r in
      select o.* from public.calendario_agenda(v_hoje - 45, v_hoje + 3) o
      where o.responsavel_id = v_uid and not o.concluido and not o.inicio
    loop
      v_dias := r.prazo - v_hoje;
      v_chave := 'prazo:calendario:' || r.chave;
      perform public.notificar(
        v_uid, 'prazo', 'calendario_prazo',
        case when v_dias < 0 then 'Obrigação atrasada: ' || r.titulo
             when v_dias = 0 then 'Vence hoje: ' || r.titulo
             else 'Vence em ' || v_dias || ' dia(s): ' || r.titulo end,
        concat_ws(' · ', r.departamento, nullif(r.ref, ''), 'prazo ' || to_char(r.prazo, 'DD/MM/YYYY')),
        '/calendario?data=' || to_char(r.prazo, 'YYYY-MM-DD'),
        case when v_dias < 0 then 'urgente' else 'alta' end,
        null, 'calendario', r.chave, r.prazo, v_chave,
        jsonb_build_object('acao', 'concluir_calendario', 'chave_calendario', r.chave));
      v_vivas := v_vivas || v_chave;
    end loop;
  end if;

  -- 4. Documentos das empresas pelas quais sou responsável
  for r in
    select e.id, e.razao_social, d.documento, d.validade
    from public.legalizacao_empresas e
    cross join lateral (values
      ('AVCB / CLCB', e.avcb_clcb_validade),
      ('Vigilância Sanitária', e.vigilancia_sanitaria_validade),
      ('Responsável técnico', e.validade_data)
    ) as d(documento, validade)
    where e.responsavel_id = v_uid
      and d.validade is not null
      and d.validade <= v_hoje + 30
      and d.validade >= v_hoje - 90
  loop
    v_dias := r.validade - v_hoje;
    v_chave := 'prazo:documento:' || r.id || ':' || r.documento || ':' || r.validade;
    perform public.notificar(
      v_uid, 'prazo', 'documento_validade',
      case when v_dias < 0 then r.documento || ' vencido: ' || r.razao_social
           else r.documento || ' vence em ' || v_dias || ' dia(s): ' || r.razao_social end,
      'Validade ' || to_char(r.validade, 'DD/MM/YYYY') || '. Abra um processo de renovação no Controle Legalização.',
      '/legalizacao?empresa=' || r.id,
      case when v_dias < 0 then 'urgente' when v_dias <= 7 then 'alta' else 'normal' end,
      null, 'legalizacao_empresas', r.id::text, r.validade, v_chave, '{}'::jsonb);
    v_vivas := v_vivas || v_chave;
  end loop;

  -- 5. O que deixou de ser problema se resolve sozinho
  update public.notificacoes n
  set concluida_em = now(),
      lida_em = coalesce(n.lida_em, now()),
      dados = n.dados || '{"resolvida_automaticamente": true}'::jsonb,
      updated_at = now()
  where n.usuario_id = v_uid
    and n.categoria = 'prazo'
    and n.concluida_em is null
    and n.chave is not null
    and not (n.chave = any (v_vivas));

  return public.contar_notificacoes();
end;
$$;

revoke all on function public.sincronizar_minhas_notificacoes() from public, anon;
grant execute on function public.sincronizar_minhas_notificacoes() to authenticated;

-- ---------------------------------------------------------------------
-- "Se for colocado algo no nome daquela pessoa, apareça"
-- ---------------------------------------------------------------------
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
    if new.responsavel_id is not null
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

create or replace trigger trg_notificar_processos
  after insert or update of responsavel_id, status on public.legalizacao_processos
  for each row execute function public.notificar_designacao();

create or replace trigger trg_notificar_atribuicoes
  after insert or update of responsavel_id on public.atribuicoes
  for each row execute function public.notificar_designacao();

create or replace trigger trg_notificar_calendario_eventos
  after insert or update of responsavel_id on public.calendario_eventos
  for each row execute function public.notificar_designacao();

create or replace trigger trg_notificar_calendario_regras
  after insert or update of responsavel_id on public.calendario_regras
  for each row execute function public.notificar_designacao();

create or replace trigger trg_notificar_empresas
  after update of responsavel_id on public.legalizacao_empresas
  for each row execute function public.notificar_designacao();

-- Integração: quem abriu fica sabendo quando cada departamento finaliza.
create or replace function public.notificar_integracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_integ record;
begin
  if new.finalizado and (tg_op = 'INSERT' or not old.finalizado) then
    select i.id, i.criado_por, coalesce(i.ficha ->> 'empresa', 'Cliente') as empresa
      into v_integ
    from public.integracoes i where i.id = new.integracao_id;

    perform public.notificar(
      v_integ.criado_por, 'integracao', 'integracao_finalizada',
      new.departamento || ' finalizou a integração de ' || v_integ.empresa,
      coalesce((select nome from public.profiles where id = (select auth.uid())), 'Alguém')
        || ' concluiu o roteiro. O relatório em PDF está liberado.',
      '/integracao-clientes/' || new.integracao_id || '?dept=' || new.departamento,
      'normal', (select auth.uid()), 'integracoes', new.integracao_id, null,
      'integracao:' || new.integracao_id || ':' || new.departamento, '{}'::jsonb, true);
  end if;
  return null;
end;
$$;

revoke all on function public.notificar_integracao() from public, anon, authenticated;

create or replace trigger trg_notificar_integracao
  after insert or update of finalizado on public.integracao_departamentos
  for each row execute function public.notificar_integracao();
