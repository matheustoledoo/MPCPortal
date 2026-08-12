-- =====================================================================
-- PortalMPC — 0015 — CONTROLE_GERAL (processos de legalização)
-- ---------------------------------------------------------------------
-- Traz para o portal a aba CONTROLE_GERAL da PLANILHA LEGALIZACAO.xlsx:
-- o acompanhamento de cada processo aberto num órgão — abertura, alvará,
-- vigilância, baixa — com prazo, protocolo e responsável.
--
-- É uma planilha A MAIS: a base geral (`legalizacao_empresas`) continua
-- sendo o cadastro das empresas. Aqui ficam os processos em andamento,
-- ligados àquela base por `empresa_id`.
--
-- Regras que vieram da formatação condicional do Excel:
--   * prazo < hoje  e status não é Concluído/Arquivado -> ATRASADO
--   * prazo <= hoje+3 nas mesmas condições             -> ATENÇÃO
-- Elas dependem de `current_date`, então não podem ser coluna gerada.
-- Ficam em `processo_situacao()` e são recalculadas a cada leitura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Opções dos campos — reaproveita `legalizacao_opcoes`
-- ---------------------------------------------------------------------
-- Cada grupo alimenta um combo da tela. O usuário PODE digitar um valor
-- fora da lista (foi pedido explicitamente), e quem tiver permissão pode
-- promover esse valor a opção permanente pela própria interface.
insert into public.legalizacao_opcoes (grupo, valor, ordem) values
  -- STATUS (dropdown original da planilha)
  ('processo_status', 'Pendente documentos cliente', 1),
  ('processo_status', 'Em preparação',               2),
  ('processo_status', 'Em andamento',                3),
  ('processo_status', 'Protocolado',                 4),
  ('processo_status', 'Em exigência',                5),
  ('processo_status', 'Concluído',                   6),
  ('processo_status', 'Arquivado',                   7),
  -- acrescentados por serem situações correntes que a lista não cobria
  ('processo_status', 'Aguardando pagamento de taxa', 8),
  ('processo_status', 'Aguardando terceiro',          9),
  ('processo_status', 'Indeferido',                  10),
  ('processo_status', 'Cancelado',                   11),

  -- TIPO DE SERVIÇO (dropdown original)
  ('processo_tipo_servico', 'Abertura',                 1),
  ('processo_tipo_servico', 'Alteração contratual',     2),
  ('processo_tipo_servico', 'Consolidação',             3),
  ('processo_tipo_servico', 'Baixa',                    4),
  ('processo_tipo_servico', 'Alvará',                   5),
  ('processo_tipo_servico', 'Vigilância',               6),
  ('processo_tipo_servico', 'Bombeiros',                7),
  ('processo_tipo_servico', 'Inscrição municipal',      8),
  ('processo_tipo_servico', 'Certidão uso do solo',     9),
  ('processo_tipo_servico', 'Regularização fiscal',    10),
  ('processo_tipo_servico', 'Registro órgão de classe', 11),
  -- acrescentados
  ('processo_tipo_servico', 'Renovação de alvará',      12),
  ('processo_tipo_servico', 'AVCB / CLCB',              13),
  ('processo_tipo_servico', 'Licença ambiental',        14),
  ('processo_tipo_servico', 'Inscrição estadual',       15),
  ('processo_tipo_servico', 'Transferência de endereço',16),
  ('processo_tipo_servico', 'Alteração de sócios',      17),
  ('processo_tipo_servico', 'Certidão negativa',        18),
  ('processo_tipo_servico', 'Cadastro CNES',            19),
  ('processo_tipo_servico', 'Responsável técnico',      20),

  -- ÓRGÃO (dropdown original)
  ('processo_orgao', 'Junta',                1),
  ('processo_orgao', 'Prefeitura',           2),
  ('processo_orgao', 'Vigilância Sanitária', 3),
  ('processo_orgao', 'Receita Federal',      4),
  ('processo_orgao', 'Bombeiros',            5),
  ('processo_orgao', 'Órgão de classe',      6),
  -- acrescentados
  ('processo_orgao', 'Sefaz / Secretaria da Fazenda', 7),
  ('processo_orgao', 'CETESB',                        8),
  ('processo_orgao', 'AMLURB',                        9),
  ('processo_orgao', 'CRM',                          10),
  ('processo_orgao', 'CRO',                          11),
  ('processo_orgao', 'COREN',                        12),
  ('processo_orgao', 'CRF',                          13),
  ('processo_orgao', 'Cartório',                     14),
  ('processo_orgao', 'ANVISA',                       15),
  ('processo_orgao', 'INSS',                         16),
  ('processo_orgao', 'Caixa Econômica',              17),

  -- PRÓXIMA AÇÃO (não tinha lista na planilha)
  ('processo_proxima_acao', 'Solicitar documentos ao cliente', 1),
  ('processo_proxima_acao', 'Conferir documentação',           2),
  ('processo_proxima_acao', 'Protocolar no órgão',             3),
  ('processo_proxima_acao', 'Acompanhar andamento',            4),
  ('processo_proxima_acao', 'Cumprir exigência',               5),
  ('processo_proxima_acao', 'Emitir e pagar taxa',             6),
  ('processo_proxima_acao', 'Agendar vistoria',                7),
  ('processo_proxima_acao', 'Retirar documento',               8),
  ('processo_proxima_acao', 'Enviar documento ao cliente',     9),
  ('processo_proxima_acao', 'Atualizar cadastro no portal',   10),
  ('processo_proxima_acao', 'Aguardar retorno do órgão',      11),
  ('processo_proxima_acao', 'Encerrar processo',              12),

  -- INDICADOR (não tinha lista; serve para a marcação manual de prioridade)
  ('processo_indicador', 'Normal',              1),
  ('processo_indicador', 'Prioridade alta',     2),
  ('processo_indicador', 'Urgente',             3),
  ('processo_indicador', 'Risco de multa',      4),
  ('processo_indicador', 'Depende do cliente',  5),
  ('processo_indicador', 'Depende do órgão',    6),
  ('processo_indicador', 'Reter faturamento',   7),
  ('processo_indicador', 'Acompanhar de perto', 8)
on conflict (grupo, valor) do nothing;

-- ---------------------------------------------------------------------
-- 2. A tabela
-- ---------------------------------------------------------------------
create table if not exists public.legalizacao_processos (
  id            uuid primary key default gen_random_uuid(),

  -- Vínculo com a base geral. `on delete set null` de propósito: apagar a
  -- empresa não pode apagar o histórico do processo dela.
  empresa_id    uuid references public.legalizacao_empresas (id) on delete set null,
  -- Cópia do nome no momento do lançamento. Permite registrar processo de
  -- empresa que ainda não está na base (prospect, abertura em curso).
  empresa       text not null,
  cnpj          text,

  status        text not null default 'Em preparação',
  tipo_servico  text,
  orgao         text,
  protocolo     text,
  data_entrada  date not null default current_date,
  prazo         date,

  -- Responsável: usuário do portal quando existe, texto livre quando é
  -- alguém de fora (despachante, contador do cliente).
  responsavel_id uuid references public.profiles (id) on delete set null,
  responsavel    text,

  proxima_acao       text,
  observacoes        text,
  indicador          text,

  ultima_atualizacao timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles (id) on delete set null,
  updated_by         uuid references public.profiles (id) on delete set null,

  constraint legalizacao_processos_empresa_nao_vazia check (length(btrim(empresa)) > 0)
);

comment on table public.legalizacao_processos is
  'Aba CONTROLE_GERAL: processos de legalização em andamento nos órgãos.';
comment on column public.legalizacao_processos.empresa_id is
  'Vínculo com legalizacao_empresas. Nulo quando a empresa ainda não está na base.';
comment on column public.legalizacao_processos.indicador is
  'Marcação manual de prioridade. A situação do prazo é calculada, não digitada.';

create index if not exists legalizacao_processos_empresa_idx on public.legalizacao_processos (empresa_id);
create index if not exists legalizacao_processos_status_idx on public.legalizacao_processos (status);
create index if not exists legalizacao_processos_prazo_idx on public.legalizacao_processos (prazo);
create index if not exists legalizacao_processos_orgao_idx on public.legalizacao_processos (orgao);
create index if not exists legalizacao_processos_cnpj_idx on public.legalizacao_processos (cnpj);

-- ---------------------------------------------------------------------
-- 3. Situação do prazo — a formatação condicional do Excel, em SQL
-- ---------------------------------------------------------------------
create or replace function public.processo_encerrado(p_status text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_status, '') in ('Concluído', 'Arquivado', 'Cancelado', 'Indeferido');
$$;

create or replace function public.processo_situacao(p_prazo date, p_status text)
returns text
language sql stable set search_path = ''
as $$
  select case
    when public.processo_encerrado(p_status) then 'encerrado'
    when p_prazo is null                     then 'sem_prazo'
    when p_prazo < current_date              then 'atrasado'
    when p_prazo <= current_date + 3         then 'atencao'
    else 'em_dia'
  end;
$$;

revoke all on function public.processo_encerrado(text) from public, anon;
revoke all on function public.processo_situacao(date, text) from public, anon;
grant execute on function public.processo_encerrado(text) to authenticated;
grant execute on function public.processo_situacao(date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Normalização e carimbos
-- ---------------------------------------------------------------------
create or replace function public.legalizacao_processos_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cnpj    := nullif(public.cnpj_digitos(new.cnpj), '');
  new.empresa := btrim(new.empresa);

  -- Primeiro resolve o vínculo: sem `empresa_id` explícito, tenta casar
  -- pelo CNPJ. É o que liga esta planilha às outras sem obrigar ninguém a
  -- escolher na mão.
  if new.empresa_id is null and new.cnpj is not null then
    select e.id into new.empresa_id
    from public.legalizacao_empresas e
    where e.cnpj = new.cnpj
    limit 1;
  end if;

  -- Só então copia o cadastro. A ordem importa: se este bloco viesse antes,
  -- a linha casada por CNPJ ficaria com o nome que a pessoa digitou, e a
  -- mesma empresa apareceria escrita de dez formas diferentes na planilha.
  if new.empresa_id is not null then
    select coalesce(nullif(btrim(e.razao_social), ''), new.empresa), coalesce(e.cnpj, new.cnpj)
      into new.empresa, new.cnpj
    from public.legalizacao_empresas e
    where e.id = new.empresa_id;
  end if;

  new.ultima_atualizacao := now();
  new.updated_at         := now();
  new.updated_by         := coalesce((select auth.uid()), new.updated_by);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;

  return new;
end;
$$;

revoke all on function public.legalizacao_processos_normalizar() from public, anon, authenticated;

drop trigger if exists trg_processos_normalizar on public.legalizacao_processos;
create trigger trg_processos_normalizar
  before insert or update on public.legalizacao_processos
  for each row execute function public.legalizacao_processos_normalizar();

-- ---------------------------------------------------------------------
-- 5. Aviso na planilha principal
-- ---------------------------------------------------------------------
-- "Quando colocar algo nessa nova planilha, ter aviso na planilha
--  principal para saber que está nessa."
--
-- Os dois contadores são independentes de data — `processos_abertos` conta
-- o que não foi encerrado e `processo_proximo_prazo` guarda a data mais
-- próxima. Se guardássemos "atrasados", o número envelheceria sozinho à
-- meia-noite; assim a tela calcula o atraso a partir da data.
alter table public.legalizacao_empresas
  add column if not exists processos_abertos integer not null default 0,
  add column if not exists processo_proximo_prazo date;

comment on column public.legalizacao_empresas.processos_abertos is
  'Processos não encerrados no CONTROLE_GERAL. Mantido por gatilho.';
comment on column public.legalizacao_empresas.processo_proximo_prazo is
  'Menor prazo entre os processos abertos. A tela deriva daqui o alerta de atraso.';

create or replace function public.recalcular_processos_da_empresa(p_empresa uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.legalizacao_empresas e
  set processos_abertos = coalesce(x.abertos, 0),
      processo_proximo_prazo = x.proximo
  from (
    select count(*) filter (where not public.processo_encerrado(p.status)) as abertos,
           min(p.prazo) filter (where not public.processo_encerrado(p.status)) as proximo
    from public.legalizacao_processos p
    where p.empresa_id = p_empresa
  ) x
  where e.id = p_empresa;
$$;

revoke all on function public.recalcular_processos_da_empresa(uuid) from public, anon, authenticated;

create or replace function public.legalizacao_processos_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Um UPDATE pode mover o processo de uma empresa para outra: as duas
  -- precisam ser recalculadas.
  if tg_op in ('UPDATE', 'DELETE') and old.empresa_id is not null then
    perform public.recalcular_processos_da_empresa(old.empresa_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.empresa_id is not null then
    perform public.recalcular_processos_da_empresa(new.empresa_id);
  end if;
  return null;
end;
$$;

revoke all on function public.legalizacao_processos_sincronizar() from public, anon, authenticated;

drop trigger if exists trg_processos_sincronizar on public.legalizacao_processos;
create trigger trg_processos_sincronizar
  after insert or update or delete on public.legalizacao_processos
  for each row execute function public.legalizacao_processos_sincronizar();

-- ---------------------------------------------------------------------
-- 6. Permissões
-- ---------------------------------------------------------------------
insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('tela.processos', 'Controle Geral', 'Processos de legalização em andamento nos órgãos.', 'telas', '/controle-geral', false, 6),
  ('dados.processos.criar',    'Abrir processos',    'Lançar novos processos no Controle Geral.', 'dados', null, false, 26),
  ('dados.processos.editar',   'Editar processos',   'Alterar prazo, status e andamento.',        'dados', null, false, 27),
  ('dados.processos.excluir',  'Excluir processos',  'Remover processos do Controle Geral.',      'dados', null, false, 28),
  ('dados.opcoes.gerenciar',   'Editar listas de opções', 'Acrescentar valores aos combos das planilhas.', 'dados', null, false, 29)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem;

-- Abre espaço para o Controle Geral logo depois da planilha de Legalização,
-- que é onde ele faz sentido na lista de telas.
update public.permissoes_catalogo set ordem = ordem + 1
where grupo = 'telas' and ordem >= 6 and chave <> 'tela.processos';

-- Quem já trabalha na base de Legalização recebe o equivalente aqui, para
-- que a tela nova não nasça inacessível para o time que vai usá-la.
insert into public.usuario_permissoes (usuario_id, chave)
select up.usuario_id, novo.chave
from public.usuario_permissoes up
join lateral (values
  ('tela.legalizacao',           'tela.processos'),
  ('dados.legalizacao.criar',    'dados.processos.criar'),
  ('dados.legalizacao.editar',   'dados.processos.editar'),
  ('dados.legalizacao.excluir',  'dados.processos.excluir'),
  ('dados.legalizacao.editar',   'dados.opcoes.gerenciar')
) as novo(origem, chave) on novo.origem = up.chave
on conflict do nothing;

create or replace function public.pode_ler_processos()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.tem_permissao('tela.processos'); $$;

create or replace function public.pode_escrever_processos()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_permissao('dados.processos.criar')
      or public.tem_permissao('dados.processos.editar');
$$;

create or replace function public.pode_excluir_processos()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.tem_permissao('dados.processos.excluir'); $$;

revoke all on function public.pode_ler_processos() from public, anon;
revoke all on function public.pode_escrever_processos() from public, anon;
revoke all on function public.pode_excluir_processos() from public, anon;
grant execute on function public.pode_ler_processos() to authenticated;
grant execute on function public.pode_escrever_processos() to authenticated;
grant execute on function public.pode_excluir_processos() to authenticated;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table public.legalizacao_processos enable row level security;

drop policy if exists processos_select on public.legalizacao_processos;
create policy processos_select on public.legalizacao_processos
  for select to authenticated using (public.pode_ler_processos());

drop policy if exists processos_insert on public.legalizacao_processos;
create policy processos_insert on public.legalizacao_processos
  for insert to authenticated with check (public.tem_permissao('dados.processos.criar'));

drop policy if exists processos_update on public.legalizacao_processos;
create policy processos_update on public.legalizacao_processos
  for update to authenticated
  using (public.tem_permissao('dados.processos.editar'))
  with check (public.tem_permissao('dados.processos.editar'));

drop policy if exists processos_delete on public.legalizacao_processos;
create policy processos_delete on public.legalizacao_processos
  for delete to authenticated using (public.pode_excluir_processos());

-- As listas de opções passam a ser editáveis pela interface por quem tem
-- `dados.opcoes.gerenciar` — é assim que um valor digitado "fora da lista"
-- vira opção permanente para o time inteiro.
--
-- A política antiga (`_admin_write`, criada na 0006) sai de cena: duas
-- políticas FOR ALL na mesma tabela são somadas, e ficaria difícil dizer
-- quem pode o quê olhando só uma delas. `tem_permissao` já devolve true
-- para admin, então nada se perde.
drop policy if exists legalizacao_opcoes_admin_write on public.legalizacao_opcoes;
drop policy if exists legalizacao_opcoes_escrita on public.legalizacao_opcoes;
create policy legalizacao_opcoes_escrita on public.legalizacao_opcoes
  for all to authenticated
  using (public.tem_permissao('dados.opcoes.gerenciar'))
  with check (public.tem_permissao('dados.opcoes.gerenciar'));

-- ---------------------------------------------------------------------
-- 8. Auditoria
-- ---------------------------------------------------------------------
drop trigger if exists trg_audit_processos on public.legalizacao_processos;
create trigger trg_audit_processos
  after insert or update or delete on public.legalizacao_processos
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_processos_updated_at on public.legalizacao_processos;

-- ---------------------------------------------------------------------
-- 9. Painéis — as três abas DASHBOARD do arquivo, em uma chamada
-- ---------------------------------------------------------------------
create or replace function public.processos_estatisticas()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.pode_ler_processos() then '{}'::jsonb else jsonb_build_object(
    'total',      (select count(*) from public.legalizacao_processos),
    'abertos',    (select count(*) from public.legalizacao_processos where not public.processo_encerrado(status)),
    'atrasados',  (select count(*) from public.legalizacao_processos
                    where not public.processo_encerrado(status) and prazo < current_date),
    'atencao',    (select count(*) from public.legalizacao_processos
                    where not public.processo_encerrado(status)
                      and prazo >= current_date and prazo <= current_date + 3),
    'sem_prazo',  (select count(*) from public.legalizacao_processos
                    where not public.processo_encerrado(status) and prazo is null),
    'concluidos_mes', (select count(*) from public.legalizacao_processos
                        where status = 'Concluído'
                          and ultima_atualizacao >= date_trunc('month', current_date)),
    'por_status', (select coalesce(jsonb_agg(jsonb_build_object('valor', status, 'total', n) order by n desc), '[]'::jsonb)
                   from (select status, count(*) n from public.legalizacao_processos group by status) s),
    'por_orgao',  (select coalesce(jsonb_agg(jsonb_build_object('valor', coalesce(orgao, '—'), 'total', n) order by n desc), '[]'::jsonb)
                   from (select orgao, count(*) n from public.legalizacao_processos group by orgao) o),
    'por_tipo',   (select coalesce(jsonb_agg(jsonb_build_object('valor', coalesce(tipo_servico, '—'), 'total', n) order by n desc), '[]'::jsonb)
                   from (select tipo_servico, count(*) n from public.legalizacao_processos group by tipo_servico) t),
    'por_responsavel', (select coalesce(jsonb_agg(jsonb_build_object('valor', quem, 'total', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(p.nome, lp.responsavel, '— sem responsável —') as quem, count(*) n
                         from public.legalizacao_processos lp
                         left join public.profiles p on p.id = lp.responsavel_id
                         where not public.processo_encerrado(lp.status)
                         group by 1) r),
    -- DASHBOARD_EXECUTIVO: vencimentos mês a mês no ano corrente
    'vencimentos_por_mes', (
      select coalesce(
        jsonb_agg(jsonb_build_object('mes', g.mes, 'total', coalesce(v.n, 0)) order by g.mes),
        '[]'::jsonb)
      from generate_series(1, 12) as g(mes)
      left join (
        select extract(month from prazo)::int as mes, count(*) as n
        from public.legalizacao_processos
        where prazo is not null and extract(year from prazo) = extract(year from current_date)
        group by 1
      ) v on v.mes = g.mes
    )
  ) end;
$$;

revoke all on function public.processos_estatisticas() from public, anon;
grant execute on function public.processos_estatisticas() to authenticated;

comment on function public.processos_estatisticas() is
  'Reúne as abas DASHBOARD, DASHBOARD_ORGAO e DASHBOARD_EXECUTIVO da planilha original.';

-- ---------------------------------------------------------------------
-- 10. Busca de empresa para o autocomplete
-- ---------------------------------------------------------------------
-- Casa por nome OU por CNPJ, aceitando o CNPJ digitado com pontuação.
-- Devolve o que a tela precisa para preencher a linha inteira.
--
-- Usa `regexp_replace` em vez de `cnpj_digitos()`: aquela função completa
-- com zeros à esquerda até 14 dígitos, o que está certo para gravar um CNPJ
-- inteiro e errado para procurar por prefixo — "20984" viraria
-- "00000000020984" e não casaria com nada.
create or replace function public.buscar_empresas_para_processo(p_termo text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.can_read_legalizacao() then '[]'::jsonb else (
    select coalesce(jsonb_agg(linha order by (linha ->> 'razao_social')), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', e.id,
        'razao_social', e.razao_social,
        'nome_fantasia', e.nome_fantasia,
        'cnpj', e.cnpj,
        'cidade', e.cidade,
        'codigo', e.codigo,
        'status', e.status,
        'processos_abertos', e.processos_abertos,
        'responsavel_id', e.responsavel_id
      ) as linha
      from public.legalizacao_empresas e
      where length(btrim(coalesce(p_termo, ''))) >= 2
        and (
          e.razao_social ilike '%' || btrim(p_termo) || '%'
          or coalesce(e.nome_fantasia, '') ilike '%' || btrim(p_termo) || '%'
          or coalesce(e.codigo, '') ilike btrim(p_termo) || '%'
          or (
            length(regexp_replace(p_termo, '\D', '', 'g')) >= 3
            and coalesce(e.cnpj, '') like regexp_replace(p_termo, '\D', '', 'g') || '%'
          )
        )
      order by
        -- quem começa com o termo aparece antes de quem só o contém
        case when e.razao_social ilike btrim(p_termo) || '%' then 0 else 1 end,
        e.razao_social
      limit 12
    ) x
  ) end;
$$;

revoke all on function public.buscar_empresas_para_processo(text) from public, anon;
grant execute on function public.buscar_empresas_para_processo(text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Sincroniza os contadores com o estado atual
-- ---------------------------------------------------------------------
-- Só toca nas empresas que realmente têm processo. Um `update` em toda a
-- tabela dispararia os gatilhos de auditoria nas 373 linhas e encheria a
-- trilha de eventos que não representam alteração nenhuma.
select public.recalcular_processos_da_empresa(x.empresa_id)
from (
  select distinct empresa_id from public.legalizacao_processos where empresa_id is not null
) x;
