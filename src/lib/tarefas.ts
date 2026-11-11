/**
 * Tarefas e lembretes — constantes e regras de prazo usadas pelo quadro.
 * As regras de quem vê/edita ficam no banco (migration 0027); o que está
 * aqui decide só o que a tela mostra.
 */

import type { PrioridadeTarefa, StatusTarefa, Tarefa } from '@/types/banco';

export const COLUNAS_TAREFA: { status: StatusTarefa; rotulo: string; cor: string; fundo: string }[] = [
  { status: 'a_fazer', rotulo: 'A fazer', cor: '#64748b', fundo: 'bg-slate-50' },
  { status: 'em_andamento', rotulo: 'Em andamento', cor: '#2f62c9', fundo: 'bg-blue-50/60' },
  { status: 'em_revisao', rotulo: 'Em revisão', cor: '#b7791f', fundo: 'bg-amber-50/60' },
  { status: 'concluido', rotulo: 'Concluído', cor: '#15803d', fundo: 'bg-green-50/60' },
  { status: 'cancelado', rotulo: 'Cancelado', cor: '#9ca3af', fundo: 'bg-slate-100/70' },
];

export const rotuloStatusTarefa = (s: StatusTarefa) => COLUNAS_TAREFA.find((c) => c.status === s)?.rotulo ?? s;

export const PRIORIDADES: { valor: PrioridadeTarefa; rotulo: string; tom: 'neutro' | 'info' | 'alerta' | 'erro'; peso: number }[] = [
  { valor: 'urgente', rotulo: 'Urgente', tom: 'erro', peso: 0 },
  { valor: 'alta', rotulo: 'Alta', tom: 'alerta', peso: 1 },
  { valor: 'normal', rotulo: 'Normal', tom: 'info', peso: 2 },
  { valor: 'baixa', rotulo: 'Baixa', tom: 'neutro', peso: 3 },
];

export const prioridadeDe = (p: PrioridadeTarefa) => PRIORIDADES.find((x) => x.valor === p) ?? PRIORIDADES[2];

export const tarefaEncerrada = (t: Pick<Tarefa, 'status'>) => t.status === 'concluido' || t.status === 'cancelado';

export type SituacaoPrazo = 'sem' | 'encerrada' | 'atrasada' | 'hoje' | 'proxima' | 'futura';

/** `hoje` em AAAA-MM-DD. "Próxima" = vence nos próximos 3 dias. */
export function situacaoDoPrazo(t: Pick<Tarefa, 'status' | 'vencimento'>, hoje: string): SituacaoPrazo {
  if (tarefaEncerrada(t)) return 'encerrada';
  if (!t.vencimento) return 'sem';
  if (t.vencimento < hoje) return 'atrasada';
  if (t.vencimento === hoje) return 'hoje';
  const dias = Math.round((Date.parse(`${t.vencimento}T12:00:00`) - Date.parse(`${hoje}T12:00:00`)) / 86_400_000);
  return dias <= 3 ? 'proxima' : 'futura';
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}${a === String(new Date().getFullYear()) ? '' : `/${a.slice(2)}`}`;
}

export const horaCurta = (h: string | null | undefined) => (h ? h.slice(0, 5) : '');

/** Posição de quem entra entre dois vizinhos (ordenação fracionária). */
export function ordemEntre(antes: number | undefined, depois: number | undefined): number {
  if (antes !== undefined && depois !== undefined) return (antes + depois) / 2;
  if (antes !== undefined) return antes + 1;
  if (depois !== undefined) return depois - 1;
  return 1;
}

export function podeEditarTarefa(t: Pick<Tarefa, 'responsaveis' | 'criado_por' | 'privada'>, meuId: string, gerencia: boolean): boolean {
  return t.responsaveis.includes(meuId) || t.criado_por === meuId || (gerencia && !t.privada);
}

export const CAMPOS_TAREFA =
  'id, titulo, descricao, tipo, status, prioridade, categoria, vencimento, hora, responsaveis, privada, empresa_id, empresa, checklist, ordem, criado_por, criado_por_nome, concluida_em, created_at, updated_at';
