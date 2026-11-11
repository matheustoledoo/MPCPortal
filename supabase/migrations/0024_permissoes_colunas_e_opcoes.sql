-- =====================================================================
-- PortalMPC — 0024 — Permissões dos novos módulos, estrutura das planilhas
--                    só para administradores e opções reutilizáveis
-- ---------------------------------------------------------------------
-- 1. Catálogo: uma permissão de tela por módulo novo (tarefas, prospecção,
--    chat, conhecimento, ferramentas) e as de dados que cada um precisa.
-- 2. "Somente administradores criam, editam ou excluem colunas inteiras":
--    a política de `planilha_colunas` passa a exigir is_admin() — preencher
--    células continua dependendo só das permissões de edição de registros.
-- 3. Opções de campos de seleção: a tabela que já alimentava o Controle
--    Legalização vira o serviço único de listas do portal. Toda lista tem
--    "Adicionar outro"; as opções padrão do sistema são protegidas; excluir
--    uma opção em uso exige dizer por qual valor substituir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permissões
-- ---------------------------------------------------------------------
insert into public.permissoes_catalogo (chave, rotulo, descricao, grupo, rota, somente_admin, ordem) values
  ('tela.tarefas',        'Tarefas e lembretes',     'Quadro Kanban: criar tarefas, mover cartões, comentar e anexar.', 'telas', '/tarefas', false, 5),
  ('tela.prospeccao',     'Prospecção (CRM)',        'Funil comercial, leads, contatos e indicadores.', 'telas', '/prospeccao', false, 6),
  ('tela.chat',           'Chat interno',            'Conversas individuais e em grupo com os colegas.', 'telas', '/chat', false, 7),
  ('tela.conhecimento',   'Central de conhecimento', 'Tutoriais, procedimentos passo a passo e arquivos de consulta.', 'telas', '/conhecimento', false, 8),
  ('tela.ferramentas',    'Ferramentas',             'Calculadoras tributárias e trabalhistas.', 'telas', '/ferramentas', false, 9),
  ('dados.tarefas.gerenciar',     'Gerenciar tarefas de todos',  'Editar, mover e excluir qualquer tarefa do quadro (sem isso, só as que criou ou em que é responsável).', 'dados', null, false, 60),
  ('dados.prospeccao.editar',     'Editar a prospecção',         'Cadastrar e alterar leads, registrar contatos, propostas e próximas ações.', 'dados', null, false, 61),
  ('dados.prospeccao.excluir',    'Excluir leads',               'Apagar um lead inteiro com o histórico.', 'dados', null, false, 62),
  ('dados.conhecimento.editar',   'Escrever na Central de conhecimento', 'Criar e editar tutoriais, procedimentos, categorias e enviar arquivos.', 'dados', null, false, 63),
  ('dados.conhecimento.excluir',  'Excluir conteúdos da Central',        'Apagar tutoriais, procedimentos e arquivos.', 'dados', null, false, 64),
  ('dados.ferramentas.tabelas',   'Atualizar tabelas das calculadoras',  'Alterar faixas, alíquotas e valores de referência usados nas ferramentas.', 'dados', null, true, 65)
on conflict (chave) do update
  set rotulo = excluded.rotulo, descricao = excluded.descricao, grupo = excluded.grupo,
      rota = excluded.rota, somente_admin = excluded.somente_admin, ordem = excluded.ordem, ativo = true;

-- Estrutura das planilhas: exclusiva de administradores.
update public.permissoes_catalogo
   set somente_admin = true,
       rotulo = 'Criar, editar e excluir colunas',
       descricao = 'Alterar a estrutura das planilhas (colunas inteiras). Exclusivo de administradores.'
 where chave = 'dados.planilha.colunas';

alter policy planilha_colunas_escrita on public.planilha_colunas
  using (public.is_admin())
  with check (public.is_admin());

-- Quem já usa o portal recebe as telas de uso geral (o administrador ajusta
-- depois em Usuários e permissões). Contas sem nenhuma permissão continuam sem.
insert into public.usuario_permissoes (usuario_id, chave)
select p.id, c.chave
from public.profiles p
cross join (values ('tela.tarefas'), ('tela.chat'), ('tela.conhecimento'), ('tela.ferramentas')) as c(chave)
where p.ativo and p.role <> 'admin'
  and exists (select 1 from public.usuario_permissoes up where up.usuario_id = p.id)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Opções reutilizáveis
-- ---------------------------------------------------------------------
alter table public.legalizacao_opcoes
  add column if not exists padrao boolean not null default false,
  add column if not exists created_by uuid references public.profiles (id) on delete set null default auth.uid();

comment on table public.legalizacao_opcoes is
  'Serviço único de listas de seleção do portal (grupo → valores). `padrao` = opção do sistema, protegida contra exclusão.';

-- Tudo que já existia veio das planilhas ou das migrations: é padrão.
update public.legalizacao_opcoes set padrao = true where not padrao and created_at < now();

/** De qual coluna cada lista é — é o que permite saber se uma opção está em uso. */
create table if not exists public.opcoes_grupos (
  grupo      text primary key,
  rotulo     text not null,
  tabela     text,
  coluna     text,
  -- A base de Legalização guarda os valores em maiúsculas, como na planilha.
  maiusculas boolean not null default false
);

comment on table public.opcoes_grupos is
  'Listas de seleção existentes e a coluna que cada uma alimenta (para checar dependências ao excluir).';

alter table public.opcoes_grupos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'opcoes_grupos' and policyname = 'opcoes_grupos_select') then
    create policy opcoes_grupos_select on public.opcoes_grupos
      for select to authenticated using (public.is_active());
  end if;
end $$;

insert into public.opcoes_grupos (grupo, rotulo, tabela, coluna, maiusculas) values
  ('processo_status',        'Status do processo',        'legalizacao_processos', 'status', false),
  ('processo_tipo_servico',  'Tipo de serviço',           'legalizacao_processos', 'tipo_servico', false),
  ('processo_orgao',         'Órgão do processo',         'legalizacao_processos', 'orgao', false),
  ('processo_proxima_acao',  'Próxima ação',              'legalizacao_processos', 'proxima_acao', false),
  ('processo_indicador',     'Indicador',                 'legalizacao_processos', 'indicador', false),
  ('empresa_status',         'Status da empresa',         'legalizacao_empresas', 'status', true),
  ('empresa_tributacao',     'Tributação',                'legalizacao_empresas', 'tributacao', true),
  ('empresa_estabelecido',   'Estabelecido',              'legalizacao_empresas', 'estabelecido', true),
  ('empresa_alvara',         'Alvará',                    'legalizacao_empresas', 'alvara', true),
  ('empresa_avcb_clcb',      'AVCB / CLCB',               'legalizacao_empresas', 'avcb_clcb', true),
  ('empresa_lta',            'LTA',                       'legalizacao_empresas', 'lta', true),
  ('empresa_cnes',           'CNES',                      'legalizacao_empresas', 'cnes', true),
  ('empresa_cetesb',         'CETESB',                    'legalizacao_empresas', 'cetesb', true),
  ('empresa_amlurb_tx_lixo', 'AMLURB (TX Lixo)',          'legalizacao_empresas', 'amlurb_tx_lixo', true),
  ('empresa_vigilancia_sanitaria', 'Vigilância Sanitária', 'legalizacao_empresas', 'vigilancia_sanitaria', true),
  ('empresa_extramuros',     'Extramuros',                'legalizacao_empresas', 'extramuros', true),
  ('profissional',           'Profissional',              'legalizacao_empresas', 'profissional', false),
  ('orgao',                  'Órgão de classe',           'legalizacao_empresas', 'orgao', false),
  ('empresa_motivo_saida',   'Motivo da saída',           'legalizacao_empresas', 'motivo_saida', false),
  ('movimentacao_tipo',      'Tipo de movimentação',      'empresa_movimentacoes', 'tipo', false),
  ('lead_origem',            'Origem do lead',            'prospeccao_leads', 'origem', false),
  ('lead_segmento',          'Segmento de atuação',       'prospeccao_leads', 'segmento', false),
  ('lead_motivo_perda',      'Motivo da perda',           'prospeccao_leads', 'motivo_perda', false),
  ('tarefa_categoria',       'Categoria da tarefa',       'tarefas', 'categoria', false)
on conflict (grupo) do update
  set rotulo = excluded.rotulo, tabela = excluded.tabela, coluna = excluded.coluna, maiusculas = excluded.maiusculas;

-- Opções padrão. "HÍBRIDO" entra na tributação, como pedido.
insert into public.legalizacao_opcoes (grupo, valor, ordem, padrao)
select g.grupo, v.valor, v.ordem, true
from (values
  ('empresa_status',     array['ATIVO', 'SUSPENSO', 'INATIVO', 'BAIXADO']),
  ('empresa_tributacao', array['MEI', 'SIMPLES', 'LUCRO PRESUMIDO', 'LUCRO REAL', 'HÍBRIDO', 'NÃO OPTANTE', 'DOMESTICA']),
  ('empresa_estabelecido', array['SIM', 'NÃO', 'NA']),
  ('empresa_alvara',     array['SIM', 'NÃO', 'NA']),
  ('empresa_avcb_clcb',  array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_lta',        array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_cnes',       array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_cetesb',     array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_amlurb_tx_lixo', array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_vigilancia_sanitaria', array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_extramuros', array['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE']),
  ('empresa_motivo_saida', array['Transferência para outra contabilidade', 'Encerramento da empresa (baixa)', 'Solicitação do cliente', 'Inadimplência', 'Rescisão pelo escritório', 'Empresa sem movimento']),
  ('movimentacao_tipo',  array['Entrada de empresa', 'Saída de empresa', 'Reativação', 'Transferência de contabilidade', 'Alteração de regime tributário', 'Alteração de razão social', 'Mudança de endereço', 'Alteração de sócios', 'Alteração de responsável', 'Alteração cadastral', 'Outra movimentação']),
  ('lead_origem',        array['Indicação', 'Prospecção ativa', 'Site', 'Instagram', 'WhatsApp', 'Google', 'LinkedIn', 'Evento', 'Parceiro']),
  ('lead_segmento',      array['Saúde', 'Comércio', 'Serviços', 'Indústria', 'Tecnologia', 'Construção civil', 'Alimentação', 'Educação', 'Terceiro setor']),
  ('lead_motivo_perda',  array['Preço', 'Fechou com concorrente', 'Permaneceu com o contador atual', 'Sem retorno', 'Sem interesse no momento', 'Fora do perfil']),
  ('tarefa_categoria',   array['Fiscal', 'Contábil', 'Departamento Pessoal', 'Legalização', 'Qualidade', 'Administrativo', 'Comercial', 'Cliente'])
) as g(grupo, valores)
cross join lateral unnest(g.valores) with ordinality as v(valor, ordem)
on conflict (grupo, valor) do update set padrao = true;

-- Opção padrão não some nem muda de nome pela interface.
create or replace function public.opcoes_proteger_padrao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Sem sessão = migration/manutenção.
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.padrao then
      raise exception 'A opção "%" é padrão do sistema e não pode ser excluída.', old.valor using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.padrao and (new.valor is distinct from old.valor or new.grupo is distinct from old.grupo or not new.padrao) then
    raise exception 'A opção "%" é padrão do sistema e não pode ser alterada.', old.valor using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.padrao := false;
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.opcoes_proteger_padrao() from public, anon, authenticated;

create or replace trigger trg_opcoes_proteger_padrao
  before insert or update or delete on public.legalizacao_opcoes
  for each row execute function public.opcoes_proteger_padrao();

create or replace trigger trg_audit_opcoes
  after insert or update or delete on public.legalizacao_opcoes
  for each row execute function public.registrar_auditoria();

/** Em quantos registros a opção está sendo usada. */
create or replace function public.opcao_uso(p_grupo text, p_valor text)
returns integer
language plpgsql stable security definer
set search_path = ''
as $$
declare
  g public.opcoes_grupos;
  v_total integer := 0;
begin
  if not public.is_active() then return 0; end if;
  select * into g from public.opcoes_grupos where grupo = p_grupo;
  if g.tabela is null or to_regclass('public.' || quote_ident(g.tabela)) is null then return 0; end if;
  execute format('select count(*) from public.%I where %I = $1', g.tabela, g.coluna) into v_total using p_valor;
  return v_total;
end;
$$;

/** "Adicionar outro": grava a opção nova e devolve o valor como ficou salvo. */
create or replace function public.opcao_adicionar(p_grupo text, p_valor text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  g public.opcoes_grupos;
  v_valor text := regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g');
  v_existente text;
begin
  if not public.tem_permissao('dados.opcoes.gerenciar') then
    raise exception 'Você não tem permissão para adicionar opções às listas.' using errcode = '42501';
  end if;
  select * into g from public.opcoes_grupos where grupo = p_grupo;
  if not found then
    raise exception 'Lista de opções desconhecida: %', p_grupo using errcode = '22023';
  end if;
  if length(v_valor) < 1 or length(v_valor) > 80 then
    raise exception 'A opção precisa ter entre 1 e 80 caracteres.' using errcode = '22023';
  end if;
  if g.maiusculas then v_valor := upper(v_valor); end if;

  select o.valor into v_existente from public.legalizacao_opcoes o
  where o.grupo = p_grupo and lower(o.valor) = lower(v_valor) limit 1;
  if v_existente is not null then
    update public.legalizacao_opcoes set ativo = true where grupo = p_grupo and valor = v_existente and not ativo;
    return v_existente;
  end if;

  insert into public.legalizacao_opcoes (grupo, valor, ordem, padrao)
  values (p_grupo, v_valor, coalesce((select max(ordem) from public.legalizacao_opcoes where grupo = p_grupo), 0) + 1, false);
  return v_valor;
end;
$$;

/**
 * Exclui uma opção personalizada. Se estiver em uso, só exclui quando vier
 * `p_substituir`: o valor que passa a valer nos registros que a usavam
 * (string vazia = deixar o campo em branco).
 */
create or replace function public.opcao_excluir(p_grupo text, p_valor text, p_substituir text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  g public.opcoes_grupos;
  o public.legalizacao_opcoes;
  v_uso integer;
begin
  if not public.tem_permissao('dados.opcoes.gerenciar') then
    raise exception 'Você não tem permissão para excluir opções das listas.' using errcode = '42501';
  end if;
  select * into o from public.legalizacao_opcoes where grupo = p_grupo and valor = p_valor;
  if not found then
    raise exception 'Opção não encontrada.' using errcode = '22023';
  end if;
  if o.padrao then
    raise exception 'A opção "%" é padrão do sistema e não pode ser excluída.', p_valor using errcode = '42501';
  end if;
  select * into g from public.opcoes_grupos where grupo = p_grupo;
  v_uso := public.opcao_uso(p_grupo, p_valor);

  if v_uso > 0 then
    if p_substituir is null then
      return jsonb_build_object('ok', false, 'em_uso', v_uso);
    end if;
    if p_substituir <> '' and not exists (
      select 1 from public.legalizacao_opcoes where grupo = p_grupo and valor = p_substituir and valor <> p_valor
    ) then
      raise exception 'Escolha uma opção da lista para substituir.' using errcode = '22023';
    end if;
    execute format('update public.%I set %I = $1 where %I = $2', g.tabela, g.coluna, g.coluna)
      using nullif(p_substituir, ''), p_valor;
  end if;

  delete from public.legalizacao_opcoes where id = o.id;
  return jsonb_build_object('ok', true, 'substituidos', v_uso);
end;
$$;

revoke all on function public.opcao_uso(text, text) from public, anon;
revoke all on function public.opcao_adicionar(text, text) from public, anon;
revoke all on function public.opcao_excluir(text, text, text) from public, anon;
grant execute on function public.opcao_uso(text, text) to authenticated;
grant execute on function public.opcao_adicionar(text, text) to authenticated;
grant execute on function public.opcao_excluir(text, text, text) to authenticated;
