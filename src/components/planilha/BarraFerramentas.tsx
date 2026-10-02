'use client';

import { useState } from 'react';

import {
  Columns3,
  Download,
  Filter,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { Botao, Campo, Selecao, Selo, cn } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';
import type { FiltroColuna } from '@/lib/empresas';

const OPERADORES: { valor: FiltroColuna['operador']; rotulo: string }[] = [
  { valor: 'contem', rotulo: 'contém' },
  { valor: 'igual', rotulo: 'é igual a' },
  { valor: 'preenchido', rotulo: 'está preenchido' },
  { valor: 'vazio', rotulo: 'está vazio' },
  { valor: 'maior', rotulo: 'maior ou igual a' },
  { valor: 'menor', rotulo: 'menor ou igual a' },
];

export function BarraFerramentas({
  busca,
  aoBuscar,
  colunas,
  colunasVisiveis,
  aoAlternarColuna,
  filtros,
  aoMudarFiltros,
  selecionados,
  aoExcluirSelecionados,
  aoLimparSelecao,
  aoNovaEmpresa,
  aoAtualizar,
  aoExportar,
  exportando,
  podeEditar,
  podeExcluir,
  podeExportar,
  total,
}: {
  busca: string;
  aoBuscar: (valor: string) => void;
  colunas: DefinicaoColuna[];
  colunasVisiveis: string[];
  aoAlternarColuna: (campo: string) => void;
  filtros: FiltroColuna[];
  aoMudarFiltros: (filtros: FiltroColuna[]) => void;
  selecionados: string[];
  aoExcluirSelecionados: () => void;
  aoLimparSelecao: () => void;
  aoNovaEmpresa: () => void;
  aoAtualizar: () => void;
  aoExportar: () => void;
  exportando: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeExportar: boolean;
  total: number;
}) {
  const [painelColunas, setPainelColunas] = useState(false);
  const [painelFiltros, setPainelFiltros] = useState(false);

  function adicionarFiltro() {
    const primeira = colunas[0];
    aoMudarFiltros([
      ...filtros,
      { campo: primeira.campo, operador: 'contem', valor: '', confidencial: primeira.confidencial },
    ]);
  }

  function atualizarFiltro(indice: number, mudancas: Partial<FiltroColuna>) {
    aoMudarFiltros(
      filtros.map((filtro, i) => {
        if (i !== indice) return filtro;
        const atualizado = { ...filtro, ...mudancas };
        if (mudancas.campo) {
          atualizado.confidencial = colunas.find((c) => c.campo === mudancas.campo)?.confidencial;
        }
        return atualizado;
      }),
    );
  }

  const filtrosAtivos = filtros.filter(
    (f) => f.valor.trim() !== '' || f.operador === 'vazio' || f.operador === 'preenchido',
  ).length;

  return (
    <div className="sem-impressao space-y-3 border-b border-borda bg-superficie-elevada px-5 py-3.5 sm:px-7">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Campo
            type="search"
            placeholder="Buscar por razão social, CNPJ, cidade, sócio…"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            iconeInicial={<Search className="h-4 w-4" />}
            aria-label="Pesquisa global"
          />
        </div>

        <Botao
          variante={painelFiltros || filtrosAtivos > 0 ? 'sutil' : 'secundario'}
          onClick={() => setPainelFiltros((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {filtrosAtivos > 0 && (
            <span className="ml-0.5 rounded-full bg-marca-600 px-1.5 text-[11px] font-semibold text-white">
              {filtrosAtivos}
            </span>
          )}
        </Botao>

        <div className="relative">
          <Botao
            variante={painelColunas ? 'sutil' : 'secundario'}
            onClick={() => setPainelColunas((v) => !v)}
          >
            <Columns3 className="h-4 w-4" />
            Colunas
          </Botao>

          {painelColunas && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPainelColunas(false)} aria-hidden />
              <div className="animar-surgir absolute right-0 top-full z-20 mt-1.5 max-h-96 w-72 overflow-y-auto rounded-xl border border-borda bg-superficie-elevada p-2 shadow-xl">
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-texto-fraco">
                  Colunas visíveis ({colunasVisiveis.length}/{colunas.length})
                </p>
                {colunas.map((coluna) => (
                  <label
                    key={coluna.campo}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-superficie"
                  >
                    <input
                      type="checkbox"
                      checked={colunasVisiveis.includes(coluna.campo)}
                      onChange={() => aoAlternarColuna(coluna.campo)}
                      className="h-4 w-4 rounded border-borda-forte text-marca-600"
                    />
                    <span className="flex-1 truncate text-texto">{coluna.rotulo}</span>
                    {coluna.confidencial && <Selo tom="alerta" className="text-[10px]">ADM</Selo>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <Botao variante="secundario" onClick={aoAtualizar} tamanho="icone" aria-label="Atualizar dados">
          <RotateCw className="h-4 w-4" />
        </Botao>

        {podeExportar && (
          <Botao variante="secundario" onClick={aoExportar} carregando={exportando}>
            <Download className="h-4 w-4" />
            Exportar
          </Botao>
        )}

        {podeEditar && (
          <Botao onClick={aoNovaEmpresa}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </Botao>
        )}
      </div>

      {painelFiltros && (
        <div className="animar-surgir space-y-2 rounded-xl border border-borda bg-superficie p-3">
          {filtros.length === 0 && (
            <p className="px-1 py-2 text-sm text-texto-suave">
              Nenhum filtro. Combine quantos precisar — todos são aplicados juntos.
            </p>
          )}

          {filtros.map((filtro, indice) => {
            const semValor = filtro.operador === 'vazio' || filtro.operador === 'preenchido';
            return (
              <div key={indice} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Selecao
                    value={filtro.campo}
                    onChange={(e) => atualizarFiltro(indice, { campo: e.target.value })}
                    aria-label="Coluna do filtro"
                  >
                    {colunas.map((coluna) => (
                      <option key={coluna.campo} value={coluna.campo}>
                        {coluna.rotulo}
                        {coluna.confidencial ? ' (ADM)' : ''}
                      </option>
                    ))}
                  </Selecao>
                </div>

                <div className="w-44">
                  <Selecao
                    value={filtro.operador}
                    onChange={(e) =>
                      atualizarFiltro(indice, { operador: e.target.value as FiltroColuna['operador'] })
                    }
                    aria-label="Operador"
                  >
                    {OPERADORES.map((op) => (
                      <option key={op.valor} value={op.valor}>
                        {op.rotulo}
                      </option>
                    ))}
                  </Selecao>
                </div>

                {!semValor && (
                  <div className="min-w-[160px] flex-1">
                    <Campo
                      value={filtro.valor}
                      onChange={(e) => atualizarFiltro(indice, { valor: e.target.value })}
                      placeholder="valor…"
                      aria-label="Valor do filtro"
                    />
                  </div>
                )}

                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  onClick={() => aoMudarFiltros(filtros.filter((_, i) => i !== indice))}
                  aria-label="Remover filtro"
                >
                  <X className="h-4 w-4" />
                </Botao>
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <Botao variante="secundario" tamanho="sm" onClick={adicionarFiltro}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar filtro
            </Botao>
            {filtros.length > 0 && (
              <Botao variante="fantasma" tamanho="sm" onClick={() => aoMudarFiltros([])}>
                Limpar tudo
              </Botao>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-texto-suave">
          <strong className="tabular-nums text-texto">{total.toLocaleString('pt-BR')}</strong>{' '}
          {total === 1 ? 'empresa' : 'empresas'}
          {(busca || filtrosAtivos > 0) && ' após filtros'}
        </p>

        {selecionados.length > 0 && (
          <div
            className={cn(
              'animar-surgir flex flex-wrap items-center gap-2 rounded-lg border border-marca-200 bg-marca-50 px-3 py-1.5',
            )}
          >
            <span className="text-sm font-medium text-marca-800">
              {selecionados.length} selecionada{selecionados.length > 1 ? 's' : ''}
            </span>
            {podeExcluir && (
              <Botao variante="perigo" tamanho="sm" onClick={aoExcluirSelecionados}>
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Botao>
            )}
            <Botao variante="fantasma" tamanho="sm" onClick={aoLimparSelecao}>
              Limpar seleção
            </Botao>
          </div>
        )}
      </div>
    </div>
  );
}
