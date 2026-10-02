-- =====================================================================
-- PortalMPC — 0011 — Atribuições recorrentes
-- ---------------------------------------------------------------------
-- "Fulano, do time de Legalização, é responsável por manter a coluna
--  ALVARÁ de todos os clientes atualizada todo mês."
--
-- Cada atribuição guarda: responsável, colunas sob sua guarda, com que
-- frequência revisar, o próximo prazo e com quantos dias de antecedência
-- avisar. Ao concluir um ciclo o prazo avança sozinho.
-- =====================================================================

do $$ begin
  create type public.periodicidade as enum (
    'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'avulsa'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.atribuicoes (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  descricao         text,
  responsavel_id    uuid not null references public.profiles (id) on delete cascade,
  area              public.app_area not null default 'legalizacao',
  tabela            text not null default 'legalizacao_empresas',
  -- Colunas sob responsabilidade. Vazio = a linha inteira.
  colunas           text[] not null default '{}',
  periodicidade     public.periodicidade not null default 'mensal',
  proximo_prazo     date not null default (current_date + 30),
  alerta_dias_antes integer not null default 5,
  ativa             boolean not null default true,
  criado_por        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint atribuicoes_titulo_nao_vazio check (length(btrim(titulo)) > 0),
  constraint atribuicoes_alerta_valido check (alerta_dias_antes between 0 and 90)
);

comment on table public.atribuicoes is
  'Responsabilidades recorrentes: quem cuida de quais colunas e com que frequência.';

create index if not exists atribuicoes_responsavel_idx on public.atribuicoes (responsavel_id);
create index if not exists atribuicoes_prazo_idx on public.atribuicoes (proximo_prazo) where ativa;
create index if not exists atribuicoes_area_idx on public.atribuicoes (area);

drop trigger if exists trg_atribuicoes_updated_at on public.atribuicoes;
create trigger trg_atribuicoes_updated_at
  before update on public.atribuicoes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Histórico de ciclos concluídos
-- ---------------------------------------------------------------------
create table if not exists public.atribuicao_execucoes (
  id             uuid primary key default gen_random_uuid(),
  atribuicao_id  uuid not null references public.atribuicoes (id) on delete cascade,
  competencia    date not null,               -- o prazo daquele ciclo
  concluida_em   timestamptz not null default now(),
  concluida_por  uuid references public.profiles (id) on delete set null,
  observacao     text,
  constraint atribuicao_execucoes_unica unique (atribuicao_id, competencia)
);

create index if not exists atribuicao_execucoes_atribuicao_idx
  on public.atribuicao_execucoes (atribuicao_id, competencia desc);

-- ---------------------------------------------------------------------
-- Avanço do prazo conforme a periodicidade
-- ---------------------------------------------------------------------
create or replace function public.proximo_prazo_apos(p_base date, p_periodicidade public.periodicidade)
returns date
language sql immutable set search_path = ''
as $$
  select case p_periodicidade
    when 'semanal'    then p_base + interval '7 days'
    when 'quinzenal'  then p_base + interval '15 days'
    when 'mensal'     then p_base + interval '1 month'
    when 'bimestral'  then p_base + interval '2 months'
    when 'trimestral' then p_base + interval '3 months'
    when 'semestral'  then p_base + interval '6 months'
    when 'anual'      then p_base + interval '1 year'
    else p_base
  end::date;
$$;

revoke all on function public.proximo_prazo_apos(date, public.periodicidade) from public, anon;
grant execute on function public.proximo_prazo_apos(date, public.periodicidade) to authenticated;

/**
 * Marca o ciclo atual como concluído e adianta o prazo.
 * Só o responsável, um admin ou quem gerencia atribuições pode chamar.
 */
create or replace function public.concluir_atribuicao(p_atribuicao uuid, p_observacao text default null)
returns public.atribuicoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_atr public.atribuicoes;
  v_uid uuid := (select auth.uid());
begin
  select * into v_atr from public.atribuicoes where id = p_atribuicao;
  if not found then
    raise exception 'Atribuição não encontrada.' using errcode = 'P0002';
  end if;

  if v_atr.responsavel_id <> v_uid
     and not public.is_admin()
     and not public.tem_permissao('admin.atribuicoes.gerenciar') then
    raise exception 'Somente o responsável pode concluir esta atribuição.' using errcode = '42501';
  end if;

  insert into public.atribuicao_execucoes (atribuicao_id, competencia, concluida_por, observacao)
  values (p_atribuicao, v_atr.proximo_prazo, v_uid, p_observacao)
  on conflict (atribuicao_id, competencia) do update
    set concluida_em = now(), concluida_por = excluded.concluida_por, observacao = excluded.observacao;

  -- Atribuição avulsa não se repete: encerra ao ser concluída.
  if v_atr.periodicidade = 'avulsa' then
    update public.atribuicoes set ativa = false where id = p_atribuicao returning * into v_atr;
  else
    update public.atribuicoes
    set proximo_prazo = public.proximo_prazo_apos(
          greatest(v_atr.proximo_prazo, current_date), v_atr.periodicidade)
    where id = p_atribuicao
    returning * into v_atr;
  end if;

  return v_atr;
end;
$$;

revoke all on function public.concluir_atribuicao(uuid, text) from public, anon;
grant execute on function public.concluir_atribuicao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Visão do responsável: o que vence, o que atrasou
-- ---------------------------------------------------------------------
create or replace function public.minhas_atribuicoes()
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(linha order by (linha ->> 'proximo_prazo')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', a.id,
      'titulo', a.titulo,
      'descricao', a.descricao,
      'colunas', a.colunas,
      'periodicidade', a.periodicidade,
      'proximo_prazo', a.proximo_prazo,
      'alerta_dias_antes', a.alerta_dias_antes,
      'dias_restantes', (a.proximo_prazo - current_date),
      'situacao', case
        when a.proximo_prazo < current_date then 'atrasada'
        when a.proximo_prazo - current_date <= a.alerta_dias_antes then 'proxima'
        else 'em_dia'
      end,
      'ultima_conclusao', (
        select max(e.concluida_em) from public.atribuicao_execucoes e where e.atribuicao_id = a.id
      )
    ) as linha
    from public.atribuicoes a
    where a.ativa and a.responsavel_id = (select auth.uid())
  ) x;
$$;

revoke all on function public.minhas_atribuicoes() from public, anon;
grant execute on function public.minhas_atribuicoes() to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.atribuicoes         enable row level security;
alter table public.atribuicao_execucoes enable row level security;

-- Todo mundo do portal enxerga as atribuições: saber "de quem é isso"
-- foi pedido explicitamente. Editar é que exige permissão.
drop policy if exists atribuicoes_select on public.atribuicoes;
create policy atribuicoes_select on public.atribuicoes
  for select to authenticated using (public.is_active());

drop policy if exists atribuicoes_escrita on public.atribuicoes;
create policy atribuicoes_escrita on public.atribuicoes
  for all to authenticated
  using (public.tem_permissao('admin.atribuicoes.gerenciar'))
  with check (public.tem_permissao('admin.atribuicoes.gerenciar'));

drop policy if exists atribuicao_execucoes_select on public.atribuicao_execucoes;
create policy atribuicao_execucoes_select on public.atribuicao_execucoes
  for select to authenticated using (public.is_active());

-- Gravação apenas via concluir_atribuicao() (SECURITY DEFINER), que confere
-- se quem chamou é o responsável.
drop policy if exists atribuicao_execucoes_gestor on public.atribuicao_execucoes;
create policy atribuicao_execucoes_gestor on public.atribuicao_execucoes
  for all to authenticated
  using (public.tem_permissao('admin.atribuicoes.gerenciar'))
  with check (public.tem_permissao('admin.atribuicoes.gerenciar'));

-- ---------------------------------------------------------------------
-- Auditoria também para as novas tabelas
-- ---------------------------------------------------------------------
drop trigger if exists trg_audit_atribuicoes on public.atribuicoes;
create trigger trg_audit_atribuicoes
  after insert or update or delete on public.atribuicoes
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_audit_usuario_permissoes on public.usuario_permissoes;
create trigger trg_audit_usuario_permissoes
  after insert or delete on public.usuario_permissoes
  for each row execute function public.registrar_auditoria();
