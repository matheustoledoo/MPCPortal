-- =====================================================================
-- PortalMPC — 0026 — Empresas ativas/inativas, histórico de movimentações
--                    e documentos
-- ---------------------------------------------------------------------
-- * `situacao` (ativa | inativa) é a situação da empresa NA CARTEIRA do
--   escritório, com data e motivo da saída. Empresa que sai não é apagada:
--   fica inativa, com tudo preservado, e pode ser reativada.
-- * `empresa_movimentacoes` é a linha do tempo de cada empresa. Só aceita
--   INSERT: nada é alterado nem apagado depois de registrado. Mudanças de
--   regime, razão social, cidade, sócios, responsável e situação entram
--   sozinhas, por gatilho, com a situação anterior e a nova.
-- * `empresa_documentos`: arquivos ligados à empresa ou a uma movimentação.
-- * As validades (AVCB, Vigilância, RT) das empresas ativas vão para a
--   agenda central.
-- =====================================================================

alter table public.legalizacao_empresas
  add column if not exists situacao     text not null default 'ativa',
  add column if not exists data_saida   date,
  add column if not exists motivo_saida text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'legalizacao_empresas_situacao') then
    alter table public.legalizacao_empresas
      add constraint legalizacao_empresas_situacao check (situacao in ('ativa', 'inativa'));
  end if;
end $$;

create index if not exists legalizacao_empresas_situacao_idx on public.legalizacao_empresas (situacao);

-- Excluir de vez fica só com administradores (cadastro feito por engano).
-- Quem tinha "excluir" passa a INATIVAR, que preserva os dados.
alter policy legalizacao_empresas_delete on public.legalizacao_empresas
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Linha do tempo
-- ---------------------------------------------------------------------
create table if not exists public.empresa_movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.legalizacao_empresas (id) on delete cascade,
  tipo               text not null,
  data_ocorrencia    date not null default current_date,
  descricao          text not null default '',
  situacao_anterior  text,
  nova_situacao      text,
  campo              text,
  automatica         boolean not null default false,
  anexos             jsonb not null default '[]'::jsonb,
  registrado_por     uuid references public.profiles (id) on delete set null default auth.uid(),
  registrado_por_nome text,
  registrado_em      timestamptz not null default now(),
  constraint empresa_movimentacoes_tipo check (length(btrim(tipo)) between 1 and 80),
  constraint empresa_movimentacoes_anexos check (jsonb_typeof(anexos) = 'array')
);

comment on table public.empresa_movimentacoes is
  'Histórico de movimentações de cada empresa. Somente inclusão: o que foi registrado não muda nem some.';

create index if not exists empresa_movimentacoes_empresa_idx on public.empresa_movimentacoes (empresa_id, data_ocorrencia desc, registrado_em desc);

alter table public.empresa_movimentacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'empresa_movimentacoes' and policyname = 'empresa_movimentacoes_select') then
    create policy empresa_movimentacoes_select on public.empresa_movimentacoes
      for select to authenticated using (public.can_read_legalizacao());
    create policy empresa_movimentacoes_insert on public.empresa_movimentacoes
      for insert to authenticated with check (public.can_write_legalizacao());
    -- Sem políticas de UPDATE e DELETE: o histórico é permanente.
  end if;
end $$;

create or replace function public.empresa_movimentacao_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'O histórico de movimentações não pode ser alterado. Registre uma nova movimentação.' using errcode = '42501';
  end if;
  if (select auth.uid()) is not null then
    new.registrado_por := (select auth.uid());
    new.registrado_em := now();
    -- Só os gatilhos do portal marcam uma movimentação como automática.
    if current_setting('portal.mov_auto', true) is distinct from '1' then
      new.automatica := false;
    end if;
  end if;
  new.registrado_por_nome := coalesce((select nome from public.profiles where id = new.registrado_por), new.registrado_por_nome);
  new.tipo := btrim(new.tipo);
  return new;
end;
$$;

revoke all on function public.empresa_movimentacao_carimbo() from public, anon, authenticated;

create or replace trigger trg_empresa_movimentacao_carimbo
  before insert or update on public.empresa_movimentacoes
  for each row execute function public.empresa_movimentacao_carimbo();

-- Situação e status da planilha andam juntos.
create or replace function public.empresa_situacao_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inativos text[] := array['INATIVO', 'BAIXADO'];
begin
  if tg_op = 'INSERT' then
    if new.status = any (v_inativos) then new.situacao := 'inativa'; end if;
  else
    -- Mudou o status na célula: a situação acompanha.
    if new.status is distinct from old.status and new.situacao = old.situacao then
      if new.status = any (v_inativos) then new.situacao := 'inativa';
      elsif old.status = any (v_inativos) then new.situacao := 'ativa';
      end if;
    end if;
  end if;

  if new.situacao = 'inativa' then
    new.data_saida := coalesce(new.data_saida, public.hoje_brasil());
    if not (new.status = any (v_inativos)) then new.status := 'INATIVO'; end if;
  else
    if tg_op = 'UPDATE' and old.situacao = 'inativa' then
      new.data_saida := null;
      new.motivo_saida := null;
    end if;
    if new.status = any (v_inativos) then new.status := 'ATIVO'; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.empresa_situacao_coerente() from public, anon, authenticated;

create or replace trigger trg_empresa_situacao_coerente
  before insert or update on public.legalizacao_empresas
  for each row execute function public.empresa_situacao_coerente();

-- Registra sozinho o que muda no cadastro.
create or replace function public.empresa_registrar_movimentacoes()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_obs text := nullif(current_setting('portal.mov_descricao', true), '');
  v_data date := coalesce(nullif(current_setting('portal.mov_data', true), '')::date, public.hoje_brasil());
  v_nome_ant text;
  v_nome_novo text;
begin
  perform set_config('portal.mov_auto', '1', true);

  if tg_op = 'INSERT' then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, nova_situacao, campo, automatica)
    values (new.id, 'Entrada de empresa', coalesce(new.data_inicio, public.hoje_brasil()),
            'Empresa cadastrada na carteira.', concat_ws(' · ', new.tributacao, new.cidade), 'situacao', true);
    perform set_config('portal.mov_auto', '', true);
    return new;
  end if;

  if new.situacao is distinct from old.situacao then
    if new.situacao = 'inativa' then
      insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
      values (new.id, 'Saída de empresa', coalesce(new.data_saida, v_data),
              concat_ws(' — ', 'Motivo: ' || new.motivo_saida, v_obs), 'Ativa', 'Inativa', 'situacao', true);
    else
      insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
      values (new.id, 'Reativação', v_data,
              concat_ws(' — ', 'Saída anterior em ' || to_char(old.data_saida, 'DD/MM/YYYY') || coalesce(' (' || old.motivo_saida || ')', ''), v_obs),
              'Inativa', 'Ativa', 'situacao', true);
    end if;
  end if;

  if new.tributacao is distinct from old.tributacao then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    values (new.id, 'Alteração de regime tributário', v_data, coalesce(v_obs, ''), old.tributacao, new.tributacao, 'tributacao', true);
  end if;
  if new.razao_social is distinct from old.razao_social then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    values (new.id, 'Alteração de razão social', v_data, coalesce(v_obs, ''), old.razao_social, new.razao_social, 'razao_social', true);
  end if;
  if new.cidade is distinct from old.cidade then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    values (new.id, 'Mudança de endereço', v_data, coalesce(v_obs, 'Cidade alterada no cadastro.'), old.cidade, new.cidade, 'cidade', true);
  end if;
  if new.socio is distinct from old.socio then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    values (new.id, 'Alteração de sócios', v_data, coalesce(v_obs, ''), old.socio, new.socio, 'socio', true);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    select nome into v_nome_ant from public.profiles where id = old.responsavel_id;
    select nome into v_nome_novo from public.profiles where id = new.responsavel_id;
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    values (new.id, 'Alteração de responsável', v_data, coalesce(v_obs, 'Responsável pelo atendimento.'), v_nome_ant, v_nome_novo, 'responsavel_id', true);
  end if;
  if new.cnpj is distinct from old.cnpj or new.responsavel_tecnico is distinct from old.responsavel_tecnico
     or new.inscricao_municipal is distinct from old.inscricao_municipal or new.tipo is distinct from old.tipo then
    insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, situacao_anterior, nova_situacao, campo, automatica)
    select new.id, 'Alteração cadastral', v_data, x.rotulo, x.antes, x.depois, x.campo, true
    from (values
      ('cnpj', 'CNPJ', old.cnpj, new.cnpj),
      ('responsavel_tecnico', 'Responsável técnico', old.responsavel_tecnico, new.responsavel_tecnico),
      ('inscricao_municipal', 'Inscrição municipal', old.inscricao_municipal, new.inscricao_municipal),
      ('tipo', 'Tipo', old.tipo, new.tipo)
    ) as x(campo, rotulo, antes, depois)
    where x.antes is distinct from x.depois;
  end if;

  perform set_config('portal.mov_auto', '', true);
  return new;
end;
$$;

revoke all on function public.empresa_registrar_movimentacoes() from public, anon, authenticated;

create or replace trigger trg_empresa_registrar_movimentacoes
  after insert or update on public.legalizacao_empresas
  for each row execute function public.empresa_registrar_movimentacoes();

-- Quem já estava na base ganha o marco de entrada (uma vez).
insert into public.empresa_movimentacoes (empresa_id, tipo, data_ocorrencia, descricao, nova_situacao, campo, automatica, registrado_por, registrado_em)
select e.id, 'Entrada de empresa', coalesce(e.data_inicio, e.created_at::date),
       'Empresa na carteira (registro inicial do histórico).', concat_ws(' · ', e.tributacao, e.cidade), 'situacao', true, null, e.created_at
from public.legalizacao_empresas e
where not exists (select 1 from public.empresa_movimentacoes m where m.empresa_id = e.id);

/** Saída da carteira: inativa, guarda data e motivo e registra na linha do tempo. */
create or replace function public.empresa_inativar(p_empresa uuid, p_data date, p_motivo text, p_observacao text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_write_legalizacao() then
    raise exception 'Você não tem permissão para inativar empresas.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da saída.' using errcode = '22023';
  end if;
  perform set_config('portal.mov_descricao', coalesce(p_observacao, ''), true);
  update public.legalizacao_empresas
     set situacao = 'inativa', data_saida = coalesce(p_data, public.hoje_brasil()), motivo_saida = btrim(p_motivo)
   where id = p_empresa and situacao = 'ativa';
  if not found then
    raise exception 'Empresa não encontrada ou já inativa.' using errcode = '22023';
  end if;
  perform set_config('portal.mov_descricao', '', true);
end;
$$;

create or replace function public.empresa_reativar(p_empresa uuid, p_data date default null, p_observacao text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_write_legalizacao() then
    raise exception 'Você não tem permissão para reativar empresas.' using errcode = '42501';
  end if;
  perform set_config('portal.mov_descricao', coalesce(p_observacao, ''), true);
  perform set_config('portal.mov_data', coalesce(p_data::text, ''), true);
  update public.legalizacao_empresas set situacao = 'ativa' where id = p_empresa and situacao = 'inativa';
  if not found then
    raise exception 'Empresa não encontrada ou já ativa.' using errcode = '22023';
  end if;
  perform set_config('portal.mov_descricao', '', true);
  perform set_config('portal.mov_data', '', true);
end;
$$;

revoke all on function public.empresa_inativar(uuid, date, text, text) from public, anon;
revoke all on function public.empresa_reativar(uuid, date, text) from public, anon;
grant execute on function public.empresa_inativar(uuid, date, text, text) to authenticated;
grant execute on function public.empresa_reativar(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Documentos da empresa
-- ---------------------------------------------------------------------
create table if not exists public.empresa_documentos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.legalizacao_empresas (id) on delete cascade,
  movimentacao_id  uuid references public.empresa_movimentacoes (id) on delete set null,
  nome             text not null,
  caminho          text not null unique,
  tipo             text,
  tamanho          bigint,
  categoria        text,
  enviado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_por_nome text,
  created_at       timestamptz not null default now(),
  constraint empresa_documentos_nome check (length(btrim(nome)) between 1 and 200)
);

create index if not exists empresa_documentos_empresa_idx on public.empresa_documentos (empresa_id, created_at desc);

alter table public.empresa_documentos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'empresa_documentos' and policyname = 'empresa_documentos_select') then
    create policy empresa_documentos_select on public.empresa_documentos
      for select to authenticated using (public.can_read_legalizacao());
    create policy empresa_documentos_insert on public.empresa_documentos
      for insert to authenticated with check (public.can_write_legalizacao() and enviado_por = (select auth.uid()));
    create policy empresa_documentos_delete on public.empresa_documentos
      for delete to authenticated using (public.is_admin() or (enviado_por = (select auth.uid()) and public.can_write_legalizacao()));
  end if;
end $$;

create or replace trigger trg_audit_empresa_documentos
  after insert or delete on public.empresa_documentos
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Validades na agenda central
-- ---------------------------------------------------------------------
create or replace function public.agenda_sinc_empresa(e public.legalizacao_empresas)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  d record;
begin
  for d in
    select * from (values
      ('avcb', 'AVCB / CLCB', e.avcb_clcb_validade, 'Estadual'),
      ('visa', 'Vigilância Sanitária', e.vigilancia_sanitaria_validade, 'Municipal'),
      ('rt', 'Responsável técnico', e.validade_data, 'Outro')
    ) as x(chave, documento, validade, categoria)
  loop
    perform public.agenda_publicar(
      p_modulo => 'documentos', p_tabela => 'legalizacao_empresas', p_id => e.id::text, p_chave => d.chave,
      p_titulo => 'Vence ' || d.documento || ' — ' || e.razao_social,
      p_data => case when e.situacao = 'ativa' then d.validade end,
      p_responsaveis => array[e.responsavel_id],
      p_link => '/legalizacao?empresa=' || e.id, p_permissao => 'tela.legalizacao',
      p_descricao => 'Validade do documento. Abra um processo de renovação no Controle Legalização.',
      p_departamento => 'Legalização', p_categoria => d.categoria,
      p_empresa_id => e.id, p_empresa => e.razao_social,
      p_avisar => false, p_status_na_origem => false);
  end loop;
end;
$$;

create or replace function public.agenda_gatilho_empresa()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.agenda_remover('legalizacao_empresas', old.id::text, null);
    return old;
  end if;
  if tg_op = 'INSERT'
     or new.avcb_clcb_validade is distinct from old.avcb_clcb_validade
     or new.vigilancia_sanitaria_validade is distinct from old.vigilancia_sanitaria_validade
     or new.validade_data is distinct from old.validade_data
     or new.situacao is distinct from old.situacao
     or new.razao_social is distinct from old.razao_social
     or new.responsavel_id is distinct from old.responsavel_id then
    perform public.agenda_sinc_empresa(new);
  end if;
  return new;
end;
$$;

revoke all on function public.agenda_sinc_empresa(public.legalizacao_empresas) from public, anon, authenticated;
revoke all on function public.agenda_gatilho_empresa() from public, anon, authenticated;

create or replace trigger trg_agenda_empresas
  after insert or update or delete on public.legalizacao_empresas
  for each row execute function public.agenda_gatilho_empresa();

select public.agenda_sinc_empresa(e) from public.legalizacao_empresas e
where e.avcb_clcb_validade is not null or e.vigilancia_sanitaria_validade is not null or e.validade_data is not null;
