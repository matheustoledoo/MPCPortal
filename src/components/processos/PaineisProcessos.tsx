'use client';

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  MousePointerClick,
  X,
} from 'lucide-react';

import { Cartao, cn } from '@/components/ui';
import type { ContagemRotulada, EstatisticasProcessos } from '@/types/banco';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface VencimentoMes {
  mes: number;
  total: number;
  abertos: number;
  atrasados: number;
}

type Recorte = 'todos' | 'abertos' | 'atrasados' | 'atencao' | 'encerrados';

/**
 * As abas DASHBOARD, DASHBOARD_ORGAO e DASHBOARD_EXECUTIVO da planilha,
 * reunidas num painel só — e clicáveis, que é o que o Excel não fazia:
 * clicar num número, numa barra ou num mês filtra a tabela abaixo.
 */
export function PaineisProcessos({
  stats,
  recorte,
  aoRecortar,
  vencimentos,
  ano,
  aoMudarAno,
  mesSelecionado,
  aoEscolherMes,
  filtroStatus,
  aoFiltrarStatus,
  filtroOrgao,
  aoFiltrarOrgao,
  filtroResponsavel,
  aoFiltrarResponsavel,
}: {
  stats: EstatisticasProcessos;
  recorte: string;
  aoRecortar: (recorte: Recorte) => void;
  vencimentos: VencimentoMes[];
  ano: number;
  aoMudarAno: (ano: number) => void;
  mesSelecionado: number | null;
  aoEscolherMes: (mes: number | null) => void;
  filtroStatus: string;
  aoFiltrarStatus: (valor: string) => void;
  filtroOrgao: string;
  aoFiltrarOrgao: (valor: string) => void;
  filtroResponsavel: string;
  aoFiltrarResponsavel: (nome: string) => void;
}) {
  const cartoes = [
    { chave: 'abertos' as const, rotulo: 'Em aberto', valor: stats.abertos, icone: <FolderOpen className="h-4 w-4" />, tom: 'marca', detalhe: `${stats.total} no total` },
    { chave: 'atrasados' as const, rotulo: 'Atrasados', valor: stats.atrasados, icone: <AlertTriangle className="h-4 w-4" />, tom: stats.atrasados > 0 ? 'erro' : 'neutro', detalhe: 'prazo já vencido' },
    { chave: 'atencao' as const, rotulo: 'Vencem em 3 dias', valor: stats.atencao, icone: <Clock className="h-4 w-4" />, tom: stats.atencao > 0 ? 'alerta' : 'neutro', detalhe: 'janela de atenção' },
    { chave: 'todos' as const, rotulo: 'Sem prazo', valor: stats.sem_prazo, icone: <CalendarClock className="h-4 w-4" />, tom: 'neutro', detalhe: 'abertos sem data definida' },
    { chave: 'encerrados' as const, rotulo: 'Concluídos no mês', valor: stats.concluidos_mes, icone: <CheckCircle2 className="h-4 w-4" />, tom: 'sucesso', detalhe: 'desde o dia 1º' },
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
                <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">{cartao.rotulo}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-texto">{cartao.valor.toLocaleString('pt-BR')}</p>
                <p className="mt-0.5 text-[11px] text-texto-fraco">{cartao.detalhe}</p>
              </div>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', tons[cartao.tom])}>
                {cartao.icone}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Barras titulo="Por status" dados={stats.por_status} selecionado={filtroStatus} aoEscolher={aoFiltrarStatus} />
        <Barras titulo="Por órgão" dados={stats.por_orgao} selecionado={filtroOrgao} aoEscolher={aoFiltrarOrgao} />
        <Barras
          titulo="Por responsável"
          dados={stats.por_responsavel}
          vazio="Nada em aberto."
          selecionado={filtroResponsavel}
          aoEscolher={aoFiltrarResponsavel}
        />
      </div>

      <Vencimentos
        dados={vencimentos}
        ano={ano}
        aoMudarAno={aoMudarAno}
        mesSelecionado={mesSelecionado}
        aoEscolherMes={aoEscolherMes}
      />
    </div>
  );
}

function Barras({
  titulo,
  dados,
  vazio = 'Nenhum processo lançado ainda.',
  selecionado,
  aoEscolher,
}: {
  titulo: string;
  dados: ContagemRotulada[];
  vazio?: string;
  selecionado: string;
  aoEscolher: (valor: string) => void;
}) {
  const maior = Math.max(1, ...dados.map((d) => d.total));

  return (
    <Cartao className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
        {selecionado ? (
          <button type="button" onClick={() => aoEscolher('')} className="inline-flex items-center gap-1 text-[11px] font-medium text-marca-700 hover:underline">
            <X className="h-3 w-3" /> limpar
          </button>
        ) : (
          <span className="text-[10px] text-texto-fraco">clique para filtrar</span>
        )}
      </div>
      {dados.length === 0 ? (
        <p className="mt-3 text-xs text-texto-fraco">{vazio}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {dados.slice(0, 8).map((item) => {
            const ativo = selecionado === item.valor;
            return (
              <li key={item.valor}>
                <button
                  type="button"
                  onClick={() => aoEscolher(ativo ? '' : item.valor)}
                  className={cn(
                    'w-full rounded-lg px-1.5 py-1 text-left transition-colors',
                    ativo ? 'bg-marca-50 ring-1 ring-marca-200' : 'hover:bg-superficie',
                    selecionado && !ativo && 'opacity-50',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={cn('min-w-0 truncate', ativo ? 'font-semibold text-marca-800' : 'text-texto-suave')}>{item.valor}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-texto">{item.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', ativo ? 'bg-marca-700' : 'bg-marca-500')} style={{ width: `${(item.total / maior) * 100}%` }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}

function Vencimentos({
  dados,
  ano,
  aoMudarAno,
  mesSelecionado,
  aoEscolherMes,
}: {
  dados: VencimentoMes[];
  ano: number;
  aoMudarAno: (ano: number) => void;
  mesSelecionado: number | null;
  aoEscolherMes: (mes: number | null) => void;
}) {
  const maior = Math.max(1, ...dados.map((d) => d.total));
  const hoje = new Date();
  const mesAtual = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : null;
  const totalAno = dados.reduce((s, d) => s + d.total, 0);

  return (
    <Cartao className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-texto">Vencimentos por mês</h3>
          <p className="flex items-center gap-1 text-[11px] text-texto-fraco">
            <MousePointerClick className="h-3 w-3" />
            Clique num mês para ver só os processos com prazo nele. {totalAno} prazo(s) em {ano}.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {mesSelecionado && (
            <button
              type="button"
              onClick={() => aoEscolherMes(null)}
              className="mr-2 inline-flex items-center gap-1 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-800 ring-1 ring-marca-200 hover:bg-marca-100"
            >
              {MESES_EXTENSO[mesSelecionado - 1]} de {ano}
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => aoMudarAno(ano - 1)}
            className="rounded-lg p-1.5 text-texto-suave hover:bg-superficie"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums text-texto">{ano}</span>
          <button
            type="button"
            onClick={() => aoMudarAno(ano + 1)}
            className="rounded-lg p-1.5 text-texto-suave hover:bg-superficie"
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end gap-1.5" style={{ height: 140 }}>
        {Array.from({ length: 12 }, (_, i) => dados.find((d) => d.mes === i + 1) ?? { mes: i + 1, total: 0, abertos: 0, atrasados: 0 }).map((item) => {
          const selecionado = mesSelecionado === item.mes;
          const altura = (n: number) => (n / maior) * 100;
          const encerrados = item.total - item.abertos;
          const noPrazo = item.abertos - item.atrasados;
          return (
            <button
              key={item.mes}
              type="button"
              onClick={() => aoEscolherMes(selecionado ? null : item.mes)}
              className={cn(
                'group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-lg pb-0.5 transition-colors',
                selecionado ? 'bg-marca-50 ring-1 ring-marca-300' : 'hover:bg-superficie',
                mesSelecionado && !selecionado && 'opacity-50',
              )}
              title={`${MESES_EXTENSO[item.mes - 1]}: ${item.total} prazo(s) — ${item.atrasados} atrasado(s), ${noPrazo} no prazo, ${encerrados} encerrado(s)`}
            >
              <span className="text-[10px] font-semibold tabular-nums text-texto-suave">{item.total || ''}</span>
              <div className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t" style={{ height: `${Math.max(item.total ? 6 : 2, altura(item.total))}px` }}>
                {item.total === 0 ? (
                  <div className="h-full bg-slate-200" />
                ) : (
                  <>
                    <div className="bg-erro" style={{ height: `${(item.atrasados / item.total) * 100}%` }} />
                    <div className={item.mes === mesAtual || selecionado ? 'bg-marca-600' : 'bg-marca-400'} style={{ height: `${(noPrazo / item.total) * 100}%` }} />
                    <div className="bg-slate-300" style={{ height: `${(encerrados / item.total) * 100}%` }} />
                  </>
                )}
              </div>
              <span className={cn('text-[10px]', item.mes === mesAtual || selecionado ? 'font-semibold text-marca-700' : 'text-texto-fraco')}>
                {MESES[item.mes - 1]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-3 text-[10px] text-texto-fraco">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-erro" /> atrasados</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-marca-500" /> em aberto no prazo</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300" /> encerrados</span>
      </div>
    </Cartao>
  );
}
