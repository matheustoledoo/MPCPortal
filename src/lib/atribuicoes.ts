/**
 * Regras de prazo das atribuições.
 *
 * Espelham `minhas_atribuicoes()` (migration 0011) para que a tela mostre
 * exatamente o mesmo que o banco calcula — inclusive nas listas que não
 * passam por aquela função.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Periodicidade, SituacaoAtribuicao } from '@/types/banco';

/**
 * Converte 'YYYY-MM-DD' em Date local.
 * `new Date('2026-03-01')` seria interpretado como UTC e, em fusos negativos,
 * voltaria 28 de fevereiro — um dia inteiro de erro em um cálculo de prazo.
 */
export function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1);
}

/** Dias entre hoje e o prazo. Negativo = atrasado. */
export function diasAte(iso: string, hoje = new Date()): number {
  const alvo = dataLocal(iso);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000);
}

export function situacaoDe(dias: number, alertaDiasAntes: number): SituacaoAtribuicao {
  if (dias < 0) return 'atrasada';
  if (dias <= alertaDiasAntes) return 'proxima';
  return 'em_dia';
}

export const TONS_SITUACAO: Record<SituacaoAtribuicao, 'erro' | 'alerta' | 'sucesso'> = {
  atrasada: 'erro',
  proxima: 'alerta',
  em_dia: 'sucesso',
};

/** Texto humano do prazo: "vence hoje", "atrasada há 3 dias", "em 12 dias". */
export function textoPrazo(dias: number): string {
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias === -1) return 'atrasada há 1 dia';
  if (dias < 0) return `atrasada há ${Math.abs(dias)} dias`;
  return `em ${dias} dias`;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dataLocal(iso).toLocaleDateString('pt-BR');
}

/** Data de hoje em 'YYYY-MM-DD', para valor inicial de <input type="date">. */
export function hojeIso(deslocamentoDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Quem cuida de cada coluna                                                   */
/* -------------------------------------------------------------------------- */

/** Uma responsabilidade ativa, do jeito que o cabeçalho da planilha exibe. */
export interface ResponsavelDeColuna {
  responsavel: string;
  titulo: string;
  periodicidade: string;
  proximo_prazo: string;
  souEu: boolean;
}

/**
 * Monta o mapa coluna → responsáveis para a planilha.
 *
 * Fica aberto a qualquer pessoa que abra a tela — "qualquer um ter acesso a
 * quem é responsável" foi pedido explicitamente, e a RLS de `atribuicoes`
 * libera SELECT para todo usuário ativo.
 *
 * Se a migration 0011 ainda não tiver sido aplicada, a consulta falha e o
 * mapa volta vazio: a planilha continua funcionando, apenas sem os avisos.
 */
export async function responsaveisPorColuna(
  supabase: SupabaseClient,
  meuId: string,
  rotuloPeriodicidade: (valor: Periodicidade) => string,
): Promise<Record<string, ResponsavelDeColuna[]>> {
  const { data, error } = await supabase
    .from('atribuicoes')
    .select(
      'titulo, colunas, periodicidade, proximo_prazo, responsavel_id, ' +
        'responsavel:profiles!atribuicoes_responsavel_id_fkey(nome)',
    )
    .eq('ativa', true)
    .eq('tabela', 'legalizacao_empresas');

  if (error || !data) return {};

  const mapa: Record<string, ResponsavelDeColuna[]> = {};

  for (const linha of data as unknown as {
    titulo: string;
    colunas: string[];
    periodicidade: Periodicidade;
    proximo_prazo: string;
    responsavel_id: string;
    responsavel: { nome: string } | { nome: string }[] | null;
  }[]) {
    const dono = Array.isArray(linha.responsavel) ? linha.responsavel[0] : linha.responsavel;
    const item: ResponsavelDeColuna = {
      responsavel: dono?.nome ?? 'sem responsável',
      titulo: linha.titulo,
      periodicidade: rotuloPeriodicidade(linha.periodicidade),
      proximo_prazo: formatarData(linha.proximo_prazo),
      souEu: linha.responsavel_id === meuId,
    };

    for (const coluna of linha.colunas ?? []) {
      (mapa[coluna] ??= []).push(item);
    }
  }

  return mapa;
}
