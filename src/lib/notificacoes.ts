/**
 * Central de notificações: rótulos, cores e as ações que dá para fazer
 * direto da notificação (concluir uma obrigação do calendário, fechar o
 * ciclo de uma atribuição, arquivar).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CategoriaNotificacao, Notificacao, PrioridadeNotificacao } from '@/types/banco';

export const CATEGORIAS: { valor: CategoriaNotificacao; rotulo: string; descricao: string }[] = [
  { valor: 'prazo', rotulo: 'Prazos', descricao: 'O que está atrasado ou perto de vencer no seu nome.' },
  { valor: 'processo', rotulo: 'Controle Legalização', descricao: 'Processos designados a você e mudanças de status.' },
  { valor: 'atribuicao', rotulo: 'Atribuições', descricao: 'Responsabilidades e empresas colocadas no seu nome.' },
  { valor: 'calendario', rotulo: 'Calendário', descricao: 'Demandas, reuniões e obrigações designadas a você.' },
  { valor: 'mencao', rotulo: 'Menções', descricao: 'Quando alguém escreve @você no Fórum.' },
  { valor: 'forum', rotulo: 'Fórum da Meta', descricao: 'Posts de quem você segue com o sininho, respostas e curtidas.' },
  { valor: 'integracao', rotulo: 'Integração de clientes', descricao: 'Quando um departamento finaliza o roteiro.' },
  { valor: 'sistema', rotulo: 'Sistema', descricao: 'Avisos gerais do portal.' },
];

export function rotuloCategoria(c: CategoriaNotificacao): string {
  return CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c;
}

export const TOM_PRIORIDADE: Record<PrioridadeNotificacao, 'erro' | 'alerta' | 'info' | 'neutro'> = {
  urgente: 'erro',
  alta: 'alerta',
  normal: 'info',
  baixa: 'neutro',
};

/** "agora", "há 5 min", "há 3 h", "ontem", "12/10". */
export function tempoRelativo(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const segundos = Math.round((agora.getTime() - data.getTime()) / 1000);
  if (segundos < 45) return 'agora';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: dias > 300 ? '2-digit' : undefined });
}

export type AcaoNotificacao = 'lida' | 'nao_lida' | 'concluir' | 'reabrir' | 'arquivar' | 'restaurar' | 'todas_lidas';

export async function marcarNotificacoes(
  supabase: SupabaseClient,
  ids: string[],
  acao: AcaoNotificacao,
): Promise<number> {
  const { data, error } = await supabase.rpc('marcar_notificacoes', { p_ids: ids, p_acao: acao });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** A notificação permite concluir a tarefa de origem ali mesmo? */
export function acaoDeOrigem(n: Notificacao): 'calendario' | 'atribuicao' | null {
  const acao = (n.dados as { acao?: string })?.acao;
  if (acao === 'concluir_calendario') return 'calendario';
  if (acao === 'concluir_atribuicao') return 'atribuicao';
  return null;
}

/**
 * Conclui de verdade: marca a obrigação como feita no calendário ou fecha o
 * ciclo da atribuição — e a notificação fica concluída junto.
 */
export async function concluirOrigem(
  supabase: SupabaseClient,
  n: Notificacao,
  meuNome: string,
  meuId: string,
): Promise<void> {
  const tipo = acaoDeOrigem(n);
  if (tipo === 'calendario') {
    const chave = String((n.dados as { chave_calendario?: string }).chave_calendario ?? '');
    const data = chave.split(':').pop() ?? '';
    const { error } = await supabase.from('calendario_conclusoes').upsert(
      { chave, mes: data.slice(0, 7), concluido_por: meuId, concluido_por_nome: meuNome },
      { onConflict: 'chave', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  } else if (tipo === 'atribuicao') {
    const id = String((n.dados as { atribuicao_id?: string }).atribuicao_id ?? '');
    const { error } = await supabase.rpc('concluir_atribuicao', { p_atribuicao: id, p_observacao: 'Concluída pela central de notificações.' });
    if (error) throw new Error(error.message);
  }
  await marcarNotificacoes(supabase, [n.id], 'concluir');
}
