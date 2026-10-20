'use client';

import { useState, type ReactNode } from 'react';

import { Download, Filter, Plus, RotateCw, Search, Trash2, Upload, X } from 'lucide-react';

import { Botao, Campo, Selecao, cn } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';
import { OPERADORES_CONDICAO, regraAtiva, type RegraFiltro } from '@/lib/planilha/filtros';

/**
 * Barra de cima da planilha: pesquisa, filtros combinados, colunas,
 * importação e exportação. Os filtros de cada coluna moram no cabeçalho.
 */
export function BarraFerramentas({
  busca,
  aoBuscar,
  colunas,
  regras,
  aoMudarRegras,
  painelColunas,
  selecionados,
  aoExcluirSelecionados,
  aoLimparSelecao,
  aoNovaEmpresa,
  aoAtualizar,
  atualizando,
  aoExportar,
  exportando,
  aoImportar,
  podeCriar,
  podeExcluir,
  podeExportar,
  podeImportar,
}: {
  busca: string;
  aoBuscar: (valor: string) => void;
  colunas: DefinicaoColuna[];
  regras: RegraFiltro[];
  aoMudarRegras: (regras: RegraFiltro[]) => void;
  /** O botão "Colunas" já montado (fica junto dos outros). */
  painelColunas: ReactNode;
  selecionados: string[];
  aoExcluirSelecionados: () => void;
  aoLimparSelecao: () => void;
  aoNovaEmpresa: () => void;
  aoAtualizar: () => void;
  atualizando: boolean;
  aoExportar: () => void;
  exportando: boolean;
  aoImportar: () => void;
  podeCriar: boolean;
  podeExcluir: boolean;
  podeExportar: boolean;
  podeImportar: boolean;
}) {
  const [painelFiltros, setPainelFiltros] = useState(false);
  const ativas = regras.filter(regraAtiva).length;

  function adicionarRegra() {
    const primeira = colunas[0];
    aoMudarRegras([...regras, { campo: primeira.campo, operador: 'contem', valor: '' }]);
  }

  function atualizarRegra(indice: number, mudancas: Partial<RegraFiltro>) {
    aoMudarRegras(regras.map((regra, i) => (i === indice ? { ...regra, ...mudancas } : regra)));
  }

  return (
    <div className="sem-impressao space-y-3 border-b border-borda bg-superficie-elevada px-5 py-3.5 sm:px-7">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Campo
            type="search"
            placeholder="Pesquisar em todas as colunas: razão social, CNPJ, cidade, sócio…"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            iconeInicial={<Search className="h-4 w-4" />}
            aria-label="Pesquisa geral"
          />
        </div>

        <Botao variante={painelFiltros || ativas > 0 ? 'sutil' : 'secundario'} onClick={() => setPainelFiltros((v) => !v)}>
          <Filter className="h-4 w-4" />
          Filtros
          {ativas > 0 && (
            <span className="ml-0.5 rounded-full bg-marca-600 px-1.5 text-[11px] font-semibold text-white">{ativas}</span>
          )}
        </Botao>

        {painelColunas}

        <Botao variante="secundario" onClick={aoAtualizar} tamanho="icone" aria-label="Recarregar dados" title="Recarregar">
          <RotateCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
        </Botao>

        {podeImportar && (
          <Botao variante="secundario" onClick={aoImportar}>
            <Upload className="h-4 w-4" />
            Importar
          </Botao>
        )}

        {podeExportar && (
          <Botao variante="secundario" onClick={aoExportar} carregando={exportando}>
            <Download className="h-4 w-4" />
            Exportar
          </Botao>
        )}

        {podeCriar && (
          <Botao onClick={aoNovaEmpresa}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </Botao>
        )}
      </div>

      {painelFiltros && (
        <div className="animar-surgir space-y-2 rounded-xl border border-borda bg-superficie p-3">
          {regras.length === 0 && (
            <p className="px-1 py-2 text-sm text-texto-suave">
              Nenhuma regra. Combine quantas precisar — todas valem juntas, somadas aos filtros dos
              cabeçalhos das colunas.
            </p>
          )}

          {regras.map((regra, indice) => {
            const op = OPERADORES_CONDICAO.find((o) => o.valor === regra.operador);
            return (
              <div key={indice} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Selecao value={regra.campo} onChange={(e) => atualizarRegra(indice, { campo: e.target.value })} aria-label="Coluna do filtro">
                    {colunas.map((coluna) => (
                      <option key={coluna.campo} value={coluna.campo}>
                        {coluna.rotulo}
                        {coluna.confidencial ? ' (ADM)' : ''}
                      </option>
                    ))}
                  </Selecao>
                </div>

                <div className="w-48">
                  <Selecao
                    value={regra.operador}
                    onChange={(e) => atualizarRegra(indice, { operador: e.target.value as RegraFiltro['operador'] })}
                    aria-label="Operador"
                  >
                    {OPERADORES_CONDICAO.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </Selecao>
                </div>

                {!op?.semValor && (
                  <div className="min-w-[160px] flex-1">
                    <Campo
                      value={regra.valor}
                      onChange={(e) => atualizarRegra(indice, { valor: e.target.value })}
                      placeholder="valor…"
                      aria-label="Valor do filtro"
                    />
                  </div>
                )}
                {op?.doisValores && (
                  <div className="min-w-[140px] flex-1">
                    <Campo
                      value={regra.valor2 ?? ''}
                      onChange={(e) => atualizarRegra(indice, { valor2: e.target.value })}
                      placeholder="e…"
                      aria-label="Segundo valor"
                    />
                  </div>
                )}

                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  onClick={() => aoMudarRegras(regras.filter((_, i) => i !== indice))}
                  aria-label="Remover regra"
                >
                  <X className="h-4 w-4" />
                </Botao>
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <Botao variante="secundario" tamanho="sm" onClick={adicionarRegra}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar regra
            </Botao>
            {regras.length > 0 && (
              <Botao variante="fantasma" tamanho="sm" onClick={() => aoMudarRegras([])}>
                Limpar regras
              </Botao>
            )}
          </div>
        </div>
      )}

      {selecionados.length > 0 && (
        <div className="animar-surgir flex flex-wrap items-center gap-2 rounded-lg border border-marca-200 bg-marca-50 px-3 py-1.5">
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
  );
}
