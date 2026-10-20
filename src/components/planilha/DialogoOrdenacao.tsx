'use client';

import { useEffect, useState } from 'react';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { Botao, Modal, Selecao } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';
import type { NivelOrdenacao } from '@/lib/planilha/filtros';

/**
 * "Classificar" do Excel: vários níveis — por exemplo cidade, depois status,
 * depois razão social. Cada nível desempata o anterior.
 */
export function DialogoOrdenacao({
  aberto,
  aoFechar,
  colunas,
  niveis,
  aoAplicar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  colunas: DefinicaoColuna[];
  niveis: NivelOrdenacao[];
  aoAplicar: (niveis: NivelOrdenacao[]) => void;
}) {
  const [rascunho, setRascunho] = useState<NivelOrdenacao[]>(niveis);

  useEffect(() => {
    if (aberto) setRascunho(niveis.length ? niveis : [{ campo: colunas[0]?.campo ?? 'razao_social', ascendente: true }]);
  }, [aberto, niveis, colunas]);

  function mover(indice: number, direcao: -1 | 1) {
    setRascunho((atual) => {
      const novo = [...atual];
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= novo.length) return atual;
      [novo[indice], novo[alvo]] = [novo[alvo], novo[indice]];
      return novo;
    });
  }

  const disponiveis = (atual: string) =>
    colunas.filter((c) => c.campo === atual || !rascunho.some((n) => n.campo === c.campo));

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Ordenar a planilha"
      descricao="Como o “Classificar” do Excel: o segundo nível desempata o primeiro, e assim por diante."
      rodape={
        <>
          <Botao
            variante="fantasma"
            onClick={() => {
              aoAplicar([]);
              aoFechar();
            }}
          >
            Remover ordenação
          </Botao>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={() => {
              aoAplicar(rascunho);
              aoFechar();
            }}
          >
            Aplicar
          </Botao>
        </>
      }
    >
      <ol className="space-y-2">
        {rascunho.map((nivel, indice) => (
          <li key={indice} className="flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-superficie p-2.5">
            <span className="w-24 shrink-0 text-xs font-semibold text-texto-suave">
              {indice === 0 ? 'Ordenar por' : 'E depois por'}
            </span>
            <div className="min-w-[180px] flex-1">
              <Selecao
                value={nivel.campo}
                onChange={(e) =>
                  setRascunho((atual) => atual.map((n, i) => (i === indice ? { ...n, campo: e.target.value } : n)))
                }
                aria-label="Coluna"
                className="h-9"
              >
                {disponiveis(nivel.campo).map((c) => (
                  <option key={c.campo} value={c.campo}>
                    {c.rotulo}
                  </option>
                ))}
              </Selecao>
            </div>
            <div className="w-40">
              <Selecao
                value={nivel.ascendente ? 'asc' : 'desc'}
                onChange={(e) =>
                  setRascunho((atual) =>
                    atual.map((n, i) => (i === indice ? { ...n, ascendente: e.target.value === 'asc' } : n)),
                  )
                }
                aria-label="Direção"
                className="h-9"
              >
                <option value="asc">Crescente (A→Z)</option>
                <option value="desc">Decrescente (Z→A)</option>
              </Selecao>
            </div>
            <div className="flex gap-0.5">
              <Botao variante="fantasma" tamanho="icone" onClick={() => mover(indice, -1)} disabled={indice === 0} aria-label="Subir nível">
                <ArrowUp className="h-4 w-4" />
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="icone"
                onClick={() => mover(indice, 1)}
                disabled={indice === rascunho.length - 1}
                aria-label="Descer nível"
              >
                <ArrowDown className="h-4 w-4" />
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="icone"
                onClick={() => setRascunho((atual) => atual.filter((_, i) => i !== indice))}
                aria-label="Remover nível"
              >
                <Trash2 className="h-4 w-4" />
              </Botao>
            </div>
          </li>
        ))}
      </ol>
      {rascunho.length < Math.min(6, colunas.length) && (
        <Botao
          variante="secundario"
          tamanho="sm"
          className="mt-3"
          onClick={() => {
            const livre = colunas.find((c) => !rascunho.some((n) => n.campo === c.campo));
            if (livre) setRascunho((atual) => [...atual, { campo: livre.campo, ascendente: true }]);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar nível
        </Botao>
      )}
    </Modal>
  );
}
