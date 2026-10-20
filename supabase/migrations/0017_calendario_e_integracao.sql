-- =====================================================================
-- PortalMPC — 0017 — Calendário de Obrigações e Integração de Clientes
-- ---------------------------------------------------------------------
-- Traz para o portal o "Portal Meta Plano" que rodava no Google Apps
-- Script (Codigo.gs + index.html). As cinco coleções da planilha
-- "Calendário Contábil - Dados" viram tabelas de verdade:
--
--   regras      → calendario_regras       (obrigações fixas)
--   eventos     → calendario_eventos      (compromissos, demandas, reuniões)
--   status      → calendario_conclusoes   (uma linha por item concluído)
--   integracoes → integracoes + integracao_departamentos
--   usuarios    → profiles + permissões do portal (não há mais senha
--                 numérica própria: entra-se com o login do portal)
--
-- As regras de acesso do Codigo.gs (quem_, geral_, pode_, podeInteg_)
-- viraram permissões e RLS:
--   Matriz                       → admin
--   "Acesso geral"               → dados.calendario.todos
--   Responsável do departamento  → dados.calendario.gerenciar (+ tela.integracao)
--   Colaborador                  → tela.calendario
--
-- As datas das obrigações fixas continuam calculadas, nunca gravadas:
-- `calendario_data_regra()` é a tradução de `dataRegra()` do index.html,
-- com feriados nacionais, Páscoa móvel e os feriados cadastrados.
-- =====================================================================

-- O valor novo do enum precisa existir (e estar confirmado) antes de ser
-- usado. Ao aplicar à mão, rode esta linha sozinha primeiro.
alter type public.app_area add value if not exists 'qualidade';

-- ---------------------------------------------------------------------
-- 1. Departamentos
-- ---------------------------------------------------------------------
create or replace function public.departamento_de_area(p_area public.app_area)
returns text
language sql immutable set search_path = ''
as $$
  select case p_area::text
    when 'legalizacao'          then 'Legalização'
    when 'fiscal'               then 'Fiscal'
    when 'contabil'             then 'Contabilidade'
    when 'departamento_pessoal' then 'Departamento Pessoal'
    when 'qualidade'            then 'Qualidade'
    else 'Matriz'
  end;
$$;

create or replace function public.meu_departamento()
returns text
language sql stable security definer set search_path = ''
as $$
  select public.departamento_de_area(p.area)
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.departamento_de_area(public.app_area) from public, anon;
revoke all on function public.meu_departamento() from public, anon;
grant execute on function public.departamento_de_area(public.app_area) to authenticated;
grant execute on function public.meu_departamento() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Permissões
-- ---------------------------------------------------------------------
insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('tela.calendario',  'Calendário de Obrigações', 'Obrigações, demandas e reuniões do seu departamento; marcar como concluído.', 'telas', '/calendario', false, 3),
  ('tela.integracao',  'Integração de Clientes',   'Roteiro da reunião de integração do cliente novo, por departamento.', 'telas', '/integracao-clientes', false, 4),
  ('dados.calendario.gerenciar', 'Gerenciar o calendário do departamento', 'Criar e editar obrigações fixas, compromissos e demandas do próprio departamento (Responsável do departamento).', 'dados', null, false, 50),
  ('dados.calendario.todos',     'Calendário de todos os departamentos',   'Ver e editar o calendário e as integrações de todos os departamentos (acesso geral).', 'dados', null, false, 51),
  ('dados.integracao.excluir',   'Excluir integrações',                     'Apagar uma integração de cliente inteira.', 'dados', null, false, 52)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem;

create or replace function public.cal_ver_todos()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.tem_permissao('dados.calendario.todos'); $$;

create or replace function public.cal_pode_ver(p_departamento text, p_visivel_para text[] default '{}')
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('tela.calendario') and (
    public.tem_permissao('dados.calendario.todos')
    or p_departamento = public.meu_departamento()
    or public.meu_departamento() = any (coalesce(p_visivel_para, '{}'))
  );
$$;

create or replace function public.cal_pode_editar(p_departamento text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('tela.calendario') and (
    public.tem_permissao('dados.calendario.todos')
    or (public.tem_permissao('dados.calendario.gerenciar') and p_departamento = public.meu_departamento())
  );
$$;

revoke all on function public.cal_ver_todos() from public, anon;
revoke all on function public.cal_pode_ver(text, text[]) from public, anon;
revoke all on function public.cal_pode_editar(text) from public, anon;
grant execute on function public.cal_ver_todos() to authenticated;
grant execute on function public.cal_pode_ver(text, text[]) to authenticated;
grant execute on function public.cal_pode_editar(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Tabelas do calendário
-- ---------------------------------------------------------------------
create table if not exists public.calendario_regras (
  id               text primary key default ('r' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  nome             text not null,
  departamento     text not null,
  categoria        text not null default 'Federal',
  regime           text not null default 'Todos',
  tipo             text not null default 'dia',
  dia              smallint not null default 20,
  ajuste           text not null default 'antecipa',
  meses            smallint[] not null default '{}',
  ref              text not null default '',
  descricao        text not null default '',
  ativo            boolean not null default true,
  sabado_util      boolean not null default false,
  responsavel_id   uuid references public.profiles (id) on delete set null,
  responsavel_nome text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by       uuid references public.profiles (id) on delete set null,

  constraint calendario_regras_nome check (length(btrim(nome)) between 1 and 140),
  constraint calendario_regras_departamento check (
    departamento in ('Matriz', 'Fiscal', 'Departamento Pessoal', 'Contabilidade', 'Legalização', 'Qualidade')),
  constraint calendario_regras_categoria check (
    categoria in ('Federal', 'Trabalhista', 'Estadual', 'Municipal', 'Interna', 'Outro', 'Feriado')),
  constraint calendario_regras_tipo check (tipo in ('dia', 'diaUtil', 'ultimoDiaUtil')),
  constraint calendario_regras_dia check (dia between 1 and 31),
  constraint calendario_regras_ajuste check (ajuste in ('antecipa', 'prorroga', 'nenhum')),
  constraint calendario_regras_ref check (ref in ('', 'mes', 'mes2', 'tri', 'ano', 'atual'))
);

comment on table public.calendario_regras is
  'Obrigações fixas (coleção "regras" do Portal Meta Plano). A data de cada mês é calculada.';

create table if not exists public.calendario_eventos (
  id                 text primary key default ('e' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  titulo             text not null,
  data               date not null,
  data_inicio        date,
  hora               time,
  tipo               text not null default '',
  categoria          text not null default 'Outro',
  departamento       text not null,
  visivel_para       text[] not null default '{}',
  responsavel_id     uuid references public.profiles (id) on delete set null,
  responsavel_nome   text,
  designado_por      uuid references public.profiles (id) on delete set null,
  designado_por_nome text,
  recorrencia        text not null default 'nenhuma',
  empresa_id         uuid references public.legalizacao_empresas (id) on delete set null,
  empresa            text,
  cnpj               text,
  contato            text,
  modalidade         text,
  notas              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by         uuid references public.profiles (id) on delete set null,

  constraint calendario_eventos_titulo check (length(btrim(titulo)) between 1 and 140),
  constraint calendario_eventos_departamento check (
    departamento in ('Matriz', 'Fiscal', 'Departamento Pessoal', 'Contabilidade', 'Legalização', 'Qualidade')),
  constraint calendario_eventos_categoria check (
    categoria in ('Federal', 'Trabalhista', 'Estadual', 'Municipal', 'Interna', 'Outro', 'Feriado')),
  constraint calendario_eventos_tipo check (tipo in ('', 'Demanda', 'Reunião Geral', 'Reunião de Integração')),
  constraint calendario_eventos_recorrencia check (recorrencia in ('nenhuma', 'mensal', 'anual')),
  constraint calendario_eventos_inicio check (data_inicio is null or data_inicio <= data),
  constraint calendario_eventos_modalidade check (
    modalidade is null or modalidade in ('', 'Presencial', 'On-line', 'Telefone'))
);

comment on table public.calendario_eventos is
  'Compromissos, demandas (prazo inicial e final) e reuniões (coleção "eventos").';

create index if not exists calendario_eventos_data_idx on public.calendario_eventos (data);
create index if not exists calendario_eventos_responsavel_idx on public.calendario_eventos (responsavel_id);
create index if not exists calendario_eventos_empresa_idx on public.calendario_eventos (empresa_id);
create index if not exists calendario_regras_responsavel_idx on public.calendario_regras (responsavel_id);

create table if not exists public.calendario_conclusoes (
  -- r:<id da regra>:<aaaa-mm-dd> | e:<id do evento>:<aaaa-mm-dd> — o mesmo
  -- formato do Portal Meta Plano, para que o histórico importado continue valendo.
  chave              text primary key,
  mes                text not null,
  concluido_em       timestamptz not null default now(),
  concluido_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  concluido_por_nome text,

  constraint calendario_conclusoes_chave check (chave ~ '^[re]:.+:\d{4}-\d{2}-\d{2}$'),
  constraint calendario_conclusoes_mes check (mes ~ '^\d{4}-\d{2}$')
);

create index if not exists calendario_conclusoes_mes_idx on public.calendario_conclusoes (mes);

-- Carimbos
create or replace function public.calendario_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  if tg_table_name = 'calendario_eventos' then
    new.cnpj := nullif(regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g'), '');
    if new.tipo = 'Demanda' then new.recorrencia := 'nenhuma'; else new.data_inicio := null; end if;
    -- Liga a demanda/reunião à empresa da base quando o CNPJ bate.
    if new.empresa_id is null and new.cnpj is not null and length(new.cnpj) = 14 then
      select e.id into new.empresa_id from public.legalizacao_empresas e
      where e.cnpj = new.cnpj order by e.created_at limit 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.calendario_carimbo() from public, anon, authenticated;

create or replace trigger trg_calendario_regras_carimbo
  before insert or update on public.calendario_regras
  for each row execute function public.calendario_carimbo();

create or replace trigger trg_calendario_eventos_carimbo
  before insert or update on public.calendario_eventos
  for each row execute function public.calendario_carimbo();

create or replace trigger trg_audit_calendario_regras
  after insert or update or delete on public.calendario_regras
  for each row execute function public.registrar_auditoria();

create or replace trigger trg_audit_calendario_eventos
  after insert or update or delete on public.calendario_eventos
  for each row execute function public.registrar_auditoria();

-- RLS
alter table public.calendario_regras     enable row level security;
alter table public.calendario_eventos    enable row level security;
alter table public.calendario_conclusoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'calendario_regras' and policyname = 'calendario_regras_select') then
    create policy calendario_regras_select on public.calendario_regras
      for select to authenticated using (public.cal_pode_ver(departamento));
    create policy calendario_regras_insert on public.calendario_regras
      for insert to authenticated with check (public.cal_pode_editar(departamento));
    create policy calendario_regras_update on public.calendario_regras
      for update to authenticated
      using (public.cal_pode_editar(departamento)) with check (public.cal_pode_editar(departamento));
    create policy calendario_regras_delete on public.calendario_regras
      for delete to authenticated using (public.cal_pode_editar(departamento));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'calendario_eventos' and policyname = 'calendario_eventos_select') then
    create policy calendario_eventos_select on public.calendario_eventos
      for select to authenticated using (public.cal_pode_ver(departamento, visivel_para));
    create policy calendario_eventos_insert on public.calendario_eventos
      for insert to authenticated with check (public.cal_pode_editar(departamento));
    create policy calendario_eventos_update on public.calendario_eventos
      for update to authenticated
      using (public.cal_pode_editar(departamento)) with check (public.cal_pode_editar(departamento));
    create policy calendario_eventos_delete on public.calendario_eventos
      for delete to authenticated using (public.cal_pode_editar(departamento));
  end if;

  -- Concluir é para todo mundo que vê o calendário (era assim no Apps Script).
  if not exists (select 1 from pg_policies where tablename = 'calendario_conclusoes' and policyname = 'calendario_conclusoes_select') then
    create policy calendario_conclusoes_select on public.calendario_conclusoes
      for select to authenticated using (public.tem_permissao('tela.calendario'));
    create policy calendario_conclusoes_insert on public.calendario_conclusoes
      for insert to authenticated
      with check (public.tem_permissao('tela.calendario')
                  and (concluido_por = (select auth.uid()) or public.is_admin()));
    create policy calendario_conclusoes_delete on public.calendario_conclusoes
      for delete to authenticated using (public.tem_permissao('tela.calendario'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Feriados e dias úteis — tradução de pascoa(), feriados() e isUtil()
-- ---------------------------------------------------------------------
create or replace function public.calendario_pascoa(p_ano integer)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  a int := p_ano % 19; b int := p_ano / 100; c int := p_ano % 100;
  d int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
  x int := h + l - 7 * m + 114;
begin
  return make_date(p_ano, x / 31, (x % 31) + 1);
end;
$$;

/**
 * Feriados do ano: nacionais fixos, os móveis da Páscoa e os cadastrados
 * pela equipe como evento de categoria "Feriado" (estaduais e municipais).
 * Roda com a RLS de quem pergunta, como o Apps Script, que só mandava ao
 * navegador os eventos do departamento da pessoa.
 */
create or replace function public.calendario_feriados(p_ano integer)
returns table (data date, nome text)
language sql stable set search_path = ''
as $$
  with pascoa as (select public.calendario_pascoa(p_ano) as p)
  select v.data, v.nome from (
    values
      (make_date(p_ano, 1, 1),   'Confraternização Universal'),
      (make_date(p_ano, 4, 21),  'Tiradentes'),
      (make_date(p_ano, 5, 1),   'Dia do Trabalho'),
      (make_date(p_ano, 9, 7),   'Independência'),
      (make_date(p_ano, 10, 12), 'N. Sra. Aparecida'),
      (make_date(p_ano, 11, 2),  'Finados'),
      (make_date(p_ano, 11, 15), 'Proclamação da República'),
      (make_date(p_ano, 11, 20), 'Consciência Negra'),
      (make_date(p_ano, 12, 25), 'Natal')
  ) as v(data, nome)
  union all select p - 48, 'Carnaval' from pascoa
  union all select p - 47, 'Carnaval' from pascoa
  union all select p - 2,  'Sexta-feira Santa' from pascoa
  union all select p + 60, 'Corpus Christi' from pascoa
  union all
  select case when ev.recorrencia = 'anual'
              then make_date(p_ano, extract(month from ev.data)::int,
                             least(extract(day from ev.data)::int,
                                   extract(day from (make_date(p_ano, extract(month from ev.data)::int, 1) + interval '1 month - 1 day'))::int))
              else ev.data end,
         ev.titulo
  from public.calendario_eventos ev
  where ev.categoria = 'Feriado'
    and (ev.recorrencia = 'anual' or extract(year from ev.data) = p_ano);
$$;

create or replace function public.calendario_eh_util(p_data date, p_feriados date[], p_sabado_util boolean default false)
returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when extract(dow from p_data) = 0 then false
    when extract(dow from p_data) = 6 and not p_sabado_util then false
    else not (p_data = any (coalesce(p_feriados, '{}')))
  end;
$$;

/** dataRegra(r, y, m) do index.html. Devolve null quando a regra não cai no mês. */
create or replace function public.calendario_data_regra(
  p_tipo text, p_dia integer, p_ajuste text, p_sabado_util boolean,
  p_ano integer, p_mes integer, p_feriados date[]
)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  v_ultimo int := extract(day from (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day'))::int;
  v_data date;
  v_cont int := 0;
  d int;
begin
  if p_tipo = 'diaUtil' then
    for d in 1..v_ultimo loop
      v_data := make_date(p_ano, p_mes, d);
      if public.calendario_eh_util(v_data, p_feriados, coalesce(p_sabado_util, false)) then
        v_cont := v_cont + 1;
        if v_cont = p_dia then return v_data; end if;
      end if;
    end loop;
    return null;
  end if;

  if p_tipo = 'ultimoDiaUtil' then
    for d in reverse v_ultimo..1 loop
      v_data := make_date(p_ano, p_mes, d);
      if public.calendario_eh_util(v_data, p_feriados, false) then return v_data; end if;
    end loop;
    return null;
  end if;

  v_data := make_date(p_ano, p_mes, least(greatest(coalesce(p_dia, 1), 1), v_ultimo));
  if p_ajuste = 'prorroga' then
    while not public.calendario_eh_util(v_data, p_feriados, false) loop v_data := v_data + 1; end loop;
  elsif p_ajuste = 'antecipa' then
    while not public.calendario_eh_util(v_data, p_feriados, false) loop v_data := v_data - 1; end loop;
  end if;
  return v_data;
end;
$$;

/** refLabel(r, y, m): competência a que a obrigação se refere. */
create or replace function public.calendario_ref_label(p_ref text, p_ano integer, p_mes integer)
returns text
language sql immutable set search_path = ''
as $$
  select case p_ref
    when 'mes'   then 'Ref. ' || to_char(make_date(p_ano, p_mes, 1) - interval '1 month', 'MM/YYYY')
    when 'mes2'  then 'Ref. ' || to_char(make_date(p_ano, p_mes, 1) - interval '2 month', 'MM/YYYY')
    when 'atual' then 'Ref. ' || to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY')
    when 'tri'   then 'Ref. ' || (extract(quarter from make_date(p_ano, p_mes, 1) - interval '1 month'))::int
                       || 'º tri/' || to_char(make_date(p_ano, p_mes, 1) - interval '1 month', 'YYYY')
    when 'ano'   then 'Ano-base ' || (p_ano - 1)
    else ''
  end;
$$;

revoke all on function public.calendario_pascoa(integer) from public, anon;
revoke all on function public.calendario_feriados(integer) from public, anon;
revoke all on function public.calendario_eh_util(date, date[], boolean) from public, anon;
revoke all on function public.calendario_data_regra(text, integer, text, boolean, integer, integer, date[]) from public, anon;
revoke all on function public.calendario_ref_label(text, integer, integer) from public, anon;
grant execute on function public.calendario_pascoa(integer) to authenticated;
grant execute on function public.calendario_feriados(integer) to authenticated;
grant execute on function public.calendario_eh_util(date, date[], boolean) to authenticated;
grant execute on function public.calendario_data_regra(text, integer, text, boolean, integer, integer, date[]) to authenticated;
grant execute on function public.calendario_ref_label(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ocorrências de um período — ocorrencias(y, m) do index.html
-- ---------------------------------------------------------------------
-- Usada pelas notificações, pelo Início e pelo Dashboard. A tela do
-- calendário faz a mesma conta no navegador (src/lib/calendario.ts), com
-- o mesmo algoritmo — os dois lados foram conferidos dia a dia.
create or replace function public.calendario_ocorrencias(p_inicio date, p_fim date)
returns table (
  chave text, fonte text, item_id text, titulo text, data date, prazo date, inicio boolean,
  departamento text, categoria text, tipo text, responsavel_id uuid, responsavel_nome text,
  empresa_id uuid, empresa text, ref text, concluido boolean, concluido_em timestamptz,
  concluido_por_nome text
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

  -- Regras: o mês anterior e o seguinte entram porque um vencimento que
  -- "prorroga" ou "antecipa" pode cair no mês vizinho.
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
        fonte := 'regra'; item_id := r.id; titulo := r.nome; data := v_data; prazo := v_data;
        inicio := false; departamento := r.departamento; categoria := r.categoria; tipo := '';
        responsavel_id := r.responsavel_id;
        responsavel_nome := coalesce((select p.nome from public.profiles p where p.id = r.responsavel_id), r.responsavel_nome);
        empresa_id := null; empresa := null;
        ref := public.calendario_ref_label(r.ref, v_ano, v_m);
        return next;
      end if;
    end loop;
    v_mes := v_mes + interval '1 month';
  end loop;

  -- Eventos
  for r in
    select * from public.calendario_eventos ce where ce.categoria <> 'Feriado'
  loop
    -- início da demanda (prazo inicial)
    if r.tipo = 'Demanda' and r.data_inicio is not null and r.data_inicio < r.data
       and r.data_inicio between p_inicio and p_fim then
      chave := 'e:' || r.id || ':' || to_char(r.data, 'YYYY-MM-DD');
      fonte := 'evento'; item_id := r.id; titulo := '▶ Início: ' || r.titulo; data := r.data_inicio;
      prazo := r.data; inicio := true; departamento := r.departamento; categoria := r.categoria;
      tipo := r.tipo; responsavel_id := r.responsavel_id;
      responsavel_nome := coalesce((select p.nome from public.profiles p where p.id = r.responsavel_id), r.responsavel_nome);
      empresa_id := r.empresa_id; empresa := r.empresa; ref := '';
      return next;
    end if;

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
        fonte := 'evento'; item_id := r.id; titulo := r.titulo; data := v_data; prazo := v_data;
        inicio := false; departamento := r.departamento; categoria := r.categoria; tipo := r.tipo;
        responsavel_id := r.responsavel_id;
        responsavel_nome := coalesce((select p.nome from public.profiles p where p.id = r.responsavel_id), r.responsavel_nome);
        empresa_id := r.empresa_id; empresa := r.empresa; ref := '';
        return next;
      end if;
      v_mes := v_mes + interval '1 month';
    end loop;
  end loop;
end;
$$;

-- Versão com a situação: junta as conclusões. Separada para que a função
-- acima continue simples de conferir contra o JavaScript.
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
         (c.chave is not null) as concluido, c.concluido_em,
         coalesce((select p.nome from public.profiles p where p.id = c.concluido_por), c.concluido_por_nome)
  from public.calendario_ocorrencias(p_inicio, p_fim) o
  left join public.calendario_conclusoes c on c.chave = o.chave
  order by o.data, o.titulo;
$$;

revoke all on function public.calendario_ocorrencias(date, date) from public, anon;
revoke all on function public.calendario_agenda(date, date) from public, anon;
grant execute on function public.calendario_ocorrencias(date, date) to authenticated;
grant execute on function public.calendario_agenda(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Integração de clientes
-- ---------------------------------------------------------------------
create table if not exists public.integracoes (
  id              text primary key default ('i' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  -- Ficha comum a todos os departamentos (FICHA_BASE do index.html)
  ficha           jsonb not null default '{}'::jsonb,
  empresa_id      uuid references public.legalizacao_empresas (id) on delete set null,
  evento_id       text references public.calendario_eventos (id) on delete set null,
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null,

  constraint integracoes_ficha_objeto check (jsonb_typeof(ficha) = 'object')
);

create table if not exists public.integracao_departamentos (
  integracao_id       text not null references public.integracoes (id) on delete cascade,
  departamento        text not null,
  -- itens, campos, prazos, docs, ficha do departamento, combinados, retorno
  dados               jsonb not null default '{}'::jsonb,
  atendido_por        text,
  finalizado          boolean not null default false,
  finalizado_em       timestamptz,
  finalizado_por      uuid references public.profiles (id) on delete set null,
  finalizado_por_nome text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id) on delete set null,

  primary key (integracao_id, departamento),
  constraint integracao_departamentos_dep check (
    departamento in ('Qualidade', 'Legalização', 'Fiscal', 'Contabilidade', 'Departamento Pessoal')),
  constraint integracao_departamentos_dados_objeto check (jsonb_typeof(dados) = 'object')
);

create index if not exists integracoes_empresa_idx on public.integracoes (empresa_id);

create or replace function public.integracoes_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  if tg_table_name = 'integracoes' then
    -- Liga a ficha à base pelo CNPJ digitado, quando ainda não há vínculo.
    if new.empresa_id is null
       and length(regexp_replace(coalesce(new.ficha ->> 'cnpj', ''), '\D', '', 'g')) = 14 then
      select e.id into new.empresa_id from public.legalizacao_empresas e
      where e.cnpj = regexp_replace(new.ficha ->> 'cnpj', '\D', '', 'g')
      order by e.created_at limit 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.integracoes_carimbo() from public, anon, authenticated;

create or replace trigger trg_integracoes_carimbo
  before insert or update on public.integracoes
  for each row execute function public.integracoes_carimbo();

create or replace trigger trg_integracao_departamentos_carimbo
  before insert or update on public.integracao_departamentos
  for each row execute function public.integracoes_carimbo();

/**
 * Roteiro finalizado fica travado. "Colaborador não reabre nem altera um
 * roteiro já finalizado; o responsável do departamento pode" (Codigo.gs).
 */
create or replace function public.integracao_proteger_finalizado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pode_reabrir boolean :=
    (select auth.uid()) is null
    or public.tem_permissao('dados.calendario.todos')
    or (public.tem_permissao('dados.calendario.gerenciar') and new.departamento = public.meu_departamento());
begin
  if old.finalizado and not v_pode_reabrir then
    raise exception 'Este roteiro já foi finalizado. Só o responsável do departamento pode reabri-lo.'
      using errcode = '42501';
  end if;
  if new.finalizado and not old.finalizado then
    new.finalizado_em := coalesce(new.finalizado_em, now());
    new.finalizado_por := coalesce(new.finalizado_por, (select auth.uid()));
  end if;
  if not new.finalizado then
    new.finalizado_em := null;
    new.finalizado_por := null;
    new.finalizado_por_nome := null;
  end if;
  return new;
end;
$$;

revoke all on function public.integracao_proteger_finalizado() from public, anon, authenticated;

create or replace trigger trg_integracao_proteger_finalizado
  before update on public.integracao_departamentos
  for each row execute function public.integracao_proteger_finalizado();

create or replace trigger trg_audit_integracoes
  after insert or update or delete on public.integracoes
  for each row execute function public.registrar_auditoria();

alter table public.integracoes             enable row level security;
alter table public.integracao_departamentos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'integracoes' and policyname = 'integracoes_select') then
    create policy integracoes_select on public.integracoes
      for select to authenticated using (public.tem_permissao('tela.integracao'));
    create policy integracoes_insert on public.integracoes
      for insert to authenticated with check (public.tem_permissao('tela.integracao'));
    create policy integracoes_update on public.integracoes
      for update to authenticated
      using (public.tem_permissao('tela.integracao')) with check (public.tem_permissao('tela.integracao'));
    create policy integracoes_delete on public.integracoes
      for delete to authenticated
      using (public.tem_permissao('dados.integracao.excluir') or public.tem_permissao('dados.calendario.todos'));
  end if;

  -- O roteiro de um departamento é dele: os demais veem só a situação,
  -- pela função integracoes_resumo() abaixo.
  if not exists (select 1 from pg_policies where tablename = 'integracao_departamentos' and policyname = 'integracao_departamentos_select') then
    create policy integracao_departamentos_select on public.integracao_departamentos
      for select to authenticated
      using (public.tem_permissao('tela.integracao')
             and (public.tem_permissao('dados.calendario.todos') or departamento = public.meu_departamento()));
    create policy integracao_departamentos_insert on public.integracao_departamentos
      for insert to authenticated
      with check (public.tem_permissao('tela.integracao')
                  and (public.tem_permissao('dados.calendario.todos') or departamento = public.meu_departamento()));
    create policy integracao_departamentos_update on public.integracao_departamentos
      for update to authenticated
      using (public.tem_permissao('tela.integracao')
             and (public.tem_permissao('dados.calendario.todos') or departamento = public.meu_departamento()))
      with check (public.tem_permissao('tela.integracao')
             and (public.tem_permissao('dados.calendario.todos') or departamento = public.meu_departamento()));
    create policy integracao_departamentos_delete on public.integracao_departamentos
      for delete to authenticated
      using (public.tem_permissao('dados.integracao.excluir') or public.tem_permissao('dados.calendario.todos'));
  end if;
end $$;

/** Situação de cada roteiro, para os selos da lista — sem o conteúdo. */
create or replace function public.integracoes_resumo()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.tem_permissao('tela.integracao') then '[]'::jsonb else (
    select coalesce(jsonb_agg(jsonb_build_object(
      'integracao_id', d.integracao_id,
      'departamento', d.departamento,
      'finalizado', d.finalizado,
      'finalizado_em', d.finalizado_em,
      'finalizado_por', coalesce(p.nome, d.finalizado_por_nome),
      'atendido_por', d.atendido_por
    )), '[]'::jsonb)
    from public.integracao_departamentos d
    left join public.profiles p on p.id = d.finalizado_por
  ) end;
$$;

revoke all on function public.integracoes_resumo() from public, anon;
grant execute on function public.integracoes_resumo() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Obrigações fixas do Portal Meta Plano (SEED + NOVAS_OBRIGACOES +
--    AJUSTES_ECONET do Codigo.gs, já combinados como o próprio arquivo faz)
-- ---------------------------------------------------------------------
insert into public.calendario_regras
  (id, nome, departamento, categoria, regime, tipo, dia, ajuste, meses, ref, descricao, ativo, sabado_util)
values
  ('alvaras', 'Alvarás e licenças municipais – conferir vencimentos', 'Legalização', 'Municipal', 'Todos', 'diaUtil', 1, 'nenhum', '{}'::smallint[], '', 'Funcionamento, vigilância sanitária, bombeiros. Protocolar a renovação com 60 dias de antecedência. Cada renovação entra como Demanda.', true, false),
  ('caged', 'CAGED (via eSocial) – movimentação de empregados', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 7, 'antecipa', '{}'::smallint[], 'mes', 'Admissões e desligamentos do mês anterior (S-2200 / S-2299).', true, false),
  ('certidoes', 'Certidões negativas – monitoramento (CND, CNDT, FGTS, estadual, municipal)', 'Legalização', 'Interna', 'Todos', 'diaUtil', 1, 'nenhum', '{}'::smallint[], '', 'Emitir nova certidão 10 dias antes do vencimento.', true, false),
  ('conselho-rt', 'Renovação de Conselho de Classe e RT – conferir vencimentos', 'Legalização', 'Outro', 'Todos', 'diaUtil', 1, 'nenhum', '{}'::smallint[], '', 'Conferência mensal. A renovação de cada empresa entra como Demanda.', true, false),
  ('darf-inss-irrf', 'DARF previdenciário (INSS) e IRRF', 'Departamento Pessoal', 'Federal', 'Todos', 'dia', 20, 'antecipa', '{}'::smallint[], 'mes', 'DARF numerado da DCTFWeb e IRRF retido.', true, false),
  ('das-mei', 'DAS MEI', 'Fiscal', 'Federal', 'MEI', 'dia', 20, 'prorroga', '{}'::smallint[], 'mes', '', true, false),
  ('das-simples', 'PGDAS-D e DAS – Simples Nacional', 'Fiscal', 'Federal', 'Simples Nacional', 'dia', 20, 'prorroga', '{}'::smallint[], 'mes', 'Declaração e pagamento do DAS.', true, false),
  ('dasn-simei', 'DASN-SIMEI', 'Fiscal', 'Federal', 'MEI', 'dia', 31, 'antecipa', array[5]::smallint[], 'ano', '', true, false),
  ('dbf', 'Declaração de Beneficiário Final (Receita Federal)', 'Legalização', 'Federal', 'Todos', 'dia', 31, 'antecipa', array[7]::smallint[], 'ano', 'Ou em até 30 dias após alteração societária.', true, false),
  ('dctfweb', 'DCTFWeb – transmissão', 'Departamento Pessoal', 'Federal', 'Todos', 'ultimoDiaUtil', 15, 'antecipa', '{}'::smallint[], 'mes', 'Vence no último dia útil do mês seguinte (conferido no Econet).', true, false),
  ('decimo-1', '13º salário – 1ª parcela', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 30, 'antecipa', array[11]::smallint[], '', '', true, false),
  ('decimo-2', '13º salário – 2ª parcela', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 20, 'antecipa', array[12]::smallint[], '', '', true, false),
  ('defis', 'DEFIS', 'Fiscal', 'Federal', 'Simples Nacional', 'dia', 31, 'antecipa', array[3]::smallint[], 'ano', '', true, false),
  ('destda', 'DeSTDA', 'Fiscal', 'Estadual', 'Simples Nacional', 'dia', 28, 'prorroga', '{}'::smallint[], 'mes', 'ST, DIFAL e antecipação do Simples.', true, false),
  ('dipam-b', 'DIPAM-B – Declaração para o Imposto sobre Transmissão de Bens Imóveis (SP)', 'Contabilidade', 'Municipal', 'Todos', 'dia', 31, 'antecipa', array[3]::smallint[], 'ano', 'Para sociedades que possuam imóveis.', true, false),
  ('dirbi', 'DIRBI – Declaração de Incentivos, Renúncias, Benefícios e Imunidades', 'Fiscal', 'Federal', 'Presumido/Real', 'dia', 20, 'antecipa', '{}'::smallint[], 'mes2', 'Para empresas que usam benefícios fiscais.', true, false),
  ('ecd', 'ECD', 'Contabilidade', 'Federal', 'Presumido/Real', 'ultimoDiaUtil', 1, 'nenhum', array[6]::smallint[], 'ano', '', true, false),
  ('ecf', 'ECF', 'Contabilidade', 'Federal', 'Presumido/Real', 'ultimoDiaUtil', 1, 'nenhum', array[7]::smallint[], 'ano', '', true, false),
  ('efd-contrib', 'EFD-Contribuições', 'Fiscal', 'Federal', 'Presumido/Real', 'diaUtil', 10, 'nenhum', '{}'::smallint[], 'mes2', '', true, false),
  ('efd-icms-ipi', 'EFD ICMS/IPI (SPED Fiscal)', 'Fiscal', 'Estadual', 'Presumido/Real', 'dia', 20, 'antecipa', '{}'::smallint[], 'mes', 'SP: dia 20 (conferido no Econet).', true, false),
  ('efd-reinf', 'EFD-Reinf', 'Fiscal', 'Federal', 'Todos', 'dia', 15, 'antecipa', '{}'::smallint[], 'mes', '', true, false),
  ('esocial', 'eSocial – eventos periódicos', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 15, 'antecipa', '{}'::smallint[], 'mes', 'Folha (S-1200/S-1210) e fechamento S-1299.', true, false),
  ('faturamento-matriz', 'Aba FATURAMENTO na matriz', 'Fiscal', 'Interna', 'Todos', 'diaUtil', 5, 'nenhum', '{}'::smallint[], 'mes', '', true, false),
  ('fgts', 'FGTS Digital', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 20, 'antecipa', '{}'::smallint[], 'mes', '', true, false),
  ('holerite', 'Holerite / contracheque – entrega aos empregados', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'diaUtil', 5, 'nenhum', '{}'::smallint[], 'mes', 'Guardar comprovante de entrega. Contagem da CLT: o sábado conta como dia útil.', true, true),
  ('icms', 'ICMS – apuração e recolhimento', 'Fiscal', 'Estadual', 'Presumido/Real', 'dia', 20, 'antecipa', '{}'::smallint[], 'mes', 'SP: código 1200 (regra geral) vence no dia 20. Outros códigos de recolhimento vencem em dias diferentes (13, 15, 26) – conferido no Econet.', true, false),
  ('informes', 'Informes de rendimentos', 'Departamento Pessoal', 'Federal', 'Todos', 'ultimoDiaUtil', 1, 'nenhum', array[2]::smallint[], 'ano', '', true, false),
  ('inss-13', 'INSS sobre o 13º salário', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 20, 'antecipa', array[12]::smallint[], '', 'Recolhimento do INSS da 2ª parcela do 13º.', true, false),
  ('ipi', 'IPI', 'Fiscal', 'Federal', 'Presumido/Real', 'dia', 25, 'antecipa', '{}'::smallint[], 'mes', 'Só para indústrias e equiparadas.', true, false),
  ('irpf', 'IRPF – declaração dos sócios', 'Contabilidade', 'Federal', 'Todos', 'ultimoDiaUtil', 1, 'nenhum', array[5]::smallint[], 'ano', 'Confira o prazo do ano na Receita.', true, false),
  ('irpj-csll-mensal', 'IRPJ/CSLL estimativa mensal', 'Contabilidade', 'Federal', 'Lucro Real', 'ultimoDiaUtil', 1, 'nenhum', '{}'::smallint[], 'mes', '', true, false),
  ('irpj-csll-tri', 'IRPJ/CSLL trimestral', 'Contabilidade', 'Federal', 'Lucro Presumido', 'ultimoDiaUtil', 1, 'nenhum', array[1,4,7,10]::smallint[], 'tri', 'Quota única ou 1ª quota.', true, false),
  ('iss', 'ISS – recolhimento e declaração', 'Fiscal', 'Municipal', 'Todos', 'dia', 10, 'prorroga', '{}'::smallint[], 'mes', 'Município de São Paulo: dia 10; se não for dia útil, prorroga (conferido no Econet).', true, false),
  ('licencas-sanitarias', 'Licenças sanitárias – conferir vencimentos e renovar', 'Legalização', 'Municipal', 'Todos', 'diaUtil', 1, 'nenhum', '{}'::smallint[], '', 'Conferência mensal. A renovação de cada empresa entra como Demanda, com prazo inicial e final.', true, false),
  ('pis-cofins', 'PIS/COFINS', 'Fiscal', 'Federal', 'Presumido/Real', 'dia', 25, 'antecipa', '{}'::smallint[], 'mes', '', true, false),
  ('rbt12-rba', 'Atualizar RBT12/RBA na matriz', 'Fiscal', 'Interna', 'Simples Nacional', 'dia', 21, 'prorroga', '{}'::smallint[], 'mes', 'Depois da transmissão do PGDAS.', true, false),
  ('salarios', 'Pagamento de salários', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'diaUtil', 5, 'nenhum', '{}'::smallint[], 'mes', 'Contagem da CLT: o sábado conta como dia útil.', true, true),
  ('sieg', 'Relatórios SIEG do fechamento', 'Fiscal', 'Interna', 'Todos', 'diaUtil', 3, 'nenhum', '{}'::smallint[], 'mes', 'Produtos NF-e, CT-e e NFS ABRASF.', true, false),
  ('sindicato', 'Sindicato – PLR, reajuste e abonos (convenção coletiva)', 'Departamento Pessoal', 'Trabalhista', 'Todos', 'dia', 1, 'antecipa', '{}'::smallint[], '', 'Sem data fixa: depende da convenção/acordo coletivo (CCT/ACT). Quando souber a data, edite, ajuste o dia e os meses e ative.', false, false)
on conflict (id) do nothing;
