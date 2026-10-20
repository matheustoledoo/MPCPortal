'use client';

import { useMemo, useRef, useState } from 'react';

import { ArrowDown, ArrowUp, Columns3, FunctionSquare, Pencil, Plus, RotateCcw, Search } from 'lucide-react';

import { Popover } from '@/components/ui/Popover';
import { Botao, Selo, cn } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';

/**
 * Quais colunas aparecem e em que ordem (preferência pessoal, guardada no
 * banco) e, para quem tem permissão, criar e editar colunas do time.
 */
export function PainelColunas({
  colunas,
  ordem,
  visiveis,
  aoAlternar,
  aoMover,
  aoMostrarTodas,
  aoRestaurar,
  podePersonalizar,
  aoNovaColuna,
  aoEditarColuna,
}: {
  /** Já na ordem pessoal. */
  colunas: DefinicaoColuna[];
  ordem: string[];
  visiveis: string[];
  aoAlternar: (campo: string) => void;
  aoMover: (campo: string, direcao: -1 | 1) => void;
  aoMostrarTodas: () => void;
  aoRestaurar: () => void;
  podePersonalizar: boolean;
  aoNovaColuna: () => void;
  aoEditarColuna: (coluna: DefinicaoColuna) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ancora = useRef<HTMLButtonElement>(null);

  const termo = busca.trim().toLowerCase();
  const lista = useMemo(
    () => (termo ? colunas.filter((c) => c.rotulo.toLowerCase().includes(termo)) : colunas),
    [colunas, termo],
  );
  const ocultas = colunas.length - visiveis.filter((v) => colunas.some((c) => c.campo === v)).length;

  return (
    <>
      <Botao ref={ancora} variante={aberto ? 'sutil' : 'secundario'} onClick={() => setAberto((v) => !v)}>
        <Columns3 className="h-4 w-4" />
        Colunas
        {ocultas > 0 && (
          <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold text-texto-suave" title={`${ocultas} oculta(s)`}>
            {ocultas}
          </span>
        )}
      </Botao>

      <Popover ancora={ancora} aberto={aberto} aoFechar={() => setAberto(false)} largura={340} alinhamento="fim">
        <div className="space-y-2 border-b border-borda p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-fraco">
              Colunas ({visiveis.length}/{colunas.length})
            </p>
            <div className="flex gap-2 text-[11px]">
              <button type="button" onClick={aoMostrarTodas} className="font-medium text-marca-700 hover:underline">
                Mostrar todas
              </button>
              <button
                type="button"
                onClick={aoRestaurar}
                className="inline-flex items-center gap-1 font-medium text-texto-suave hover:underline"
                title="Volta às colunas e à ordem padrão"
              >
                <RotateCcw className="h-3 w-3" /> Padrão
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-fraco" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar coluna…"
              className="h-8 w-full rounded-lg border border-borda-forte bg-white pl-7 pr-2 text-xs"
              aria-label="Procurar coluna"
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-px overflow-y-auto p-1.5">
          {lista.map((coluna) => {
            const indice = ordem.indexOf(coluna.campo);
            return (
              <li key={coluna.campo} className="group flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-superficie">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={visiveis.includes(coluna.campo)}
                    onChange={() => aoAlternar(coluna.campo)}
                    disabled={coluna.fixa}
                    className="h-4 w-4 rounded border-borda-forte text-marca-600"
                  />
                  <span className={cn('truncate', coluna.ocultaParaTodos && 'text-texto-fraco')}>{coluna.rotulo}</span>
                  {coluna.tipo === 'formula' && <FunctionSquare className="h-3.5 w-3.5 shrink-0 text-marca-600" />}
                  {coluna.personalizada && coluna.tipo !== 'formula' && (
                    <Selo tom="info" className="text-[9px]">
                      equipe
                    </Selo>
                  )}
                  {coluna.confidencial && (
                    <Selo tom="alerta" className="text-[9px]">
                      ADM
                    </Selo>
                  )}
                </label>
                {!coluna.fixa && !termo && (
                  <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => aoMover(coluna.campo, -1)}
                      disabled={indice <= 0}
                      className="rounded p-1 text-texto-fraco hover:bg-white hover:text-texto disabled:opacity-30"
                      aria-label={`Mover ${coluna.rotulo} para a esquerda`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => aoMover(coluna.campo, 1)}
                      disabled={indice >= ordem.length - 1}
                      className="rounded p-1 text-texto-fraco hover:bg-white hover:text-texto disabled:opacity-30"
                      aria-label={`Mover ${coluna.rotulo} para a direita`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {podePersonalizar && coluna.tipo !== 'processos' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(false);
                      aoEditarColuna(coluna);
                    }}
                    className="rounded p-1 text-texto-fraco opacity-0 transition-opacity hover:bg-white hover:text-texto group-hover:opacity-100"
                    aria-label={`Editar a coluna ${coluna.rotulo}`}
                    title={coluna.personalizada ? 'Editar a coluna' : 'Renomear ou ocultar para o time'}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {podePersonalizar && (
          <div className="border-t border-borda bg-superficie p-2">
            <Botao
              tamanho="sm"
              className="w-full justify-center"
              onClick={() => {
                setAberto(false);
                aoNovaColuna();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nova coluna (texto, lista, data ou fórmula)
            </Botao>
          </div>
        )}
      </Popover>
    </>
  );
}
