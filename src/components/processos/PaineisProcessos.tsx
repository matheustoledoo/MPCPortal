'use client';

import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FolderOpen } from 'lucide-react';

import { Cartao, cn } from '@/components/ui';
import type { ContagemRotulada, EstatisticasProcessos } from '@/types/banco';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * As abas DASHBOARD, DASHBOARD_ORGAO e DASHBOARD_EXECUTIVO da planilha,
 * reunidas num painel só — e clicáveis, que é o que o Excel não fazia:
 * clicar num número filtra a tabela abaixo.
 */
export function PaineisProcessos({
  stats,
  recorte,
  aoRecortar,
}: {
  stats: EstatisticasProcessos;
  recorte: string;
  aoRecortar: (recorte: 'todos' | 'abertos' | 'atrasados' | 'atencao' | 'encerrados') => void;
}) {
  const cartoes = [
    {
      chave: 'abertos' as const,
      rotulo: 'Em aberto',
      valor: stats.abertos,
      icone: <FolderOpen className="h-4 w-4" />,
      tom: 'marca',
      detalhe: `${stats.total} no total`,
    },
    {
      chave: 'atrasados' as const,
      rotulo: 'Atrasados',
      valor: stats.atrasados,
      icone: <AlertTriangle className="h-4 w-4" />,
      tom: stats.atrasados > 0 ? 'erro' : 'neutro',
      detalhe: 'prazo já vencido',
    },
    {
      chave: 'atencao' as const,
      rotulo: 'Vencem em 3 dias',
      valor: stats.atencao,
      icone: <Clock className="h-4 w-4" />,
      tom: stats.atencao > 0 ? 'alerta' : 'neutro',
      detalhe: 'janela de atenção',
    },
    {
      chave: 'todos' as const,
      rotulo: 'Sem prazo',
      valor: stats.sem_prazo,
      icone: <CalendarClock className="h-4 w-4" />,
      tom: 'neutro',
      detalhe: 'abertos sem data definida',
    },
    {
      chave: 'encerrados' as const,
      rotulo: 'Concluídos no mês',
      valor: stats.concluidos_mes,
      icone: <CheckCircle2 className="h-4 w-4" />,
      tom: 'sucesso',
      detalhe: 'desde o dia 1º',
    },
  ];

  const tons: Record<string, string> = {
    marca: 'bg-marca-50 text-marca-800 ring-marca-200',
    erro: 'bg-erro-suave text-erro ring-red-200',
    alerta: 'bg-alerta-suave text-alerta ring-amber-200',
    sucesso: 'bg-sucesso-suave text-sucesso ring-green-200',
    neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {cartoes.map((cartao) => (
          <button
            key={cartao.rotulo}
            onClick={() => aoRecortar(cartao.chave)}
            className={cn(
              'rounded-xl border bg-superficie-elevada p-4 text-left transition-colors',
              recorte === cartao.chave ? 'border-marca-400 ring-1 ring-marca-200' : 'border-borda hover:border-marca-300',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">
                  {cartao.rotulo}
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-texto">
                  {cartao.valor.toLocaleString('pt-BR')}
                </p>
                <p className="mt-0.5 text-[11px] text-texto-fraco">{cartao.detalhe}</p>
              </div>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                  tons[cartao.tom],
                )}
              >
                {cartao.icone}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Barras titulo="Por status" dados={stats.por_status} />
        <Barras titulo="Por órgão" dados={stats.por_orgao} />
        <Barras titulo="Por responsável" dados={stats.por_responsavel} vazio="Nada em aberto." />
      </div>

      <Vencimentos dados={stats.vencimentos_por_mes} />
    </div>
  );
}

function Barras({
  titulo,
  dados,
  vazio = 'Nenhum processo lançado ainda.',
}: {
  titulo: string;
  dados: ContagemRotulada[];
  vazio?: string;
}) {
  const maior = Math.max(1, ...dados.map((d) => d.total));

  return (
    <Cartao className="p-4">
      <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
      {dados.length === 0 ? (
        <p className="mt-3 text-xs text-texto-fraco">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dados.slice(0, 8).map((item) => (
            <li key={item.valor}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-texto-suave">{item.valor}</span>
                <span className="shrink-0 font-semibold tabular-nums text-texto">{item.total}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-marca-500"
                  style={{ width: `${(item.total / maior) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function Vencimentos({ dados }: { dados: { mes: number; total: number }[] }) {
  const maior = Math.max(1, ...dados.map((d) => d.total));
  const mesAtual = new Date().getMonth() + 1;

  return (
    <Cartao className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-texto">Vencimentos por mês</h3>
        <span className="text-xs text-texto-fraco">{new Date().getFullYear()}</span>
      </div>

      <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
        {dados.map((item) => (
          <div key={item.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-semibold tabular-nums text-texto-suave">
              {item.total || ''}
            </span>
            <div
              className={cn(
                'w-full rounded-t transition-colors',
                item.mes === mesAtual ? 'bg-marca-600' : 'bg-marca-200',
              )}
              style={{ height: `${Math.max(item.total > 0 ? 4 : 2, (item.total / maior) * 92)}px` }}
              title={`${MESES[item.mes - 1]}: ${item.total} vencimento(s)`}
            />
            <span
              className={cn(
                'text-[10px]',
                item.mes === mesAtual ? 'font-semibold text-marca-700' : 'text-texto-fraco',
              )}
            >
              {MESES[item.mes - 1]}
            </span>
          </div>
        ))}
      </div>
    </Cartao>
  );
}
