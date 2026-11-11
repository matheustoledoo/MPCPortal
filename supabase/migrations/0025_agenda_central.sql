-- =====================================================================
-- PortalMPC — 0025 — Agenda central: um só lugar para tudo que tem data
-- ---------------------------------------------------------------------
-- `calendario_eventos` passa a ser a ESTRUTURA CENTRAL de eventos do portal.
-- Além dos compromissos criados no próprio calendário (modulo = 'calendario'),
-- cada módulo publica aqui o que tem data, hora ou prazo — sempre pela mesma
-- função, `agenda_publicar()`, chamada por gatilho na tabela de origem:
--
--   legalizacao_processos  → modulo 'processos'    (prazo do processo)
--   atribuicoes            → modulo 'atribuicoes'  (próximo prazo do ciclo)
--   integracoes            → modulo 'integracao'   (reunião e retornos)
--   legalizacao_empresas   → modulo 'documentos'   (validades — migration 0026)
--   tarefas                → modulo 'tarefas'      (migration 0027)
--   prospeccao_atividades  → modulo 'prospeccao'   (migration 0028)
--
-- Cada evento guarda a origem (tabela + id + chave), com índice único: criar,
-- alterar data/responsável/status ou excluir na origem atualiza o MESMO
-- evento — nunca duplica. Um módulo novo só precisa de um gatilho que chame
-- `agenda_publicar()`; calendário, agenda individual e notificações vêm juntos.
--
-- Os vencimentos do calendário de obrigações conferido no e-Conet ficam em
-- `calendario_regras` com `fonte = 'econet'` e têm um catálogo próprio, que
-- permite restaurá-los sem duplicar (`calendario_sincronizar_econet()`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas da estrutura central
-- ---------------------------------------------------------------------
alter table public.calendario_eventos
  add column if not exists modulo           text not null default 'calendario',
  add column if not exists origem_tabela    text,
  add column if not exists origem_id        text,
  add column if not exists origem_chave     text not null default '',
  add column if not exists link             text,
  add column if not exists status           text not null default 'pendente',
  add column if not exists participantes    uuid[] not null default '{}',
  -- Permissão exigida para ver o evento na visão da equipe (nula = regra do departamento).
  add column if not exists permissao        text,
  add column if not exists privado          boolean not null default false,
  add column if not exists hora_fim         time,
  -- true: quem conclui é o módulo de origem (tarefa, processo…); false: conclui-se no calendário.
  add column if not exists status_na_origem boolean not null default false,
  add column if not exists avisar           boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calendario_eventos_status') then
    alter table public.calendario_eventos
      add constraint calendario_eventos_status check (status in ('pendente', 'concluido', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calendario_eventos_origem') then
    alter table public.calendario_eventos
      add constraint calendario_eventos_origem check ((modulo = 'calendario') = (origem_tabela is null));
  end if;
end $$;

create unique index if not exists calendario_eventos_origem_uidx
  on public.calendario_eventos (origem_tabela, origem_id, origem_chave)
  where origem_tabela is not null;
create index if not exists calendario_eventos_participantes_idx on public.calendario_eventos using gin (participantes);
create index if not exists calendario_eventos_modulo_idx on public.calendario_eventos (modulo);

comment on table public.calendario_eventos is
  'Estrutura central de eventos do portal: compromissos do calendário e tudo que os módulos publicam por agenda_publicar().';

alter table public.calendario_regras
  add column if not exists fonte        text not null default 'equipe',
  add column if not exists conferido_em date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calendario_regras_fonte') then
    alter table public.calendario_regras
      add constraint calendario_regras_fonte check (fonte in ('econet', 'equipe'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Quem vê e quem escreve
-- ---------------------------------------------------------------------
-- Ver: o que é meu (responsável, participante, criador) sempre; compromissos
-- do calendário pela regra do departamento; eventos de módulo, na visão da
-- equipe, só com a tela do calendário E a permissão do módulo de origem.
alter policy calendario_eventos_select on public.calendario_eventos
  using (
    public.is_active() and (
      responsavel_id = (select auth.uid())
      or (select auth.uid()) = any (participantes)
      or created_by = (select auth.uid())
      or (modulo = 'calendario' and public.cal_pode_ver(departamento, visivel_para))
      or (modulo <> 'calendario' and not privado
          and public.tem_permissao('tela.calendario')
          and (permissao is null or public.tem_permissao(permissao)))
    )
  );

-- Escrever direto: só compromissos do próprio calendário. Evento de módulo
-- nasce e muda pela origem (funções SECURITY DEFINER abaixo).
alter policy calendario_eventos_insert on public.calendario_eventos
  with check (modulo = 'calendario' and origem_tabela is null and public.cal_pode_editar(departamento));
alter policy calendario_eventos_update on public.calendario_eventos
  using (modulo = 'calendario' and public.cal_pode_editar(departamento))
  with check (modulo = 'calendario' and origem_tabela is null and public.cal_pode_editar(departamento));
alter policy calendario_eventos_delete on public.calendario_eventos
  using (modulo = 'calendario' and public.cal_pode_editar(departamento));

-- Concluir: quem tem a tela do calendário, ou o dono do evento mesmo sem ela.
alter policy calendario_conclusoes_select on public.calendario_conclusoes
  using (public.is_active());
alter policy calendario_conclusoes_insert on public.calendario_conclusoes
  with check (
    public.is_active() and (concluido_por = (select auth.uid()) or public.is_admin())
    and (public.tem_permissao('tela.calendario')
         or exists (select 1 from public.calendario_eventos e
                    where e.id = split_part(chave, ':', 2)
                      and (e.responsavel_id = (select auth.uid()) or (select auth.uid()) = any (e.participantes))))
  );
alter policy calendario_conclusoes_delete on public.calendario_conclusoes
  using (public.is_active() and (public.tem_permissao('tela.calendario') or concluido_por = (select auth.uid())));

-- O aviso de designação do calendário (0018/0023) vale só para compromissos
-- criados no próprio calendário; os de módulo são avisados por agenda_notificar().
do $$
declare
  v_def text := pg_get_functiondef('public.notificar_designacao'::regproc);
  v_alvo text := 'and (new.data >= current_date or new.recorrencia <> ''nenhuma'')';
begin
  if position('new.modulo = ''calendario''' in v_def) = 0 and position(v_alvo in v_def) > 0 then
    execute replace(v_def, v_alvo, 'and new.modulo = ''calendario'' ' || v_alvo);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Publicar e remover — o serviço que todos os módulos usam
-- ---------------------------------------------------------------------
create or replace function public.agenda_rotulo_modulo(p_modulo text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_modulo
    when 'calendario'  then 'Compromisso'
    when 'tarefas'     then 'Tarefa'
    when 'processos'   then 'Processo de legalização'
    when 'atribuicoes' then 'Atribuição'
    when 'integracao'  then 'Integração de cliente'
    when 'documentos'  then 'Validade de documento'
    when 'prospeccao'  then 'Prospecção'
    else initcap(p_modulo)
  end;
$$;

create or replace function public.agenda_remover(p_tabela text, p_id text, p_chave text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('portal.agenda_sync', '1', true);
  delete from public.calendario_conclusoes c
  using public.calendario_eventos e
  where e.origem_tabela = p_tabela and e.origem_id = p_id
    and (p_chave is null or e.origem_chave = p_chave)
    and c.chave like 'e:' || e.id || ':%';
  delete from public.calendario_eventos e
  where e.origem_tabela = p_tabela and e.origem_id = p_id
    and (p_chave is null or e.origem_chave = p_chave);
  perform set_config('portal.agenda_sync', '', true);
end;
$$;

create or replace function public.agenda_publicar(
  p_modulo text,
  p_tabela text,
  p_id text,
  p_titulo text,
  p_data date,
  p_chave text default '',
  p_hora time default null,
  p_hora_fim time default null,
  p_responsaveis uuid[] default '{}',
  p_status text default 'pendente',
  p_link text default null,
  p_permissao text default null,
  p_descricao text default '',
  p_departamento text default null,
  p_categoria text default 'Interna',
  p_empresa_id uuid default null,
  p_empresa text default null,
  p_privado boolean default false,
  p_avisar boolean default true,
  p_status_na_origem boolean default true
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_resp  uuid[];
  v_dep   text;
  v_id    text;
begin
  -- Sem data não há o que mostrar no calendário.
  if p_data is null then
    perform public.agenda_remover(p_tabela, p_id, coalesce(p_chave, ''));
    return null;
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_resp
  from unnest(coalesce(p_responsaveis, '{}')) x where x is not null;

  v_dep := coalesce(
    p_departamento,
    (select public.departamento_de_area(p.area) from public.profiles p where p.id = v_resp[1]),
    (select public.departamento_de_area(p.area) from public.profiles p where p.id = v_uid),
    'Matriz');

  insert into public.calendario_eventos as e (
    titulo, data, hora, hora_fim, tipo, categoria, departamento, responsavel_id, participantes,
    designado_por, designado_por_nome, notas, empresa_id, empresa,
    modulo, origem_tabela, origem_id, origem_chave, link, status, permissao, privado,
    avisar, status_na_origem, created_by
  ) values (
    left(btrim(p_titulo), 140), p_data, p_hora, p_hora_fim, '', coalesce(p_categoria, 'Interna'), v_dep,
    v_resp[1], v_resp,
    v_uid, (select nome from public.profiles where id = v_uid), coalesce(p_descricao, ''), p_empresa_id, p_empresa,
    p_modulo, p_tabela, p_id, coalesce(p_chave, ''), p_link, coalesce(p_status, 'pendente'), p_permissao,
    coalesce(p_privado, false), coalesce(p_avisar, true), coalesce(p_status_na_origem, true), v_uid
  )
  on conflict (origem_tabela, origem_id, origem_chave) where origem_tabela is not null
  do update set
    titulo = excluded.titulo, data = excluded.data, hora = excluded.hora, hora_fim = excluded.hora_fim,
    categoria = excluded.categoria, departamento = excluded.departamento,
    responsavel_id = excluded.responsavel_id, participantes = excluded.participantes,
    notas = excluded.notas, empresa_id = excluded.empresa_id, empresa = excluded.empresa,
    modulo = excluded.modulo, link = excluded.link, status = excluded.status,
    permissao = excluded.permissao, privado = excluded.privado, avisar = excluded.avisar,
    status_na_origem = excluded.status_na_origem
  returning e.id into v_id;

  -- A situação de quem manda na própria conclusão espelha em calendario_conclusoes,
  -- que é o que a grade, os relatórios e os avisos de prazo consultam.
  if coalesce(p_status_na_origem, true) then
    perform set_config('portal.agenda_sync', '1', true);
    delete from public.calendario_conclusoes c
    where c.chave like 'e:' || v_id || ':%'
      and (p_status <> 'concluido' or c.chave <> 'e:' || v_id || ':' || to_char(p_data, 'YYYY-MM-DD'));
    if p_status = 'concluido' then
      insert into public.calendario_conclusoes (chave, mes, concluido_por, concluido_por_nome)
      values ('e:' || v_id || ':' || to_char(p_data, 'YYYY-MM-DD'), to_char(p_data, 'YYYY-MM'), v_uid,
              (select nome from public.profiles where id = v_uid))
      on conflict (chave) do nothing;
    end if;
    perform set_config('portal.agenda_sync', '', true);
  end if;

  return v_id;
end;
$$;

revoke all on function public.agenda_rotulo_modulo(text) from public, anon;
revoke all on function public.agenda_remover(text, text, text) from public, anon, authenticated;
revoke all on function public.agenda_publicar(text, text, text, text, date, text, time, time, uuid[], text, text, text, text, text, text, uuid, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.agenda_rotulo_modulo(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Notificações centrais: atribuição, mudança de data e cancelamento
-- ---------------------------------------------------------------------
create or replace function public.agenda_notificar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ator  uuid := (select auth.uid());
  v_nome  text;
  v_hoje  date := public.hoje_brasil();
  v_link  text;
  v_quando text;
  v_antes uuid[] := '{}';
  v_agora uuid[];
  p uuid;
begin
  -- Sem sessão (migrations, importações em lote): ninguém é avisado.
  if v_ator is null or new.privado and coalesce(array_length(new.participantes, 1), 0) = 0 then
    return null;
  end if;
  select nome into v_nome from public.profiles where id = v_ator;
  v_link := coalesce(new.link, '/calendario?data=' || to_char(new.data, 'YYYY-MM-DD') || '&item=e:' || new.id || ':' || to_char(new.data, 'YYYY-MM-DD'));
  v_quando := to_char(new.data, 'DD/MM/YYYY') || coalesce(' às ' || to_char(new.hora, 'HH24:MI'), '');
  v_agora := array(select distinct x from unnest(new.participantes || new.responsavel_id) x where x is not null);
  if tg_op = 'UPDATE' then
    v_antes := array(select distinct x from unnest(old.participantes || old.responsavel_id) x where x is not null);
  end if;

  if new.status = 'cancelado' then
    if tg_op = 'UPDATE' and old.status <> 'cancelado' and new.data >= v_hoje then
      foreach p in array v_agora loop
        perform public.notificar(p, 'calendario', 'agenda_cancelada',
          'Cancelado: ' || new.titulo, coalesce(v_nome, 'O portal') || ' cancelou o item de ' || v_quando || '.',
          v_link, 'baixa', v_ator, 'calendario_eventos', new.id, new.data, 'agenda:cancelada:' || new.id, '{}'::jsonb, true);
      end loop;
    end if;
    return null;
  end if;
  if new.status <> 'pendente' or (new.data < v_hoje and new.recorrencia = 'nenhuma') then
    return null;
  end if;

  -- Entrou na agenda de alguém (o calendário próprio já avisa pelo gatilho de designação).
  if new.modulo <> 'calendario' and new.avisar then
    foreach p in array v_agora loop
      if not (p = any (v_antes)) then
        perform public.notificar(p, 'calendario', 'agenda_atribuida',
          public.agenda_rotulo_modulo(new.modulo) || ' na sua agenda: ' || new.titulo,
          concat_ws(' · ', coalesce(v_nome, 'O portal') || ' colocou no seu nome', v_quando),
          v_link, 'normal', v_ator, 'calendario_eventos', new.id, new.data, 'agenda:atribuida:' || new.id, '{}'::jsonb, true);
      end if;
    end loop;
  end if;

  -- Mudou a data ou a hora: quem já estava no evento fica sabendo.
  if tg_op = 'UPDATE' and (old.data is distinct from new.data or old.hora is distinct from new.hora) then
    foreach p in array v_agora loop
      if p = any (v_antes) then
        perform public.notificar(p, 'calendario', 'agenda_alterada',
          'Data alterada: ' || new.titulo,
          coalesce(v_nome, 'O portal') || ' mudou de ' || to_char(old.data, 'DD/MM/YYYY') || coalesce(' às ' || to_char(old.hora, 'HH24:MI'), '') || ' para ' || v_quando || '.',
          v_link, 'normal', v_ator, 'calendario_eventos', new.id, new.data, 'agenda:alterada:' || new.id, '{}'::jsonb, true);
      end if;
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.agenda_notificar() from public, anon, authenticated;

create or replace trigger trg_agenda_notificar
  after insert or update of data, hora, responsavel_id, participantes, status on public.calendario_eventos
  for each row execute function public.agenda_notificar();

-- ---------------------------------------------------------------------
-- 5. Concluir: no calendário ou no módulo de origem, nunca em dois lugares
-- ---------------------------------------------------------------------
create or replace function public.agenda_guardar_conclusao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chave text := coalesce(new.chave, old.chave);
  e public.calendario_eventos;
begin
  if current_setting('portal.agenda_sync', true) = '1' or v_chave not like 'e:%' then
    return coalesce(new, old);
  end if;
  select * into e from public.calendario_eventos where id = split_part(v_chave, ':', 2);
  if found and e.status_na_origem and (select auth.uid()) is not null then
    raise exception 'Este item é de % — conclua por lá (ou pelo botão do calendário).', public.agenda_rotulo_modulo(e.modulo)
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.agenda_guardar_conclusao() from public, anon, authenticated;

create or replace trigger trg_agenda_guardar_conclusao
  before insert or delete on public.calendario_conclusoes
  for each row execute function public.agenda_guardar_conclusao();

/**
 * Concluir (ou reabrir) pelo calendário um evento cujo status mora no módulo
 * de origem: a mudança é feita LÁ, e o gatilho da origem republica o evento.
 */
create or replace function public.agenda_concluir(p_evento text, p_concluir boolean default true)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e public.calendario_eventos;
begin
  select * into e from public.calendario_eventos where id = p_evento;
  if not found then
    raise exception 'Evento não encontrado.' using errcode = '22023';
  end if;
  if not (public.is_active() and (e.responsavel_id = v_uid or v_uid = any (e.participantes) or e.created_by = v_uid
          or (not e.privado and e.permissao is not null and public.tem_permissao(e.permissao)))) then
    raise exception 'Você não tem acesso a este item.' using errcode = '42501';
  end if;

  if e.origem_tabela = 'tarefas' then
    update public.tarefas
       set status = case when p_concluir then 'concluido' else 'a_fazer' end
     where id = e.origem_id::uuid
       and (status = 'concluido') is distinct from p_concluir;
  elsif e.origem_tabela = 'prospeccao_atividades' then
    update public.prospeccao_atividades
       set concluida = p_concluir, concluida_em = case when p_concluir then now() end
     where id = e.origem_id::uuid;
  elsif e.origem_tabela = 'atribuicoes' and p_concluir then
    perform public.concluir_atribuicao(e.origem_id::uuid, null);
  else
    raise exception 'Abra o item em "%" para alterar a situação.', public.agenda_rotulo_modulo(e.modulo)
      using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'modulo', e.modulo);
end;
$$;

revoke all on function public.agenda_concluir(text, boolean) from public, anon;
grant execute on function public.agenda_concluir(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Ocorrências do período, com origem, link, participantes e situação
-- ---------------------------------------------------------------------
create or replace function public.agenda_ocorrencias(p_inicio date, p_fim date)
returns table (
  chave text, fonte text, item_id text, titulo text, data date, hora time, prazo date, inicio boolean,
  departamento text, categoria text, tipo text, modulo text, origem text, link text,
  responsavel_id uuid, participantes uuid[], responsavel_nome text,
  empresa_id uuid, empresa text, ref text, status text, status_na_origem boolean
)
language plpgsql stable set search_path = ''
as $$
declare
  v_mes date;
  v_ano int;
  v_m int;
  v_feriados date[];
  v_data date;
  r record;
begin
  if p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;

  -- Obrigações fixas (e-Conet e da equipe): data calculada, nunca gravada.
  v_mes := date_trunc('month', p_inicio)::date - interval '1 month';
  while v_mes <= (date_trunc('month', p_fim)::date + interval '1 month') loop
    v_ano := extract(year from v_mes)::int;
    v_m := extract(month from v_mes)::int;
    select array_agg(f.data) into v_feriados
    from (
      select x.data from public.calendario_feriados(v_ano) x
      union select y.data from public.calendario_feriados(v_ano + 1) y
      union select z.data from public.calendario_feriados(v_ano - 1) z
    ) f;

    for r in
      select * from public.calendario_regras cr
      where cr.ativo and (cardinality(cr.meses) = 0 or v_m = any (cr.meses))
    loop
      v_data := public.calendario_data_regra(r.tipo, r.dia, r.ajuste, r.sabado_util, v_ano, v_m, v_feriados);
      if v_data is not null and v_data between p_inicio and p_fim then
        chave := 'r:' || r.id || ':' || to_char(v_data, 'YYYY-MM-DD');
        fonte := 'regra'; item_id := r.id; titulo := r.nome; data := v_data; hora := null; prazo := v_data;
        inicio := false; departamento := r.departamento; categoria := r.categoria; tipo := '';
        modulo := 'obrigacoes'; origem := r.fonte; link := null;
        responsavel_id := r.responsavel_id;
        participantes := case when r.responsavel_id is null then '{}'::uuid[] else array[r.responsavel_id] end;
        responsavel_nome := coalesce((select p.nome from public.profiles p where p.id = r.responsavel_id), r.responsavel_nome);
        empresa_id := null; empresa := null;
        ref := public.calendario_ref_label(r.ref, v_ano, v_m);
        status := 'pendente'; status_na_origem := false;
        return next;
      end if;
    end loop;
    v_mes := v_mes + interval '1 month';
  end loop;

  -- Eventos: compromissos do calendário e tudo que os módulos publicaram.
  for r in
    select * from public.calendario_eventos ce
    where ce.categoria <> 'Feriado' and ce.status <> 'cancelado'
  loop
    modulo := r.modulo; origem := r.modulo; link := r.link; hora := r.hora;
    participantes := r.participantes; status := r.status; status_na_origem := r.status_na_origem;
    fonte := 'evento'; item_id := r.id; departamento := r.departamento; categoria := r.categoria;
    tipo := r.tipo; responsavel_id := r.responsavel_id;
    responsavel_nome := coalesce((select p.nome from public.profiles p where p.id = r.responsavel_id), r.responsavel_nome);
    empresa_id := r.empresa_id; empresa := r.empresa; ref := '';

    if r.tipo = 'Demanda' and r.data_inicio is not null and r.data_inicio < r.data
       and r.data_inicio between p_inicio and p_fim then
      chave := 'e:' || r.id || ':' || to_char(r.data, 'YYYY-MM-DD');
      titulo := '▶ Início: ' || r.titulo; data := r.data_inicio; prazo := r.data; inicio := true;
      return next;
    end if;

    inicio := false; titulo := r.titulo;
    v_mes := date_trunc('month', p_inicio)::date;
    while v_mes <= p_fim loop
      v_ano := extract(year from v_mes)::int;
      v_m := extract(month from v_mes)::int;
      v_data := null;
      if r.recorrencia = 'mensal' then
        v_data := make_date(v_ano, v_m, least(extract(day from r.data)::int,
                    extract(day from (v_mes + interval '1 month - 1 day'))::int));
        if v_data < r.data then v_data := null; end if;
      elsif r.recorrencia = 'anual' then
        if extract(month from r.data)::int = v_m and v_ano >= extract(year from r.data)::int then
          v_data := make_date(v_ano, v_m, least(extract(day from r.data)::int,
                      extract(day from (v_mes + interval '1 month - 1 day'))::int));
        end if;
      elsif date_trunc('month', r.data)::date = v_mes then
        v_data := r.data;
      end if;

      if v_data is not null and v_data between p_inicio and p_fim then
        chave := 'e:' || r.id || ':' || to_char(v_data, 'YYYY-MM-DD');
        data := v_data; prazo := v_data;
        return next;
      end if;
      v_mes := v_mes + interval '1 month';
    end loop;
  end loop;
end;
$$;

create or replace function public.agenda_periodo(p_inicio date, p_fim date)
returns table (
  chave text, fonte text, item_id text, titulo text, data date, hora time, prazo date, inicio boolean,
  departamento text, categoria text, tipo text, modulo text, origem text, link text,
  responsavel_id uuid, participantes uuid[], responsavel_nome text,
  empresa_id uuid, empresa text, ref text, status text, status_na_origem boolean,
  concluido boolean, concluido_em timestamptz, concluido_por_nome text
)
language sql stable set search_path = ''
as $$
  select o.chave, o.fonte, o.item_id, o.titulo, o.data, o.hora, o.prazo, o.inicio, o.departamento,
         o.categoria, o.tipo, o.modulo, o.origem, o.link, o.responsavel_id, o.participantes,
         o.responsavel_nome, o.empresa_id, o.empresa, o.ref, o.status, o.status_na_origem,
         (c.chave is not null) as concluido, c.concluido_em,
         coalesce((select p.nome from public.profiles p where p.id = c.concluido_por), c.concluido_por_nome)
  from public.agenda_ocorrencias(p_inicio, p_fim) o
  left join public.calendario_conclusoes c on c.chave = o.chave
  order by o.data, o.hora nulls first, o.titulo;
$$;

revoke all on function public.agenda_ocorrencias(date, date) from public, anon;
revoke all on function public.agenda_periodo(date, date) from public, anon;
grant execute on function public.agenda_ocorrencias(date, date) to authenticated;
grant execute on function public.agenda_periodo(date, date) to authenticated;

-- A função antiga continua existindo para quem ainda a chama, agora lendo da nova.
create or replace function public.calendario_agenda(p_inicio date, p_fim date)
returns table (
  chave text, fonte text, item_id text, titulo text, data date, prazo date, inicio boolean,
  departamento text, categoria text, tipo text, responsavel_id uuid, responsavel_nome text,
  empresa_id uuid, empresa text, ref text, concluido boolean, concluido_em timestamptz,
  concluido_por_nome text
)
language sql stable set search_path = ''
as $$
  select o.chave, o.fonte, o.item_id, o.titulo, o.data, o.prazo, o.inicio, o.departamento,
         o.categoria, o.tipo, o.responsavel_id, o.responsavel_nome, o.empresa_id, o.empresa, o.ref,
         o.concluido, o.concluido_em, o.concluido_por_nome
  from public.agenda_periodo(p_inicio, p_fim) o;
$$;

-- ---------------------------------------------------------------------
-- 7. Vencimentos e-Conet: catálogo e sincronização sem duplicar
-- ---------------------------------------------------------------------
create table if not exists public.calendario_catalogo_econet (
  id            text primary key,
  dados         jsonb not null,
  conferido_em  date,
  atualizado_em timestamptz not null default now()
);

comment on table public.calendario_catalogo_econet is
  'Calendário de obrigações do Portal Meta Plano (SEED + AJUSTES_ECONET + NOVAS_OBRIGACOES do Codigo.gs). Fonte para restaurar calendario_regras.';

alter table public.calendario_catalogo_econet enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'calendario_catalogo_econet' and policyname = 'calendario_catalogo_econet_select') then
    create policy calendario_catalogo_econet_select on public.calendario_catalogo_econet
      for select to authenticated using (public.tem_permissao('tela.calendario'));
  end if;
end $$;

-- O catálogo é montado a partir das obrigações que a migration 0017 semeou.
-- Num banco em que elas foram apagadas, o retrato vem da trilha de auditoria.
do $$
declare
  v_ids text[] := array['alvaras','caged','certidoes','conselho-rt','darf-inss-irrf','das-mei','das-simples','dasn-simei','dbf',
    'dctfweb','decimo-1','decimo-2','defis','destda','dipam-b','dirbi','ecd','ecf','efd-contrib','efd-icms-ipi','efd-reinf',
    'esocial','faturamento-matriz','fgts','holerite','icms','informes','inss-13','ipi','irpf','irpj-csll-mensal','irpj-csll-tri',
    'iss','licencas-sanitarias','pis-cofins','rbt12-rba','salarios','sieg','sindicato'];
  v_campos text[] := array['id','nome','departamento','categoria','regime','tipo','dia','ajuste','meses','ref','descricao','ativo','sabado_util'];
begin
  insert into public.calendario_catalogo_econet (id, dados)
  select r.id, (select jsonb_object_agg(k, to_jsonb(r) -> k) from unnest(v_campos) k)
  from public.calendario_regras r where r.id = any (v_ids)
  on conflict (id) do nothing;

  insert into public.calendario_catalogo_econet (id, dados)
  select distinct on (a.registro_id) a.registro_id,
         (select jsonb_object_agg(k, a.dados_anteriores -> k) from unnest(v_campos) k)
  from public.audit_logs a
  where a.tabela = 'calendario_regras' and a.acao = 'DELETE' and a.registro_id = any (v_ids)
  order by a.registro_id, a.created_at desc
  on conflict (id) do nothing;

  -- "Sindicato" nasce desligada no app antigo (sem data fixa).
  update public.calendario_catalogo_econet set dados = jsonb_set(dados, '{ativo}', 'false') where id = 'sindicato';
  -- As quatro que o Codigo.gs marca como "conferidas no Econet (out/2026, SP)".
  update public.calendario_catalogo_econet set conferido_em = date '2026-10-01'
  where id in ('dctfweb', 'icms', 'efd-icms-ipi', 'iss') and conferido_em is null;
end $$;

/**
 * Traz para o calendário as obrigações do catálogo que estiverem faltando.
 * Com p_redefinir, também devolve as existentes ao que está no catálogo
 * (mantendo o responsável definido pela equipe). Nunca duplica: a chave é o id.
 */
create or replace function public.calendario_sincronizar_econet(p_redefinir boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_incluidas int := 0;
  v_redefinidas int := 0;
begin
  if (select auth.uid()) is not null and not public.tem_permissao('dados.calendario.todos') then
    raise exception 'Só quem administra o calendário de todos os departamentos pode sincronizar as obrigações.' using errcode = '42501';
  end if;

  with novas as (
    insert into public.calendario_regras (id, nome, departamento, categoria, regime, tipo, dia, ajuste, meses, ref, descricao, ativo, sabado_util, fonte, conferido_em)
    select c.id, c.dados ->> 'nome', c.dados ->> 'departamento', c.dados ->> 'categoria', c.dados ->> 'regime',
           c.dados ->> 'tipo', (c.dados ->> 'dia')::smallint, c.dados ->> 'ajuste',
           coalesce(array(select jsonb_array_elements_text(c.dados -> 'meses')::smallint), '{}'),
           coalesce(c.dados ->> 'ref', ''), coalesce(c.dados ->> 'descricao', ''),
           coalesce((c.dados ->> 'ativo')::boolean, true), coalesce((c.dados ->> 'sabado_util')::boolean, false),
           case when c.dados ->> 'categoria' in ('Federal', 'Estadual', 'Municipal', 'Trabalhista') then 'econet' else 'equipe' end,
           c.conferido_em
    from public.calendario_catalogo_econet c
    on conflict (id) do nothing
    returning 1
  ) select count(*) into v_incluidas from novas;

  if p_redefinir then
    with mudadas as (
      update public.calendario_regras r
         set nome = c.dados ->> 'nome', departamento = c.dados ->> 'departamento', categoria = c.dados ->> 'categoria',
             regime = c.dados ->> 'regime', tipo = c.dados ->> 'tipo', dia = (c.dados ->> 'dia')::smallint,
             ajuste = c.dados ->> 'ajuste',
             meses = coalesce(array(select jsonb_array_elements_text(c.dados -> 'meses')::smallint), '{}'),
             ref = coalesce(c.dados ->> 'ref', ''), descricao = coalesce(c.dados ->> 'descricao', ''),
             ativo = coalesce((c.dados ->> 'ativo')::boolean, true),
             sabado_util = coalesce((c.dados ->> 'sabado_util')::boolean, false)
        from public.calendario_catalogo_econet c
       where c.id = r.id
      returning 1
    ) select count(*) into v_redefinidas from mudadas;
  end if;

  -- Marca a origem das que já existiam.
  update public.calendario_regras r
     set fonte = case when r.categoria in ('Federal', 'Estadual', 'Municipal', 'Trabalhista') then 'econet' else 'equipe' end,
         conferido_em = coalesce(r.conferido_em, c.conferido_em)
    from public.calendario_catalogo_econet c
   where c.id = r.id
     and r.fonte is distinct from case when r.categoria in ('Federal', 'Estadual', 'Municipal', 'Trabalhista') then 'econet' else 'equipe' end;

  return jsonb_build_object('incluidas', v_incluidas, 'redefinidas', v_redefinidas,
                            'catalogo', (select count(*) from public.calendario_catalogo_econet));
end;
$$;

revoke all on function public.calendario_sincronizar_econet(boolean) from public, anon;
grant execute on function public.calendario_sincronizar_econet(boolean) to authenticated;

-- Importa agora (restaura o que foi apagado, sem tocar no que existir).
select public.calendario_sincronizar_econet(false);

-- ---------------------------------------------------------------------
-- 8. Módulos que já existiam passam a publicar na agenda
-- ---------------------------------------------------------------------
create or replace function public.agenda_sinc_processo(p public.legalizacao_processos)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.agenda_publicar(
    p_modulo => 'processos', p_tabela => 'legalizacao_processos', p_id => p.id::text,
    p_titulo => coalesce(p.tipo_servico, 'Processo') || ' — ' || p.empresa,
    p_data => p.prazo,
    p_responsaveis => array[p.responsavel_id],
    p_status => case when p.status in ('Concluído', 'Arquivado') then 'concluido'
                     when p.status in ('Cancelado', 'Indeferido') then 'cancelado' else 'pendente' end,
    p_link => '/controle-legalizacao?processo=' || p.id,
    p_permissao => 'tela.processos',
    p_descricao => concat_ws(' · ', 'Status: ' || p.status, p.orgao, 'Próxima ação: ' || p.proxima_acao, 'Protocolo ' || p.protocolo),
    p_departamento => 'Legalização', p_categoria => 'Interna',
    p_empresa_id => p.empresa_id, p_empresa => p.empresa,
    -- A designação do processo já gera o próprio aviso (0018).
    p_avisar => false);
end;
$$;

create or replace function public.agenda_sinc_atribuicao(a public.atribuicoes)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.agenda_publicar(
    p_modulo => 'atribuicoes', p_tabela => 'atribuicoes', p_id => a.id::text,
    p_titulo => a.titulo,
    p_data => case when a.ativa then a.proximo_prazo end,
    p_responsaveis => array[a.responsavel_id],
    p_link => '/atribuicoes', p_permissao => 'tela.atribuicoes',
    p_descricao => coalesce(a.descricao, ''),
    p_departamento => public.departamento_de_area(a.area), p_categoria => 'Interna',
    p_avisar => false);
end;
$$;

create or replace function public.agenda_sinc_integracao(i public.integracoes)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_data text := i.ficha ->> 'dataReuniao';
  v_empresa text := coalesce(nullif(i.ficha ->> 'empresa', ''), 'Cliente');
begin
  -- Aberta a partir de uma reunião do calendário: o evento já existe, não duplica.
  perform public.agenda_publicar(
    p_modulo => 'integracao', p_tabela => 'integracoes', p_id => i.id,
    p_titulo => 'Reunião de Integração — ' || v_empresa,
    p_data => case when i.evento_id is null and v_data ~ '^\d{4}-\d{2}-\d{2}$' then v_data::date end,
    p_responsaveis => array[i.criado_por],
    p_link => '/integracao-clientes/' || i.id, p_permissao => 'tela.integracao',
    p_descricao => concat_ws(' · ', i.ficha ->> 'modalidade', 'Contato: ' || nullif(i.ficha ->> 'canal', '')),
    p_departamento => 'Qualidade', p_categoria => 'Interna',
    p_empresa_id => i.empresa_id, p_empresa => v_empresa,
    p_status_na_origem => false);
end;
$$;

create or replace function public.agenda_sinc_integracao_depto(d public.integracao_departamentos)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_data text := d.dados ->> 'retorno';
  i public.integracoes;
begin
  select * into i from public.integracoes where id = d.integracao_id;
  if not found then return; end if;
  perform public.agenda_publicar(
    p_modulo => 'integracao', p_tabela => 'integracoes', p_id => d.integracao_id,
    p_chave => 'retorno:' || d.departamento,
    p_titulo => 'Retorno de acompanhamento — ' || coalesce(nullif(i.ficha ->> 'empresa', ''), 'Cliente'),
    p_data => case when v_data ~ '^\d{4}-\d{2}-\d{2}$' then v_data::date end,
    p_responsaveis => array[coalesce(d.finalizado_por, d.updated_by)],
    p_link => '/integracao-clientes/' || d.integracao_id || '?dept=' || d.departamento,
    p_permissao => 'tela.integracao',
    p_descricao => 'Combinado na integração (' || d.departamento || ').',
    p_departamento => d.departamento, p_categoria => 'Interna',
    p_empresa_id => i.empresa_id, p_empresa => i.ficha ->> 'empresa',
    p_status_na_origem => false);
end;
$$;

create or replace function public.agenda_gatilho_origem()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'integracao_departamentos' then
      perform public.agenda_remover('integracoes', old.integracao_id, 'retorno:' || old.departamento);
    else
      perform public.agenda_remover(tg_table_name, old.id::text, null);
    end if;
    return old;
  end if;
  if tg_table_name = 'legalizacao_processos' then perform public.agenda_sinc_processo(new);
  elsif tg_table_name = 'atribuicoes' then perform public.agenda_sinc_atribuicao(new);
  elsif tg_table_name = 'integracoes' then perform public.agenda_sinc_integracao(new);
  elsif tg_table_name = 'integracao_departamentos' then perform public.agenda_sinc_integracao_depto(new);
  end if;
  return new;
end;
$$;

revoke all on function public.agenda_sinc_processo(public.legalizacao_processos) from public, anon, authenticated;
revoke all on function public.agenda_sinc_atribuicao(public.atribuicoes) from public, anon, authenticated;
revoke all on function public.agenda_sinc_integracao(public.integracoes) from public, anon, authenticated;
revoke all on function public.agenda_sinc_integracao_depto(public.integracao_departamentos) from public, anon, authenticated;
revoke all on function public.agenda_gatilho_origem() from public, anon, authenticated;

create or replace trigger trg_agenda_processos
  after insert or update or delete on public.legalizacao_processos
  for each row execute function public.agenda_gatilho_origem();
create or replace trigger trg_agenda_atribuicoes
  after insert or update or delete on public.atribuicoes
  for each row execute function public.agenda_gatilho_origem();
create or replace trigger trg_agenda_integracoes
  after insert or update or delete on public.integracoes
  for each row execute function public.agenda_gatilho_origem();
create or replace trigger trg_agenda_integracao_departamentos
  after insert or update or delete on public.integracao_departamentos
  for each row execute function public.agenda_gatilho_origem();

-- O que já existe entra na agenda agora.
select public.agenda_sinc_processo(p) from public.legalizacao_processos p;
select public.agenda_sinc_atribuicao(a) from public.atribuicoes a;
select public.agenda_sinc_integracao(i) from public.integracoes i;
select public.agenda_sinc_integracao_depto(d) from public.integracao_departamentos d;

-- ---------------------------------------------------------------------
-- 9. Avisos de prazo passam a ler a agenda central
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

  -- 3. Agenda central: obrigações, compromissos, tarefas, prospecção, integração…
  --    tudo que está no meu nome (responsável ou participante) e não foi concluído.
  --    Processos, atribuições e documentos têm aviso próprio acima e abaixo.
  for r in
    select o.* from public.agenda_periodo(v_hoje - 45, v_hoje + 3) o
    where (o.responsavel_id = v_uid or v_uid = any (o.participantes))
      and not o.concluido and not o.inicio
      and o.modulo not in ('processos', 'atribuicoes', 'documentos')
  loop
    v_dias := r.prazo - v_hoje;
    v_chave := 'prazo:calendario:' || r.chave;
    perform public.notificar(
      v_uid, 'prazo', 'calendario_prazo',
      case when v_dias < 0 then public.agenda_rotulo_modulo(case when r.fonte = 'regra' then 'obrigação' else r.modulo end) || ' em atraso: ' || r.titulo
           when v_dias = 0 then 'Vence hoje: ' || r.titulo
           else 'Vence em ' || v_dias || ' dia(s): ' || r.titulo end,
      concat_ws(' · ', r.departamento, nullif(r.ref, ''), 'prazo ' || to_char(r.prazo, 'DD/MM/YYYY') || coalesce(' às ' || to_char(r.hora, 'HH24:MI'), '')),
      coalesce(r.link, '/calendario?data=' || to_char(r.prazo, 'YYYY-MM-DD') || '&item=' || r.chave),
      case when v_dias < 0 then 'urgente' else 'alta' end,
      null, 'calendario', r.chave, r.prazo, v_chave,
      case when r.status_na_origem
           then jsonb_build_object('acao', 'concluir_agenda', 'evento_id', r.item_id)
           else jsonb_build_object('acao', 'concluir_calendario', 'chave_calendario', r.chave) end);
    v_vivas := v_vivas || v_chave;
  end loop;

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
