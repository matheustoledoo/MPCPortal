/**
 * CONTROLE_GERAL — processos de legalização.
 *
 * Espelha a aba homônima da PLANILHA LEGALIZACAO.xlsx. As colunas, a ordem
 * e as listas de opções vieram do arquivo; o que era formatação condicional
 * virou `situacaoProcesso()`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Processo, SituacaoProcesso } from '@/types/banco';

/* -------------------------------------------------------------------------- */
/* Colunas                                                                     */
/* -------------------------------------------------------------------------- */

export type TipoCampoProcesso = 'texto' | 'longo' | 'data' | 'combo' | 'empresa' | 'cnpj' | 'pessoa';

export interface ColunaProcesso {
  campo: keyof Processo;
  rotulo: string;
  tipo: TipoCampoProcesso;
  largura: number;
  /** Grupo em `legalizacao_opcoes` que alimenta o combo. */
  grupo?: string;
  padrao: boolean;
  fixa?: boolean;
  ajuda?: string;
}

export const COLUNAS_PROCESSO: ColunaProcesso[] = [
  { campo: 'status', rotulo: 'Status', tipo: 'combo', grupo: 'processo_status', largura: 190, padrao: true, fixa: true, ajuda: 'Concluído, Arquivado, Cancelado e Indeferido encerram o processo.' },
  { campo: 'empresa', rotulo: 'Empresa', tipo: 'empresa', largura: 280, padrao: true, fixa: true, ajuda: 'Digite o nome ou o CNPJ: o portal completa o resto.' },
  { campo: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', largura: 160, padrao: true },
  { campo: 'tipo_servico', rotulo: 'Tipo de serviço', tipo: 'combo', grupo: 'processo_tipo_servico', largura: 190, padrao: true },
  { campo: 'orgao', rotulo: 'Órgão', tipo: 'combo', grupo: 'processo_orgao', largura: 180, padrao: true },
  { campo: 'protocolo', rotulo: 'Protocolo', tipo: 'texto', largura: 160, padrao: true },
  { campo: 'data_entrada', rotulo: 'Data entrada', tipo: 'data', largura: 130, padrao: true },
  { campo: 'prazo', rotulo: 'Prazo', tipo: 'data', largura: 130, padrao: true, ajuda: 'Vencido ou vencendo em até 3 dias destaca a linha.' },
  { campo: 'responsavel', rotulo: 'Responsável', tipo: 'pessoa', largura: 200, padrao: true },
  { campo: 'proxima_acao', rotulo: 'Próxima ação', tipo: 'combo', grupo: 'processo_proxima_acao', largura: 220, padrao: true },
  { campo: 'ultima_atualizacao', rotulo: 'Última atualização', tipo: 'data', largura: 160, padrao: true },
  { campo: 'observacoes', rotulo: 'Observações', tipo: 'longo', largura: 280, padrao: true },
  { campo: 'indicador', rotulo: 'Indicador', tipo: 'combo', grupo: 'processo_indicador', largura: 170, padrao: true },
];

export const GRUPOS_OPCOES = [
  'processo_status',
  'processo_tipo_servico',
  'processo_orgao',
  'processo_proxima_acao',
  'processo_indicador',
] as const;

/* -------------------------------------------------------------------------- */
/* Situação do prazo — a formatação condicional da planilha                    */
/* -------------------------------------------------------------------------- */

/** Mesma lista de `processo_encerrado()` no banco. */
export const STATUS_ENCERRADOS = ['Concluído', 'Arquivado', 'Cancelado', 'Indeferido'];

export function processoEncerrado(status: string | null | undefined): boolean {
  return STATUS_ENCERRADOS.includes(status ?? '');
}

function paraDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1);
}

export function diasAtePrazo(prazo: string, hoje = new Date()): number {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((paraDataLocal(prazo).getTime() - base.getTime()) / 86_400_000);
}

/**
 * As duas regras de formatação condicional do Excel, na íntegra:
 * vencido e não encerrado → atrasado; vencendo em até 3 dias → atenção.
 */
export function situacaoProcesso(
  prazo: string | null,
  status: string | null,
  hoje = new Date(),
): SituacaoProcesso {
  if (processoEncerrado(status)) return 'encerrado';
  if (!prazo) return 'sem_prazo';
  const dias = diasAtePrazo(prazo, hoje);
  if (dias < 0) return 'atrasado';
  if (dias <= 3) return 'atencao';
  return 'em_dia';
}

export const ROTULO_SITUACAO: Record<SituacaoProcesso, string> = {
  atrasado: 'Atrasado',
  atencao: 'Vence em breve',
  em_dia: 'No prazo',
  sem_prazo: 'Sem prazo',
  encerrado: 'Encerrado',
};

export const TOM_SITUACAO: Record<SituacaoProcesso, 'erro' | 'alerta' | 'sucesso' | 'neutro'> = {
  atrasado: 'erro',
  atencao: 'alerta',
  em_dia: 'sucesso',
  sem_prazo: 'neutro',
  encerrado: 'neutro',
};

/** Cor de fundo da linha, equivalente ao preenchimento da planilha. */
export const FUNDO_SITUACAO: Record<SituacaoProcesso, string> = {
  atrasado: 'bg-erro-suave/50',
  atencao: 'bg-alerta-suave/50',
  em_dia: '',
  sem_prazo: '',
  encerrado: 'opacity-60',
};

/* -------------------------------------------------------------------------- */
/* Acesso a dados                                                              */
/* -------------------------------------------------------------------------- */

export interface FiltroProcessos {
  busca?: string;
  status?: string;
  orgao?: string;
  tipoServico?: string;
  responsavelId?: string;
  empresaId?: string;
  /** 'abertos' esconde o que já foi encerrado; 'atrasados' e 'atencao' filtram prazo. */
  recorte?: 'todos' | 'abertos' | 'atrasados' | 'atencao' | 'encerrados';
  ordenarPor?: string;
  ascendente?: boolean;
}

const ORDENAVEIS = new Set([
  'status', 'empresa', 'cnpj', 'tipo_servico', 'orgao', 'protocolo',
  'data_entrada', 'prazo', 'responsavel', 'proxima_acao', 'ultima_atualizacao', 'indicador',
]);

function hojeIso(deslocamento = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function buscarProcessos(
  supabase: SupabaseClient,
  filtro: FiltroProcessos,
): Promise<Processo[]> {
  let query = supabase.from('legalizacao_processos').select('*');

  const termo = (filtro.busca ?? '').replace(/[,()\\]/g, ' ').trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, '');
    query = query.or(
      [
        `empresa.ilike.%${termo}%`,
        digitos ? `cnpj.ilike.%${digitos}%` : `cnpj.ilike.%${termo}%`,
        `protocolo.ilike.%${termo}%`,
        `responsavel.ilike.%${termo}%`,
        `observacoes.ilike.%${termo}%`,
      ].join(','),
    );
  }

  if (filtro.status) query = query.eq('status', filtro.status);
  if (filtro.orgao) query = query.eq('orgao', filtro.orgao);
  if (filtro.tipoServico) query = query.eq('tipo_servico', filtro.tipoServico);
  if (filtro.responsavelId) query = query.eq('responsavel_id', filtro.responsavelId);
  if (filtro.empresaId) query = query.eq('empresa_id', filtro.empresaId);

  // Os recortes de prazo são os mesmos do painel, para que clicar num
  // indicador e filtrar a tabela levem sempre ao mesmo conjunto.
  switch (filtro.recorte) {
    case 'abertos':
      query = query.not('status', 'in', `(${STATUS_ENCERRADOS.map((s) => `"${s}"`).join(',')})`);
      break;
    case 'encerrados':
      query = query.in('status', STATUS_ENCERRADOS);
      break;
    case 'atrasados':
      query = query
        .not('status', 'in', `(${STATUS_ENCERRADOS.map((s) => `"${s}"`).join(',')})`)
        .lt('prazo', hojeIso());
      break;
    case 'atencao':
      query = query
        .not('status', 'in', `(${STATUS_ENCERRADOS.map((s) => `"${s}"`).join(',')})`)
        .gte('prazo', hojeIso())
        .lte('prazo', hojeIso(3));
      break;
  }

  const ordenarPor = ORDENAVEIS.has(filtro.ordenarPor ?? '') ? filtro.ordenarPor! : 'prazo';
  query = query.order(ordenarPor, {
    ascending: filtro.ascendente ?? true,
    nullsFirst: false,
  });

  // A base cabe folgadamente numa resposta; o teto existe só para não
  // deixar a tela travar se um dia virar dezenas de milhares de linhas.
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Processo[];
}

/** Converte o que o editor devolve para o formato da coluna. */
export function prepararCampoProcesso(campo: keyof Processo, valor: unknown): unknown {
  if (valor === '' || valor === undefined) return null;
  if (campo === 'cnpj' && typeof valor === 'string') {
    const digitos = valor.replace(/\D/g, '');
    return digitos === '' ? null : digitos;
  }
  return valor;
}
