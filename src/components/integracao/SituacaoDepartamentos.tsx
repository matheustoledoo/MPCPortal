import { Check, Circle, CircleDot } from 'lucide-react';

import { cn } from '@/lib/cn';
import { INTEG_DEPTS, tituloDepartamento, type DepartamentoIntegracao } from '@/lib/integracao';
import type { ResumoIntegracao } from '@/types/banco';

export type SituacaoRoteiro = 'ok' | 'and' | 'nao';

/** `stDept()` do app antigo: finalizado, em andamento ou não iniciado. */
export function situacaoDoRoteiro(resumo: ResumoIntegracao[], integracaoId: string, d: DepartamentoIntegracao): { s: SituacaoRoteiro; r?: ResumoIntegracao } {
  const r = resumo.find((x) => x.integracao_id === integracaoId && x.departamento === d);
  return { s: r?.finalizado ? 'ok' : r ? 'and' : 'nao', r };
}

export function descricaoSituacao(s: SituacaoRoteiro, r?: ResumoIntegracao): string {
  if (s === 'ok')
    return `Finalizado${r?.finalizado_por ? ` por ${r.finalizado_por}` : ''}${r?.finalizado_em ? ` em ${new Date(r.finalizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`;
  return s === 'and' ? `Em andamento${r?.atendido_por ? ` · ${r.atendido_por}` : ''}` : 'Não iniciado';
}

const ESTILO: Record<SituacaoRoteiro, string> = {
  ok: 'bg-sucesso-suave text-sucesso ring-green-200',
  and: 'bg-alerta-suave text-alerta ring-amber-200',
  nao: 'bg-white text-texto-fraco ring-borda',
};

/** Os selos de cada departamento, como os "stchips" do app antigo. */
export function SituacaoDepartamentos({
  resumo,
  integracaoId,
  departamentos = INTEG_DEPTS,
  aoEscolher,
  atual,
}: {
  resumo: ResumoIntegracao[];
  integracaoId: string;
  departamentos?: DepartamentoIntegracao[];
  aoEscolher?: (d: DepartamentoIntegracao) => void;
  atual?: DepartamentoIntegracao | null;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {departamentos.map((d) => {
        const { s, r } = situacaoDoRoteiro(resumo, integracaoId, d);
        const Icone = s === 'ok' ? Check : s === 'and' ? CircleDot : Circle;
        const classe = cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
          ESTILO[s],
          atual === d && 'ring-2 ring-marca-500',
        );
        const conteudo = (
          <>
            <Icone className="h-3 w-3" /> {tituloDepartamento(d)}
          </>
        );
        return aoEscolher ? (
          <button key={d} type="button" onClick={() => aoEscolher(d)} title={descricaoSituacao(s, r)} className={cn(classe, 'hover:brightness-95')}>
            {conteudo}
          </button>
        ) : (
          <span key={d} title={descricaoSituacao(s, r)} className={classe}>
            {conteudo}
          </span>
        );
      })}
    </div>
  );
}
