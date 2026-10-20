'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ArrowDownAZ,
  ArrowUpAZ,
  EyeOff,
  Filter,
  FilterX,
  Pencil,
  Search,
} from 'lucide-react';

import { Popover } from '@/components/ui/Popover';
import { Botao, cn } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';
import {
  OPERADORES_CONDICAO,
  ROTULO_VAZIAS,
  type Condicao,
  type FiltroDeColuna,
} from '@/lib/planilha/filtros';

/**
 * O menu que abre na setinha do cabeçalho — o mesmo do Excel: ordenar,
 * marcar os valores que ficam, filtrar por condição e esconder a coluna.
 */
export function MenuColuna({
  coluna,
  ancora,
  aberto,
  aoFechar,
  valores,
  filtro,
  aoFiltrar,
  aoOrdenar,
  ordenacaoAtual,
  aoOcultar,
  aoEditarColuna,
}: {
  coluna: DefinicaoColuna;
  ancora: React.RefObject<HTMLElement | null>;
  aberto: boolean;
  aoFechar: () => void;
  /** Valores distintos da coluna (já considerando os outros filtros). */
  valores: { valor: string; total: number }[];
  filtro: FiltroDeColuna | undefined;
  aoFiltrar: (filtro: FiltroDeColuna | undefined) => void;
  aoOrdenar: (ascendente: boolean | null) => void;
  ordenacaoAtual: 'asc' | 'desc' | null;
  aoOcultar: () => void;
  /** Só para quem gerencia colunas. */
  aoEditarColuna?: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [condicao, setCondicao] = useState<Condicao>({ operador: 'contem', valor: '' });
  const entradaBusca = useRef<HTMLInputElement>(null);

  // Ao abrir, parte do filtro atual (ou de "tudo marcado").
  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setMarcados(new Set(filtro?.valores ?? valores.map((v) => v.valor)));
    setCondicao(filtro?.condicao ?? { operador: padraoOperador(coluna), valor: '' });
    setTimeout(() => entradaBusca.current?.focus(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () => (termo ? valores.filter((v) => (v.valor || ROTULO_VAZIAS).toLowerCase().includes(termo)) : valores),
    [valores, termo],
  );

  const todosVisiveisMarcados = visiveis.every((v) => marcados.has(v.valor));
  const operador = OPERADORES_CONDICAO.find((o) => o.valor === condicao.operador);

  function aplicar() {
    const todos = valores.every((v) => marcados.has(v.valor));
    // Com busca digitada, vale o que está marcado entre os resultados — como no Excel.
    const selecionados = termo ? visiveis.filter((v) => marcados.has(v.valor)).map((v) => v.valor) : [...marcados];
    const novaCondicao = operador?.semValor || condicao.valor.trim() ? condicao : undefined;
    const proximo: FiltroDeColuna = {
      valores: !termo && todos ? undefined : selecionados,
      condicao: novaCondicao,
    };
    aoFiltrar(proximo.valores || proximo.condicao ? proximo : undefined);
    aoFechar();
  }

  return (
    <Popover ancora={ancora} aberto={aberto} aoFechar={aoFechar} largura={300} className="text-sm">
      <div className="space-y-0.5 border-b border-borda p-1.5">
        <ItemMenu
          icone={<ArrowDownAZ className="h-4 w-4" />}
          ativo={ordenacaoAtual === 'asc'}
          onClick={() => {
            aoOrdenar(ordenacaoAtual === 'asc' ? null : true);
            aoFechar();
          }}
        >
          {rotuloOrdem(coluna, true)}
        </ItemMenu>
        <ItemMenu
          icone={<ArrowUpAZ className="h-4 w-4" />}
          ativo={ordenacaoAtual === 'desc'}
          onClick={() => {
            aoOrdenar(ordenacaoAtual === 'desc' ? null : false);
            aoFechar();
          }}
        >
          {rotuloOrdem(coluna, false)}
        </ItemMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2 border-b border-borda p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">
            <Filter className="h-3 w-3" /> Filtrar por condição
          </p>
          <select
            value={condicao.operador}
            onChange={(e) => setCondicao({ ...condicao, operador: e.target.value as Condicao['operador'] })}
            className="h-8 w-full rounded-lg border border-borda-forte bg-white px-2 text-xs"
            aria-label="Condição"
          >
            {OPERADORES_CONDICAO.map((op) => (
              <option key={op.valor} value={op.valor}>
                {op.rotulo}
              </option>
            ))}
          </select>
          {!operador?.semValor && (
            <div className={cn('grid gap-2', operador?.doisValores && 'grid-cols-2')}>
              <input
                value={condicao.valor}
                onChange={(e) => setCondicao({ ...condicao, valor: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                placeholder={dicaValor(coluna)}
                className="h-8 w-full rounded-lg border border-borda-forte bg-white px-2 text-xs"
                aria-label="Valor da condição"
              />
              {operador?.doisValores && (
                <input
                  value={condicao.valor2 ?? ''}
                  onChange={(e) => setCondicao({ ...condicao, valor2: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                  placeholder="e…"
                  className="h-8 w-full rounded-lg border border-borda-forte bg-white px-2 text-xs"
                  aria-label="Segundo valor"
                />
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Filtrar por valores</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-fraco" />
            <input
              ref={entradaBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicar()}
              placeholder="Pesquisar valores…"
              className="h-8 w-full rounded-lg border border-borda-forte bg-white pl-7 pr-2 text-xs"
              aria-label="Pesquisar valores"
            />
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              className="font-medium text-marca-700 hover:underline"
              onClick={() =>
                setMarcados((atual) => {
                  const novo = new Set(atual);
                  if (todosVisiveisMarcados) visiveis.forEach((v) => novo.delete(v.valor));
                  else visiveis.forEach((v) => novo.add(v.valor));
                  return novo;
                })
              }
            >
              {todosVisiveisMarcados ? 'Desmarcar tudo' : 'Selecionar tudo'}
            </button>
            <span className="text-texto-fraco">
              {visiveis.length} valor{visiveis.length === 1 ? '' : 'es'}
            </span>
          </div>

          <ul className="max-h-56 space-y-px overflow-y-auto rounded-lg border border-borda p-1">
            {visiveis.length === 0 && <li className="px-2 py-1.5 text-xs text-texto-fraco">Nenhum valor.</li>}
            {visiveis.slice(0, 1000).map((v) => (
              <li key={v.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-superficie">
                  <input
                    type="checkbox"
                    checked={marcados.has(v.valor)}
                    onChange={(e) =>
                      setMarcados((atual) => {
                        const novo = new Set(atual);
                        if (e.target.checked) novo.add(v.valor);
                        else novo.delete(v.valor);
                        return novo;
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-borda-forte text-marca-600"
                  />
                  <span className={cn('min-w-0 flex-1 truncate', !v.valor && 'italic text-texto-fraco')}>
                    {v.valor || ROTULO_VAZIAS}
                  </span>
                  <span className="shrink-0 tabular-nums text-texto-fraco">{v.total}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-borda bg-superficie px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              aoOcultar();
              aoFechar();
            }}
            className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-white hover:text-texto"
            title="Ocultar esta coluna (só para você)"
            aria-label="Ocultar coluna"
          >
            <EyeOff className="h-4 w-4" />
          </button>
          {aoEditarColuna && (
            <button
              type="button"
              onClick={() => {
                aoEditarColuna();
                aoFechar();
              }}
              className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-white hover:text-texto"
              title="Editar a coluna (nome, tipo, fórmula)"
              aria-label="Editar coluna"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {filtro && (
            <button
              type="button"
              onClick={() => {
                aoFiltrar(undefined);
                aoFechar();
              }}
              className="rounded-lg p-1.5 text-erro transition-colors hover:bg-erro-suave"
              title="Limpar o filtro desta coluna"
              aria-label="Limpar filtro"
            >
              <FilterX className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <Botao variante="secundario" tamanho="sm" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao tamanho="sm" onClick={aplicar} disabled={!termo && marcados.size === 0 && !condicao.valor && !operador?.semValor}>
            Aplicar
          </Botao>
        </div>
      </div>
    </Popover>
  );
}

function ItemMenu({
  icone,
  ativo,
  onClick,
  children,
}: {
  icone: React.ReactNode;
  ativo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        ativo ? 'bg-marca-50 font-medium text-marca-800' : 'text-texto hover:bg-superficie',
      )}
    >
      <span className={ativo ? 'text-marca-600' : 'text-texto-fraco'}>{icone}</span>
      {children}
    </button>
  );
}

function ehNumerica(coluna: DefinicaoColuna): boolean {
  return (
    ['numero', 'moeda', 'processos'].includes(coluna.tipo) ||
    (coluna.tipo === 'formula' && ['numero', 'moeda'].includes(coluna.formato ?? ''))
  );
}

function ehData(coluna: DefinicaoColuna): boolean {
  return coluna.tipo === 'data' || (coluna.tipo === 'formula' && coluna.formato === 'data');
}

function rotuloOrdem(coluna: DefinicaoColuna, ascendente: boolean): string {
  if (ehData(coluna)) return ascendente ? 'Mais antiga → mais recente' : 'Mais recente → mais antiga';
  if (ehNumerica(coluna)) return ascendente ? 'Menor → maior' : 'Maior → menor';
  return ascendente ? 'Classificar de A a Z' : 'Classificar de Z a A';
}

function padraoOperador(coluna: DefinicaoColuna): Condicao['operador'] {
  if (ehData(coluna) || ehNumerica(coluna)) return 'maior_igual';
  return 'contem';
}

function dicaValor(coluna: DefinicaoColuna): string {
  if (ehData(coluna)) return 'dd/mm/aaaa';
  if (ehNumerica(coluna)) return 'número';
  return 'texto…';
}
