/**
 * Camada de acesso a dados da base de Legalização.
 *
 * Todas as consultas passam pelo cliente autenticado do navegador, portanto
 * ficam sujeitas à RLS. Um usuário de Legalização que peça o join com
 * `legalizacao_dados_administrativos` simplesmente recebe null — o banco não
 * entrega a linha.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { CAMPOS_EDITAVEIS_ADMINISTRATIVOS, CAMPOS_EDITAVEIS_GERAIS } from '@/lib/colunas';
import { normalizarCnpj, normalizarData, normalizarNumero, normalizarTexto } from '@/lib/normalizacao';
import type { DadosAdministrativos, Empresa } from '@/types/banco';

export interface FiltroColuna {
  campo: string;
  operador: 'contem' | 'igual' | 'vazio' | 'preenchido' | 'maior' | 'menor';
  valor: string;
  confidencial?: boolean;
}

export interface ConsultaEmpresas {
  pagina: number;
  porPagina: number;
  busca: string;
  ordenarPor: string;
  ascendente: boolean;
  filtros: FiltroColuna[];
  incluirAdministrativo: boolean;
}

export interface ResultadoEmpresas {
  linhas: LinhaEmpresa[];
  total: number;
}

/** Empresa com o bloco administrativo achatado (quando o usuário pode vê-lo). */
export type LinhaEmpresa = Empresa & {
  administrativo: DadosAdministrativos | null;
};

const CAMPOS_BUSCA = ['razao_social', 'cnpj', 'cidade', 'socio', 'codigo', 'responsavel_tecnico', 'inscricao_municipal'];

/** PostgREST usa vírgula para separar condições no `or`; escapar evita quebra da query. */
function escaparBusca(termo: string): string {
  return termo.replace(/[,()\\]/g, ' ').trim();
}

export async function buscarEmpresas(
  supabase: SupabaseClient,
  consulta: ConsultaEmpresas,
): Promise<ResultadoEmpresas> {
  const filtrosAdmin = consulta.filtros.filter((f) => f.confidencial);
  const precisaJuncaoInterna = filtrosAdmin.length > 0;

  // `!inner` só entra quando há filtro em campo administrativo — do contrário
  // empresas sem bloco financeiro (as 15 que só existem na Planilha Saúde)
  // sumiriam do resultado.
  const relacao = consulta.incluirAdministrativo
    ? precisaJuncaoInterna
      ? 'legalizacao_dados_administrativos!inner(*)'
      : 'legalizacao_dados_administrativos(*)'
    : '';

  let query = supabase
    .from('legalizacao_empresas')
    .select(relacao ? `*, ${relacao}` : '*', { count: 'exact' });

  const termo = escaparBusca(consulta.busca);
  if (termo) {
    const somenteDigitos = termo.replace(/\D/g, '');
    const condicoes = CAMPOS_BUSCA.map((campo) =>
      campo === 'cnpj' && somenteDigitos
        ? `cnpj.ilike.%${somenteDigitos}%`
        : `${campo}.ilike.%${termo}%`,
    );
    query = query.or(condicoes.join(','));
  }

  for (const filtro of consulta.filtros) {
    const coluna = filtro.confidencial
      ? `legalizacao_dados_administrativos.${filtro.campo}`
      : filtro.campo;

    switch (filtro.operador) {
      case 'contem':
        query = query.ilike(coluna, `%${filtro.valor}%`);
        break;
      case 'igual':
        query = query.eq(coluna, filtro.valor);
        break;
      case 'vazio':
        query = query.is(coluna, null);
        break;
      case 'preenchido':
        query = query.not(coluna, 'is', null);
        break;
      case 'maior':
        query = query.gte(coluna, filtro.valor);
        break;
      case 'menor':
        query = query.lte(coluna, filtro.valor);
        break;
    }
  }

  // Ordenar por campo administrativo exigiria referenciar a tabela relacionada;
  // nesses casos caímos na razão social para não devolver erro ao usuário.
  const ordenavel = CAMPOS_EDITAVEIS_GERAIS.includes(consulta.ordenarPor)
    ? consulta.ordenarPor
    : ['razao_social', 'cnpj', 'cidade', 'updated_at', 'created_at', 'origem'].includes(consulta.ordenarPor)
      ? consulta.ordenarPor
      : 'razao_social';

  query = query.order(ordenavel, { ascending: consulta.ascendente, nullsFirst: false });

  const de = (consulta.pagina - 1) * consulta.porPagina;
  query = query.range(de, de + consulta.porPagina - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  // O `select` é montado em tempo de execução, então o PostgREST não consegue
  // inferir o tipo do retorno; a forma real é garantida logo abaixo.
  const linhas = (data ?? []).map((registro) => {
    const { legalizacao_dados_administrativos: adm, ...empresa } = registro as unknown as Empresa & {
      legalizacao_dados_administrativos?: DadosAdministrativos | DadosAdministrativos[] | null;
    };
    return {
      ...empresa,
      administrativo: Array.isArray(adm) ? (adm[0] ?? null) : (adm ?? null),
    } as LinhaEmpresa;
  });

  return { linhas, total: count ?? 0 };
}

/** Converte o valor digitado para o formato aceito pela coluna do banco. */
export function prepararValor(campo: string, tipo: string, valor: unknown): unknown {
  if (valor === '' || valor === undefined) return null;

  switch (tipo) {
    case 'cnpj':
      return normalizarCnpj(valor);
    case 'data':
      return normalizarData(valor);
    case 'numero':
    case 'moeda':
      return normalizarNumero(valor);
    case 'booleano':
      return Boolean(valor);
    case 'status':
      return normalizarTexto(valor)?.toUpperCase() ?? null;
    default:
      return normalizarTexto(valor);
  }
}

/** Salva um campo geral. Campos fora da lista branca são rejeitados aqui. */
export async function salvarCampoGeral(
  supabase: SupabaseClient,
  empresaId: string,
  campo: string,
  valor: unknown,
): Promise<void> {
  if (!CAMPOS_EDITAVEIS_GERAIS.includes(campo)) {
    throw new Error(`Campo "${campo}" não é editável.`);
  }
  const { error } = await supabase
    .from('legalizacao_empresas')
    .update({ [campo]: valor })
    .eq('id', empresaId);
  if (error) throw new Error(error.message);
}

/**
 * Salva um campo administrativo. Só admin chega aqui: a RLS recusa a escrita
 * de qualquer outro perfil, mesmo que a interface fosse burlada.
 */
export async function salvarCampoAdministrativo(
  supabase: SupabaseClient,
  empresaId: string,
  campo: string,
  valor: unknown,
): Promise<void> {
  if (!CAMPOS_EDITAVEIS_ADMINISTRATIVOS.includes(campo)) {
    throw new Error(`Campo "${campo}" não é editável.`);
  }
  const { error } = await supabase
    .from('legalizacao_dados_administrativos')
    .upsert({ empresa_id: empresaId, [campo]: valor }, { onConflict: 'empresa_id' });
  if (error) throw new Error(error.message);
}

export async function criarEmpresa(
  supabase: SupabaseClient,
  dados: Record<string, unknown>,
): Promise<Empresa> {
  const cnpj = normalizarCnpj(dados.cnpj);
  const razaoSocial = normalizarTexto(dados.razao_social);

  if (!razaoSocial) throw new Error('Informe a razão social.');

  const registro: Record<string, unknown> = {
    ...dados,
    cnpj,
    razao_social: razaoSocial,
    origem: 'manual',
    // O gatilho do banco preenche a chave quando ela vem vazia.
    chave_identificacao: cnpj ?? '',
  };

  const { data, error } = await supabase
    .from('legalizacao_empresas')
    .insert(registro)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Já existe uma empresa cadastrada com este CNPJ.');
    throw new Error(error.message);
  }
  return data as Empresa;
}

export async function excluirEmpresas(supabase: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await supabase.from('legalizacao_empresas').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

/** Aplica o mesmo valor a várias empresas de uma vez (ação em massa). */
export async function atualizarEmMassa(
  supabase: SupabaseClient,
  ids: string[],
  campo: string,
  valor: unknown,
): Promise<void> {
  if (!CAMPOS_EDITAVEIS_GERAIS.includes(campo)) {
    throw new Error(`Campo "${campo}" não é editável.`);
  }
  const { error } = await supabase
    .from('legalizacao_empresas')
    .update({ [campo]: valor })
    .in('id', ids);
  if (error) throw new Error(error.message);
}
