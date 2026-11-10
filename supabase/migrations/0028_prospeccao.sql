-- =====================================================================
-- PortalMPC — 0028 — Prospecção (CRM comercial da Meta Plano)
-- ---------------------------------------------------------------------
-- Funil configurável (etapas), leads, histórico de contatos, propostas e
-- próximas ações. Toda ação AGENDADA (reunião, retorno, ligação marcada)
-- vai para a agenda central e avisa o responsável. Os indicadores do painel
-- saem de `prospeccao_indicadores()`, calculados sobre os registros reais.
-- =====================================================================

create table if not exists public.prospeccao_etapas (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  ordem  integer not null default 0,
  cor    text not null default '#64748b',
  -- 'aberta' = em andamento · 'ganha' = cliente convertido · 'perdida' = oportunidade perdida
  tipo   text not null default 'aberta',
  ativo  boolean not null default true,
  constraint prospeccao_etapas_nome check (length(btrim(nome)) between 1 and 60),
  constraint prospeccao_etapas_tipo check (tipo in ('aberta', 'ganha', 'perdida'))
);

insert into public.prospeccao_etapas (nome, ordem, cor, tipo)
select v.nome, v.ordem, v.cor, v.tipo
from (values
  ('Lead identificado', 1, '#64748b', 'aberta'),
  ('Primeiro contato realizado', 2, '#2f62c9', 'aberta'),
  ('Aguardando retorno', 3, '#b7791f', 'aberta'),
  ('Em negociação', 4, '#7b4fc4', 'aberta'),
  ('Reunião agendada', 5, '#0e7490', 'aberta'),
  ('Proposta enviada', 6, '#c2417a', 'aberta'),
  ('Cliente convertido', 7, '#15803d', 'ganha'),
  ('Oportunidade perdida', 8, '#b91c1c', 'perdida')
) as v(nome, ordem, cor, tipo)
where not exists (select 1 from public.prospeccao_etapas);

create table if not exists public.prospeccao_leads (
  id               uuid primary key default gen_random_uuid(),
  empresa          text not null,
  cnpj             text,
  segmento         text,
  contato          text,
  telefone         text,
  whatsapp         text,
  email            text,
  cidade           text,
  uf               text,
  origem           text,
  responsavel_id   uuid references public.profiles (id) on delete set null,
  data_entrada     date not null default current_date,
  observacoes      text not null default '',
  etapa_id         uuid not null references public.prospeccao_etapas (id),
  etapa_desde      timestamptz not null default now(),
  valor_estimado   numeric(12, 2),
  motivo_perda     text,
  ultimo_contato_em date,
  proxima_acao_em  date,
  convertido_em    timestamptz,
  perdido_em       timestamptz,
  -- Empresa da base de Legalização, quando o lead vira cliente.
  empresa_id       uuid references public.legalizacao_empresas (id) on delete set null,
  ordem            double precision not null default extract(epoch from now()),
  criado_por       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint prospeccao_leads_empresa check (length(btrim(empresa)) between 1 and 160),
  constraint prospeccao_leads_uf check (uf is null or uf ~ '^[A-Z]{2}$')
);

create index if not exists prospeccao_leads_etapa_idx on public.prospeccao_leads (etapa_id, ordem);
create index if not exists prospeccao_leads_responsavel_idx on public.prospeccao_leads (responsavel_id);

create table if not exists public.prospeccao_atividades (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.prospeccao_leads (id) on delete cascade,
  tipo            text not null default 'nota',
  descricao       text not null default '',
  data            date not null default current_date,
  hora            time,
  -- agendada = próxima ação marcada (vai para o calendário); concluida = já aconteceu
  agendada        boolean not null default false,
  concluida       boolean not null default true,
  concluida_em    timestamptz,
  resultado       text,
  valor           numeric(12, 2),
  responsavel_id  uuid references public.profiles (id) on delete set null,
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  created_at      timestamptz not null default now(),
  constraint prospeccao_atividades_tipo check (tipo in ('ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'proposta', 'nota', 'etapa'))
);

create index if not exists prospeccao_atividades_lead_idx on public.prospeccao_atividades (lead_id, data desc, created_at desc);
create index if not exists prospeccao_atividades_pendentes_idx on public.prospeccao_atividades (data) where not concluida;

alter table public.prospeccao_etapas     enable row level security;
alter table public.prospeccao_leads      enable row level security;
alter table public.prospeccao_atividades enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'prospeccao_leads' and policyname = 'prospeccao_leads_select') then
    create policy prospeccao_etapas_select on public.prospeccao_etapas for select to authenticated
      using (public.tem_permissao('tela.prospeccao'));
    -- "As etapas deverão ser configuráveis por administradores."
    create policy prospeccao_etapas_escrita on public.prospeccao_etapas for all to authenticated
      using (public.is_admin()) with check (public.is_admin());

    create policy prospeccao_leads_select on public.prospeccao_leads for select to authenticated
      using (public.tem_permissao('tela.prospeccao'));
    create policy prospeccao_leads_insert on public.prospeccao_leads for insert to authenticated
      with check (public.tem_permissao('dados.prospeccao.editar'));
    create policy prospeccao_leads_update on public.prospeccao_leads for update to authenticated
      using (public.tem_permissao('dados.prospeccao.editar')) with check (public.tem_permissao('dados.prospeccao.editar'));
    create policy prospeccao_leads_delete on public.prospeccao_leads for delete to authenticated
      using (public.tem_permissao('dados.prospeccao.excluir'));

    create policy prospeccao_atividades_select on public.prospeccao_atividades for select to authenticated
      using (public.tem_permissao('tela.prospeccao'));
    create policy prospeccao_atividades_insert on public.prospeccao_atividades for insert to authenticated
      with check (public.tem_permissao('dados.prospeccao.editar'));
    create policy prospeccao_atividades_update on public.prospeccao_atividades for update to authenticated
      using (public.tem_permissao('dados.prospeccao.editar')) with check (public.tem_permissao('dados.prospeccao.editar'));
    create policy prospeccao_atividades_delete on public.prospeccao_atividades for delete to authenticated
      using (public.tem_permissao('dados.prospeccao.editar') and (criado_por = (select auth.uid()) or public.tem_permissao('dados.prospeccao.excluir')));
  end if;
end $$;

create or replace function public.prospeccao_rotulo_tipo(p text)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'ligacao' then 'Ligação' when 'whatsapp' then 'WhatsApp' when 'email' then 'E-mail'
                when 'reuniao' then 'Reunião' when 'visita' then 'Visita' when 'proposta' then 'Proposta'
                when 'etapa' then 'Mudança de etapa' else 'Anotação' end;
$$;

create or replace function public.prospeccao_lead_carimbo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tipo text;
begin
  new.empresa := btrim(new.empresa);
  new.cnpj := nullif(regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g'), '');
  new.uf := nullif(upper(btrim(coalesce(new.uf, ''))), '');
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.criado_por := old.criado_por;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    select tipo into v_tipo from public.prospeccao_etapas where id = new.etapa_id;
    new.etapa_desde := now();
    new.convertido_em := case when v_tipo = 'ganha' then coalesce(new.convertido_em, now()) end;
    new.perdido_em := case when v_tipo = 'perdida' then coalesce(new.perdido_em, now()) end;
    if v_tipo <> 'perdida' then new.motivo_perda := null; end if;
  end if;
  return new;
end;
$$;

create or replace function public.prospeccao_lead_depois()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := (select nome from public.profiles where id = (select auth.uid()));
begin
  if tg_op = 'INSERT' then
    insert into public.prospeccao_atividades (lead_id, tipo, descricao, data, concluida, responsavel_id, criado_por_nome)
    values (new.id, 'etapa', 'Lead cadastrado em "' || (select nome from public.prospeccao_etapas where id = new.etapa_id) || '".',
            new.data_entrada, true, new.responsavel_id, v_nome);
  elsif new.etapa_id is distinct from old.etapa_id then
    insert into public.prospeccao_atividades (lead_id, tipo, descricao, data, concluida, responsavel_id, criado_por_nome, resultado)
    values (new.id, 'etapa',
            'De "' || (select nome from public.prospeccao_etapas where id = old.etapa_id) || '" para "' ||
            (select nome from public.prospeccao_etapas where id = new.etapa_id) || '".',
            public.hoje_brasil(), true, new.responsavel_id, v_nome, new.motivo_perda);
  end if;
  -- Trocar o responsável leva junto as ações que ainda vão acontecer.
  if tg_op = 'UPDATE' and new.responsavel_id is distinct from old.responsavel_id then
    update public.prospeccao_atividades set responsavel_id = new.responsavel_id
     where lead_id = new.id and not concluida and responsavel_id is not distinct from old.responsavel_id;
  end if;
  if tg_op = 'UPDATE' and new.empresa is distinct from old.empresa then
    update public.prospeccao_atividades set descricao = descricao where lead_id = new.id and agendada and not concluida;
  end if;
  return new;
end;
$$;

create or replace function public.prospeccao_atividade_carimbo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.criado_por := (select auth.uid()); end if;
    new.criado_por_nome := coalesce((select nome from public.profiles where id = new.criado_por), new.criado_por_nome);
  end if;
  if new.concluida then
    new.concluida_em := coalesce(new.concluida_em, now());
  else
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

create or replace function public.prospeccao_atividade_depois()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead uuid := coalesce(new.lead_id, old.lead_id);
  l public.prospeccao_leads;
begin
  if tg_op = 'DELETE' then
    perform public.agenda_remover('prospeccao_atividades', old.id::text, null);
  end if;

  update public.prospeccao_leads x
     set ultimo_contato_em = (select max(a.data) from public.prospeccao_atividades a
                              where a.lead_id = v_lead and a.concluida and a.tipo not in ('nota', 'etapa')),
         proxima_acao_em = (select min(a.data) from public.prospeccao_atividades a
                            where a.lead_id = v_lead and not a.concluida)
   where x.id = v_lead;

  if tg_op <> 'DELETE' then
    select * into l from public.prospeccao_leads where id = new.lead_id;
    perform public.agenda_publicar(
      p_modulo => 'prospeccao', p_tabela => 'prospeccao_atividades', p_id => new.id::text,
      p_titulo => public.prospeccao_rotulo_tipo(new.tipo) || ' — ' || l.empresa,
      p_data => case when new.agendada then new.data end, p_hora => new.hora,
      p_responsaveis => array[coalesce(new.responsavel_id, l.responsavel_id)],
      p_status => case when new.concluida then 'concluido' else 'pendente' end,
      p_link => '/prospeccao?lead=' || new.lead_id, p_permissao => 'tela.prospeccao',
      p_descricao => concat_ws(' · ', nullif(new.descricao, ''), 'Contato: ' || l.contato, l.telefone),
      p_departamento => 'Matriz', p_categoria => 'Interna', p_empresa => l.empresa);
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.prospeccao_lead_carimbo() from public, anon, authenticated;
revoke all on function public.prospeccao_lead_depois() from public, anon, authenticated;
revoke all on function public.prospeccao_atividade_carimbo() from public, anon, authenticated;
revoke all on function public.prospeccao_atividade_depois() from public, anon, authenticated;

create or replace trigger trg_prospeccao_lead_carimbo
  before insert or update on public.prospeccao_leads
  for each row execute function public.prospeccao_lead_carimbo();
create or replace trigger trg_prospeccao_lead_depois
  after insert or update on public.prospeccao_leads
  for each row execute function public.prospeccao_lead_depois();
create or replace trigger trg_prospeccao_atividade_carimbo
  before insert or update on public.prospeccao_atividades
  for each row execute function public.prospeccao_atividade_carimbo();
create or replace trigger trg_prospeccao_atividade_depois
  after insert or update or delete on public.prospeccao_atividades
  for each row execute function public.prospeccao_atividade_depois();

create or replace trigger trg_audit_prospeccao_leads
  after insert or update or delete on public.prospeccao_leads
  for each row execute function public.registrar_auditoria();
create or replace trigger trg_audit_prospeccao_etapas
  after insert or update or delete on public.prospeccao_etapas
  for each row execute function public.registrar_auditoria();

/** Indicadores do painel comercial — sempre sobre os registros reais. */
create or replace function public.prospeccao_indicadores(p_inicio date, p_fim date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with leads as (
    select l.*, e.tipo as etapa_tipo, e.nome as etapa_nome
    from public.prospeccao_leads l join public.prospeccao_etapas e on e.id = l.etapa_id
    where public.tem_permissao('tela.prospeccao')
  ),
  periodo as (
    select
      count(*) filter (where data_entrada between p_inicio and p_fim) as novos,
      count(*) filter (where etapa_tipo = 'ganha' and convertido_em::date between p_inicio and p_fim) as convertidos,
      count(*) filter (where etapa_tipo = 'perdida' and perdido_em::date between p_inicio and p_fim) as perdidos,
      coalesce(sum(valor_estimado) filter (where etapa_tipo = 'ganha' and convertido_em::date between p_inicio and p_fim), 0) as valor_ganho
    from leads
  )
  select jsonb_build_object(
    'total', (select count(*) from leads),
    'em_aberto', (select count(*) from leads where etapa_tipo = 'aberta'),
    'novos', (select novos from periodo),
    'convertidos', (select convertidos from periodo),
    'perdidos', (select perdidos from periodo),
    'valor_ganho', (select valor_ganho from periodo),
    'valor_em_aberto', (select coalesce(sum(valor_estimado), 0) from leads where etapa_tipo = 'aberta'),
    'taxa_conversao', (select case when convertidos + perdidos > 0 then round(convertidos * 100.0 / (convertidos + perdidos), 1) end from periodo),
    'funil', (select coalesce(jsonb_agg(jsonb_build_object('etapa_id', e.id, 'nome', e.nome, 'cor', e.cor, 'tipo', e.tipo,
                 'total', (select count(*) from leads l where l.etapa_id = e.id),
                 'valor', (select coalesce(sum(l.valor_estimado), 0) from leads l where l.etapa_id = e.id)) order by e.ordem), '[]'::jsonb)
              from public.prospeccao_etapas e where e.ativo and public.tem_permissao('tela.prospeccao')),
    'por_responsavel', (select coalesce(jsonb_agg(x order by x ->> 'nome'), '[]'::jsonb) from (
        select jsonb_build_object('id', l.responsavel_id, 'nome', coalesce(p.nome, 'Sem responsável'),
                 'leads', count(*), 'em_aberto', count(*) filter (where l.etapa_tipo = 'aberta'),
                 'convertidos', count(*) filter (where l.etapa_tipo = 'ganha' and l.convertido_em::date between p_inicio and p_fim),
                 'perdidos', count(*) filter (where l.etapa_tipo = 'perdida' and l.perdido_em::date between p_inicio and p_fim)) as x
        from leads l left join public.profiles p on p.id = l.responsavel_id
        group by l.responsavel_id, p.nome) s),
    'por_origem', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', o.origem, 'total', o.total, 'convertidos', o.convertidos) order by o.total desc), '[]'::jsonb) from (
        select coalesce(nullif(origem, ''), 'Não informada') as origem, count(*) as total,
               count(*) filter (where etapa_tipo = 'ganha') as convertidos
        from leads group by 1) o),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
                 'novos', (select count(*) from leads l where date_trunc('month', l.data_entrada) = m),
                 'convertidos', (select count(*) from leads l where l.etapa_tipo = 'ganha' and date_trunc('month', l.convertido_em) = m),
                 'perdidos', (select count(*) from leads l where l.etapa_tipo = 'perdida' and date_trunc('month', l.perdido_em) = m)) order by m), '[]'::jsonb)
               from generate_series(date_trunc('month', public.hoje_brasil()) - interval '5 months', date_trunc('month', public.hoje_brasil()), interval '1 month') m),
    'motivos_perda', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', x.motivo, 'total', x.total) order by x.total desc), '[]'::jsonb) from (
        select coalesce(nullif(motivo_perda, ''), 'Não informado') as motivo, count(*) as total
        from leads where etapa_tipo = 'perdida' group by 1) x),
    'pendentes', (select count(*) from public.prospeccao_atividades a join leads l on l.id = a.lead_id where not a.concluida),
    'atrasadas', (select count(*) from public.prospeccao_atividades a join leads l on l.id = a.lead_id where not a.concluida and a.data < public.hoje_brasil()),
    'sem_proxima_acao', (select count(*) from leads where etapa_tipo = 'aberta' and proxima_acao_em is null),
    'proximos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('id', a.id, 'lead_id', a.lead_id, 'empresa', l.empresa, 'tipo', a.tipo, 'descricao', a.descricao,
                 'data', a.data, 'hora', a.hora, 'responsavel', p.nome) as x
        from public.prospeccao_atividades a join leads l on l.id = a.lead_id
        left join public.profiles p on p.id = coalesce(a.responsavel_id, l.responsavel_id)
        where not a.concluida order by a.data, a.hora nulls last limit 12) s)
  );
$$;

revoke all on function public.prospeccao_rotulo_tipo(text) from public, anon;
revoke all on function public.prospeccao_indicadores(date, date) from public, anon;
grant execute on function public.prospeccao_rotulo_tipo(text) to authenticated;
grant execute on function public.prospeccao_indicadores(date, date) to authenticated;

do $$
declare v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['prospeccao_leads'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end $$;
