-- =====================================================================
-- PortalMPC — 0012 — Restrição de colunas aplicada no banco
-- ---------------------------------------------------------------------
-- A migration 0010 criou `usuario_colunas` e a função de leitura
-- `minhas_colunas_editaveis()`, mas nada impedia a escrita: a restrição
-- vivia só na interface. RLS não sabe distinguir coluna, então a regra
-- precisa de um gatilho.
--
-- Regra: se o usuário tem colunas atribuídas, ele altera SOMENTE essas.
-- Lista vazia continua significando "sem restrição" — assim ninguém fica
-- travado por engano, e o time inteiro segue podendo editar a planilha,
-- como foi pedido.
-- =====================================================================

/**
 * Colunas da base geral que um usuário comum pode alterar.
 * Espelha `COLUNAS_GERAIS.filter(c => c.editavel)` em `src/lib/colunas.ts`.
 * As demais (chave_identificacao, cnpj_valido, origem, updated_by…) são
 * mantidas por gatilho e ficam fora da conferência.
 */
create or replace function public.colunas_editaveis_legalizacao()
returns text[]
language sql immutable set search_path = ''
as $$
  select array[
    'razao_social', 'cnpj', 'codigo', 'cidade', 'data_inicio', 'status',
    'tributacao', 'tipo', 'seguimento', 'socio', 'estabelecido',
    'inscricao_municipal', 'alvara', 'avcb_clcb', 'avcb_clcb_validade',
    'lta', 'cnes', 'cetesb', 'amlurb_tx_lixo', 'vigilancia_sanitaria',
    'vigilancia_sanitaria_validade', 'extramuros', 'responsavel_tecnico',
    'profissional', 'orgao', 'validade', 'validade_data', 'observacoes',
    'necessita_revisao'
  ]::text[];
$$;

revoke all on function public.colunas_editaveis_legalizacao() from public, anon;
grant execute on function public.colunas_editaveis_legalizacao() to authenticated;

create or replace function public.aplicar_colunas_permitidas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitidas text[];
  v_antes      jsonb := to_jsonb(old);
  v_depois     jsonb := to_jsonb(new);
  v_campo      text;
  v_bloqueadas text[] := '{}';
begin
  -- Sem sessão (importação via service_role, seeds, manutenção): não restringe.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Admin altera qualquer coluna, sempre.
  if public.is_admin() then
    return new;
  end if;

  select coalesce(array_agg(uc.coluna), '{}')
    into v_permitidas
  from public.usuario_colunas uc
  where uc.usuario_id = (select auth.uid())
    and uc.tabela = 'legalizacao_empresas';

  -- Sem atribuição de coluna = pode editar tudo o que a RLS já permitiu.
  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    return new;
  end if;

  foreach v_campo in array public.colunas_editaveis_legalizacao() loop
    if (v_antes -> v_campo) is distinct from (v_depois -> v_campo)
       and not (v_campo = any (v_permitidas)) then
      v_bloqueadas := v_bloqueadas || v_campo;
    end if;
  end loop;

  if coalesce(array_length(v_bloqueadas, 1), 0) > 0 then
    raise exception
      'Você não tem atribuição para alterar: %. Suas colunas são: %.',
      array_to_string(v_bloqueadas, ', '),
      array_to_string(v_permitidas, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.aplicar_colunas_permitidas() from public, anon, authenticated;

comment on function public.aplicar_colunas_permitidas() is
  'Gatilho: barra alterações fora das colunas atribuídas ao usuário (usuario_colunas).';

-- O nome começa com "zz" de propósito: gatilhos BEFORE disparam em ordem
-- alfabética, e este precisa ver a linha já normalizada pelos anteriores.
drop trigger if exists trg_zz_colunas_permitidas on public.legalizacao_empresas;
create trigger trg_zz_colunas_permitidas
  before update on public.legalizacao_empresas
  for each row execute function public.aplicar_colunas_permitidas();
