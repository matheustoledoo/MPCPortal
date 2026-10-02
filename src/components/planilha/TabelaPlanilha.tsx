'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Lock,
  Pencil,
  SearchX,
  UserCheck,
} from 'lucide-react';

import { BarraFerramentas } from '@/components/planilha/BarraFerramentas';
import { CelulaEditavel } from '@/components/planilha/CelulaEditavel';
import { PainelEmpresa } from '@/components/planilha/PainelEmpresa';
import {
  Botao,
  EsqueletoLinhas,
  EstadoErro,
  EstadoVazio,
  ModalConfirmacao,
  Selecao,
  Selo,
  cn,
  useAvisos,
} from '@/components/ui';
import type { ResponsavelDeColuna } from '@/lib/atribuicoes';
import { colunasPara, colunasVisiveisPadrao, type DefinicaoColuna } from '@/lib/colunas';
import {
  atualizarEmMassa,
  buscarEmpresas,
  criarEmpresa,
  excluirEmpresas,
  prepararValor,
  salvarCampoAdministrativo,
  salvarCampoGeral,
  type FiltroColuna,
  type LinhaEmpresa,
} from '@/lib/empresas';
import { criarClienteNavegador } from '@/lib/supabase/client';

const OPCOES_POR_PAGINA = [25, 50, 100, 200, 500];

/** Tamanho de cada requisição ao carregar a planilha inteira. */
const LOTE_TUDO = 500;

/** Teto de segurança para o modo "todas": 50 lotes = 25 mil linhas. */
const MAX_LOTES = 50;

export function TabelaPlanilha({
  podeVerAdministrativo,
  podeEditar,
  podeExcluir,
  podeExportar = true,
  buscaInicial = '',
  colunasEditaveis = [],
  responsaveisPorColuna = {},
  /** Rótulo usado no nome do arquivo exportado. */
  contexto,
}: {
  podeVerAdministrativo: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Baixar a base inteira em Excel tem permissão própria. */
  podeExportar?: boolean;
  /** Termo já aplicado ao abrir — usado por quem chega vindo de outra tela. */
  buscaInicial?: string;
  /** Restrição pessoal de colunas. Vazio = pode editar todas as liberadas. */
  colunasEditaveis?: string[];
  /** Coluna → atribuições ativas. Visível para qualquer um que abra a tela. */
  responsaveisPorColuna?: Record<string, ResponsavelDeColuna[]>;
  contexto: 'legalizacao' | 'administrativo';
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const colunas = useMemo(() => colunasPara(podeVerAdministrativo), [podeVerAdministrativo]);

  const [linhas, setLinhas] = useState<LinhaEmpresa[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  // 'todas' carrega a planilha inteira, em lotes, como pediram: a tabela
  // cresce até o número exato de linhas da base.
  const [porPagina, setPorPagina] = useState<number | 'todas'>(50);
  const [busca, setBusca] = useState(buscaInicial);
  const [buscaAplicada, setBuscaAplicada] = useState(buscaInicial);
  const [ordenarPor, setOrdenarPor] = useState('razao_social');
  const [ascendente, setAscendente] = useState(true);
  const [filtros, setFiltros] = useState<FiltroColuna[]>([]);

  const [colunasVisiveis, setColunasVisiveis] = useState<string[]>(() =>
    colunasVisiveisPadrao(podeVerAdministrativo),
  );
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const [painelAberto, setPainelAberto] = useState(false);
  const [empresaNoPainel, setEmpresaNoPainel] = useState<LinhaEmpresa | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Debounce da busca: evita uma consulta por tecla digitada.
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const filtrosValidos = useMemo(
    () =>
      filtros.filter(
        (f) => f.valor.trim() !== '' || f.operador === 'vazio' || f.operador === 'preenchido',
      ),
    [filtros],
  );

  const chaveFiltros = JSON.stringify(filtrosValidos);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const base = {
        busca: buscaAplicada,
        ordenarPor,
        ascendente,
        filtros: JSON.parse(chaveFiltros) as FiltroColuna[],
        incluirAdministrativo: podeVerAdministrativo,
      };

      if (porPagina === 'todas') {
        // O PostgREST limita o número de linhas por resposta, então "todas"
        // é montado em lotes até completar o total informado pelo count.
        const acumulado: LinhaEmpresa[] = [];
        let totalReal = 0;

        for (let lote = 1; lote <= MAX_LOTES; lote++) {
          const parcial = await buscarEmpresas(supabase, {
            ...base,
            pagina: lote,
            porPagina: LOTE_TUDO,
          });
          acumulado.push(...parcial.linhas);
          totalReal = parcial.total;
          if (parcial.linhas.length === 0 || acumulado.length >= totalReal) break;
        }

        setLinhas(acumulado);
        setTotal(totalReal);
        return;
      }

      const resultado = await buscarEmpresas(supabase, { ...base, pagina, porPagina });
      setLinhas(resultado.linhas);
      setTotal(resultado.total);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os dados.');
    } finally {
      setCarregando(false);
    }
  }, [supabase, pagina, porPagina, buscaAplicada, ordenarPor, ascendente, chaveFiltros, podeVerAdministrativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalPaginas = porPagina === 'todas' ? 1 : Math.max(1, Math.ceil(total / porPagina));
  const colunasExibidas = colunas.filter((c) => colunasVisiveis.includes(c.campo));

  /**
   * Editabilidade por célula.
   *
   * `podeEditar` diz se a pessoa mexe na base; `colunasEditaveis` restringe a
   * quais colunas — é a "atribuição de colunas" configurada na tela de
   * usuários. Lista vazia significa sem restrição, e o banco aplica a mesma
   * regra (`minhas_colunas_editaveis`), então isto é conveniência, não defesa.
   */
  function editavelPeloUsuario(coluna: DefinicaoColuna): boolean {
    if (!podeEditar || !coluna.editavel) return false;
    if (coluna.confidencial) return podeVerAdministrativo;
    if (colunasEditaveis.length === 0) return true;
    return colunasEditaveis.includes(coluna.campo);
  }

  function motivoBloqueio(coluna: DefinicaoColuna): string | undefined {
    if (editavelPeloUsuario(coluna)) return undefined;
    if (!coluna.editavel) return 'Campo calculado pelo sistema — não é editável.';
    if (!podeEditar) return 'Você tem acesso de leitura nesta base.';
    if (colunasEditaveis.length > 0) {
      return `Fora das suas colunas. Você edita: ${colunasEditaveis
        .map((c) => colunas.find((d) => d.campo === c)?.rotulo ?? c)
        .join(', ')}.`;
    }
    return undefined;
  }

  function alternarOrdenacao(campo: string) {
    if (ordenarPor === campo) setAscendente((v) => !v);
    else {
      setOrdenarPor(campo);
      setAscendente(true);
    }
    setPagina(1);
  }

  function valorDaLinha(linha: LinhaEmpresa, coluna: DefinicaoColuna): unknown {
    if (coluna.confidencial) {
      return linha.administrativo
        ? (linha.administrativo as unknown as Record<string, unknown>)[coluna.campo]
        : null;
    }
    return (linha as unknown as Record<string, unknown>)[coluna.campo];
  }

  /** Atualização otimista: a célula já mostra o novo valor enquanto salva. */
  async function salvarCelula(linha: LinhaEmpresa, coluna: DefinicaoColuna, bruto: string) {
    const valor = prepararValor(coluna.campo, coluna.tipo, bruto);

    if (coluna.confidencial) {
      await salvarCampoAdministrativo(supabase, linha.id, coluna.campo, valor);
      setLinhas((atuais) =>
        atuais.map((l) =>
          l.id === linha.id
            ? {
                ...l,
                administrativo: {
                  ...(l.administrativo ?? ({} as never)),
                  [coluna.campo]: valor,
                } as LinhaEmpresa['administrativo'],
              }
            : l,
        ),
      );
    } else {
      await salvarCampoGeral(supabase, linha.id, coluna.campo, valor);
      setLinhas((atuais) =>
        atuais.map((l) => (l.id === linha.id ? { ...l, [coluna.campo]: valor } : l)),
      );
    }
    avisar('sucesso', `${coluna.rotulo} atualizado.`);
  }

  async function salvarPeloPainel(
    gerais: Record<string, unknown>,
    administrativos: Record<string, unknown>,
  ) {
    if (empresaNoPainel) {
      await salvarCampoGeralEmLote(empresaNoPainel.id, gerais);
      if (podeVerAdministrativo && Object.keys(administrativos).length > 0) {
        const { error } = await supabase
          .from('legalizacao_dados_administrativos')
          .upsert({ empresa_id: empresaNoPainel.id, ...administrativos }, { onConflict: 'empresa_id' });
        if (error) throw new Error(error.message);
      }
      avisar('sucesso', 'Empresa atualizada.');
    } else {
      const nova = await criarEmpresa(supabase, gerais);
      if (podeVerAdministrativo && Object.values(administrativos).some((v) => v !== null)) {
        const { error } = await supabase
          .from('legalizacao_dados_administrativos')
          .upsert({ empresa_id: nova.id, ...administrativos }, { onConflict: 'empresa_id' });
        if (error) throw new Error(error.message);
      }
      avisar('sucesso', 'Empresa cadastrada.');
    }

    setPainelAberto(false);
    setEmpresaNoPainel(null);
    await carregar();
  }

  async function salvarCampoGeralEmLote(empresaId: string, gerais: Record<string, unknown>) {
    const { error } = await supabase.from('legalizacao_empresas').update(gerais).eq('id', empresaId);
    if (error) throw new Error(error.message);
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      await excluirEmpresas(supabase, selecionados);
      avisar('sucesso', `${selecionados.length} registro(s) excluído(s).`);
      setSelecionados([]);
      setConfirmandoExclusao(false);
      await carregar();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setExcluindo(false);
    }
  }

  async function marcarSelecionadosParaRevisao(valor: boolean) {
    try {
      await atualizarEmMassa(supabase, selecionados, 'necessita_revisao', valor);
      avisar('sucesso', `${selecionados.length} registro(s) atualizados.`);
      setSelecionados([]);
      await carregar();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Falha na ação em massa.');
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const resposta = await fetch('/api/exportar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          busca: buscaAplicada,
          filtros: filtrosValidos,
          ordenarPor,
          ascendente,
          colunas: colunasVisiveis,
          contexto,
        }),
      });

      if (!resposta.ok) {
        const detalhe = await resposta.json().catch(() => ({ erro: 'Falha na exportação.' }));
        throw new Error(detalhe.erro ?? 'Falha na exportação.');
      }

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `portalmpc-${contexto}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      avisar('sucesso', 'Exportação concluída.');
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setExportando(false);
    }
  }

  const todosSelecionados = linhas.length > 0 && linhas.every((l) => selecionados.includes(l.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarraFerramentas
        busca={busca}
        aoBuscar={setBusca}
        colunas={colunas}
        colunasVisiveis={colunasVisiveis}
        aoAlternarColuna={(campo) =>
          setColunasVisiveis((atuais) =>
            atuais.includes(campo) ? atuais.filter((c) => c !== campo) : [...atuais, campo],
          )
        }
        filtros={filtros}
        aoMudarFiltros={(novos) => {
          setFiltros(novos);
          setPagina(1);
        }}
        selecionados={selecionados}
        aoExcluirSelecionados={() => setConfirmandoExclusao(true)}
        aoLimparSelecao={() => setSelecionados([])}
        aoNovaEmpresa={() => {
          setEmpresaNoPainel(null);
          setPainelAberto(true);
        }}
        aoAtualizar={() => void carregar()}
        aoExportar={() => void exportar()}
        exportando={exportando}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeExportar={podeExportar}
        total={total}
      />

      {selecionados.length > 0 && podeEditar && (
        <div className="sem-impressao flex flex-wrap items-center gap-2 border-b border-borda bg-marca-50/60 px-5 py-2 text-sm sm:px-7">
          <span className="text-texto-suave">Ações em massa:</span>
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarSelecionadosParaRevisao(true)}>
            Marcar para revisão
          </Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarSelecionadosParaRevisao(false)}>
            Remover marcação
          </Botao>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto planilha-scroll">
        {carregando && linhas.length === 0 ? (
          <EsqueletoLinhas linhas={12} />
        ) : erro ? (
          <EstadoErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
        ) : linhas.length === 0 ? (
          <EstadoVazio
            icone={buscaAplicada || filtrosValidos.length > 0 ? <SearchX className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
            titulo={
              buscaAplicada || filtrosValidos.length > 0
                ? 'Nenhuma empresa encontrada'
                : 'Nenhuma empresa cadastrada'
            }
            descricao={
              buscaAplicada || filtrosValidos.length > 0
                ? 'Ajuste a pesquisa ou remova alguns filtros para ver mais resultados.'
                : 'Cadastre a primeira empresa ou execute a importação das planilhas.'
            }
            acao={
              buscaAplicada || filtrosValidos.length > 0 ? (
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  onClick={() => {
                    setBusca('');
                    setFiltros([]);
                  }}
                >
                  Limpar filtros
                </Botao>
              ) : podeEditar ? (
                <Botao
                  tamanho="sm"
                  onClick={() => {
                    setEmpresaNoPainel(null);
                    setPainelAberto(true);
                  }}
                >
                  Nova empresa
                </Botao>
              ) : undefined
            }
          />
        ) : (
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  className="celula-fixa left-0 h-10 w-11 border-b border-r border-borda bg-superficie px-3 text-left"
                >
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={(e) =>
                      setSelecionados(
                        e.target.checked
                          ? Array.from(new Set([...selecionados, ...linhas.map((l) => l.id)]))
                          : selecionados.filter((id) => !linhas.some((l) => l.id === id)),
                      )
                    }
                    className="h-4 w-4 rounded border-borda-forte text-marca-600"
                    aria-label="Selecionar todas as linhas desta página"
                  />
                </th>

                {colunasExibidas.map((coluna, indice) => (
                  <CabecalhoColuna
                    key={coluna.campo}
                    coluna={coluna}
                    largura={larguras[coluna.campo] ?? coluna.largura}
                    aoRedimensionar={(nova) =>
                      setLarguras((atuais) => ({ ...atuais, [coluna.campo]: nova }))
                    }
                    ordenado={ordenarPor === coluna.campo}
                    ascendente={ascendente}
                    aoOrdenar={() => alternarOrdenacao(coluna.campo)}
                    responsaveis={responsaveisPorColuna[coluna.campo] ?? []}
                    somenteLeitura={podeEditar && coluna.editavel && !editavelPeloUsuario(coluna)}
                    deslocamentoFixo={coluna.fixa ? 44 + somaLarguras(colunasExibidas, larguras, indice) : undefined}
                  />
                ))}

                <th
                  scope="col"
                  className="h-10 w-14 border-b border-borda bg-superficie px-3 text-left text-xs font-semibold uppercase tracking-wide text-texto-suave"
                >
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {linhas.map((linha) => {
                const selecionada = selecionados.includes(linha.id);
                return (
                  <tr
                    key={linha.id}
                    className={cn(
                      'group transition-colors hover:bg-marca-50',
                      selecionada && 'linha-selecionada bg-marca-50',
                    )}
                  >
                    <td className="celula-fixa left-0 border-b border-r border-borda px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={(e) =>
                          setSelecionados((atuais) =>
                            e.target.checked
                              ? [...atuais, linha.id]
                              : atuais.filter((id) => id !== linha.id),
                          )
                        }
                        className="h-4 w-4 rounded border-borda-forte text-marca-600"
                        aria-label={`Selecionar ${linha.razao_social}`}
                      />
                    </td>

                    {colunasExibidas.map((coluna, indice) => (
                      <td
                        key={coluna.campo}
                        className={cn(
                          'border-b border-borda px-2 py-1.5 align-middle',
                          coluna.fixa && 'celula-fixa border-r',
                          coluna.confidencial && 'bg-amber-50/40',
                        )}
                        style={
                          coluna.fixa
                            ? { left: 44 + somaLarguras(colunasExibidas, larguras, indice) }
                            : undefined
                        }
                      >
                        {coluna.tipo === 'processos' ? (
                          <AvisoProcessos linha={linha} />
                        ) : (
                        <CelulaEditavel
                          coluna={coluna}
                          valor={valorDaLinha(linha, coluna)}
                          editavel={editavelPeloUsuario(coluna)}
                          dicaBloqueio={motivoBloqueio(coluna)}
                          aoSalvar={async (novo) => {
                            try {
                              await salvarCelula(linha, coluna, novo);
                            } catch (e) {
                              avisar('erro', e instanceof Error ? e.message : 'Falha ao salvar.');
                              throw e;
                            }
                          }}
                        />
                        )}
                      </td>
                    ))}

                    <td className="border-b border-borda px-2 py-1.5">
                      <button
                        onClick={() => {
                          setEmpresaNoPainel(linha);
                          setPainelAberto(true);
                        }}
                        className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-marca-100 hover:text-marca-800"
                        aria-label={`Abrir ${linha.razao_social}`}
                        title="Abrir formulário completo"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      <div className="sem-impressao flex flex-wrap items-center justify-between gap-3 border-t border-borda bg-superficie-elevada px-5 py-3 text-sm sm:px-7">
        <div className="flex items-center gap-2">
          <span className="text-texto-suave">Linhas por página</span>
          <div className="w-28">
            <Selecao
              value={String(porPagina)}
              onChange={(e) => {
                const escolha = e.target.value;
                setPorPagina(escolha === 'todas' ? 'todas' : Number(escolha));
                setPagina(1);
              }}
              aria-label="Linhas por página"
              className="h-8 text-xs"
            >
              {OPCOES_POR_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="todas">Todas</option>
            </Selecao>
          </div>
          {porPagina === 'todas' && (
            <span className="text-xs text-texto-fraco">
              A planilha inteira em uma só rolagem.
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {porPagina === 'todas' ? (
            <span className="tabular-nums text-texto-suave">
              {linhas.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} linhas
            </span>
          ) : (
            <>
              <span className="tabular-nums text-texto-suave">
                {total === 0 ? 0 : (pagina - 1) * porPagina + 1}–
                {Math.min(pagina * porPagina, total)} de {total.toLocaleString('pt-BR')}
              </span>
              <div className="flex gap-1">
                <Botao
                  variante="secundario"
                  tamanho="icone"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1 || carregando}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Botao>
                <span className="flex h-9 items-center px-2 text-xs tabular-nums text-texto-suave">
                  {pagina} / {totalPaginas}
                </span>
                <Botao
                  variante="secundario"
                  tamanho="icone"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas || carregando}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Botao>
              </div>
            </>
          )}
        </div>
      </div>

      <PainelEmpresa
        aberto={painelAberto}
        empresa={empresaNoPainel}
        podeVerAdministrativo={podeVerAdministrativo}
        podeEditar={podeEditar}
        colunasEditaveis={colunasEditaveis}
        aoFechar={() => {
          setPainelAberto(false);
          setEmpresaNoPainel(null);
        }}
        aoSalvar={salvarPeloPainel}
      />

      <ModalConfirmacao
        aberto={confirmandoExclusao}
        aoFechar={() => setConfirmandoExclusao(false)}
        aoConfirmar={() => void confirmarExclusao()}
        titulo="Excluir empresas"
        rotuloConfirmar={`Excluir ${selecionados.length} registro(s)`}
        carregando={excluindo}
        mensagem={
          <>
            <p>
              Você está prestes a excluir <strong>{selecionados.length}</strong> registro(s) da base de
              Legalização. Os dados administrativos vinculados também serão removidos.
            </p>
            <p className="mt-2">
              A ação fica registrada na auditoria, mas <strong>não pode ser desfeita</strong> pela
              interface.
            </p>
          </>
        }
      />
    </div>
  );
}

/**
 * Aviso de que a empresa tem processo no Controle Geral.
 *
 * Era o pedido de "quando colocar algo naquela planilha, avisar aqui". O
 * número vem do gatilho; o atraso é derivado do prazo mais próximo, para
 * que a marcação não envelheça sozinha à meia-noite.
 */
function AvisoProcessos({ linha }: { linha: LinhaEmpresa }) {
  const abertos = linha.processos_abertos ?? 0;

  if (abertos === 0) {
    return <span className="px-1 text-texto-fraco">—</span>;
  }

  const prazo = linha.processo_proximo_prazo;
  let tom: 'marca' | 'alerta' | 'erro' = 'marca';
  let detalhe = 'em andamento';

  if (prazo) {
    const [ano, mes, dia] = prazo.slice(0, 10).split('-').map(Number);
    const alvo = new Date(ano, (mes ?? 1) - 1, dia ?? 1);
    const hoje = new Date();
    const dias = Math.round(
      (alvo.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) /
        86_400_000,
    );
    if (dias < 0) {
      tom = 'erro';
      detalhe = `${Math.abs(dias)}d em atraso`;
    } else if (dias <= 3) {
      tom = 'alerta';
      detalhe = dias === 0 ? 'vence hoje' : `vence em ${dias}d`;
    } else {
      detalhe = `próximo em ${dias}d`;
    }
  }

  return (
    <Link
      href={`/controle-geral?empresa=${linha.id}`}
      title={`${abertos} processo(s) no Controle Geral — ${detalhe}. Clique para abrir.`}
      className="inline-flex items-center gap-1.5"
    >
      <Selo tom={tom}>
        <ClipboardList className="h-3 w-3" />
        {abertos}
      </Selo>
      <span className="truncate text-[10px] text-texto-fraco">{detalhe}</span>
    </Link>
  );
}

/** Deslocamento acumulado das colunas congeladas à esquerda. */
function somaLarguras(
  colunas: DefinicaoColuna[],
  larguras: Record<string, number>,
  ateIndice: number,
): number {
  return colunas
    .slice(0, ateIndice)
    .filter((c) => c.fixa)
    .reduce((total, c) => total + (larguras[c.campo] ?? c.largura), 0);
}

function CabecalhoColuna({
  coluna,
  largura,
  aoRedimensionar,
  ordenado,
  ascendente,
  aoOrdenar,
  responsaveis,
  somenteLeitura,
  deslocamentoFixo,
}: {
  coluna: DefinicaoColuna;
  largura: number;
  aoRedimensionar: (nova: number) => void;
  ordenado: boolean;
  ascendente: boolean;
  aoOrdenar: () => void;
  responsaveis: ResponsavelDeColuna[];
  somenteLeitura: boolean;
  deslocamentoFixo?: number;
}) {
  const arrastando = useRef<{ inicioX: number; larguraInicial: number } | null>(null);

  useEffect(() => {
    function mover(evento: MouseEvent) {
      if (!arrastando.current) return;
      const delta = evento.clientX - arrastando.current.inicioX;
      aoRedimensionar(Math.max(70, Math.min(640, arrastando.current.larguraInicial + delta)));
    }
    function soltar() {
      arrastando.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
    return () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
    };
  }, [aoRedimensionar]);

  const Icone = ordenado ? (ascendente ? ArrowUp : ArrowDown) : ArrowUpDown;

  // Quem cuida desta coluna é informação aberta: qualquer pessoa do time
  // precisa saber a quem recorrer, mesmo sem poder editar.
  const dicaResponsaveis = responsaveis
    .map(
      (r) =>
        `${r.responsavel}${r.souEu ? ' (você)' : ''} — ${r.titulo} · ${r.periodicidade}, ` +
        `próximo prazo ${r.proximo_prazo}`,
    )
    .join('\n');

  return (
    <th
      scope="col"
      style={{ width: largura, minWidth: largura, left: deslocamentoFixo }}
      className={cn(
        'group/col relative h-10 border-b border-borda bg-superficie px-2 text-left',
        coluna.fixa && 'celula-fixa border-r !bg-superficie',
        coluna.confidencial && 'bg-amber-100/70',
      )}
      title={coluna.origem}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={aoOrdenar}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-texto-suave transition-colors hover:text-texto"
        >
          <span className="truncate">{coluna.rotulo}</span>
          <Icone
            className={cn(
              'h-3 w-3 shrink-0 transition-opacity',
              ordenado ? 'text-marca-600 opacity-100' : 'opacity-0 group-hover/col:opacity-50',
            )}
          />
        </button>

        {responsaveis.length > 0 && (
          <span
            className={cn(
              'shrink-0 cursor-help',
              responsaveis.some((r) => r.souEu) ? 'text-marca-600' : 'text-texto-fraco',
            )}
            title={`Responsável por esta coluna:\n${dicaResponsaveis}`}
            aria-label={`Responsável: ${responsaveis.map((r) => r.responsavel).join(', ')}`}
          >
            <UserCheck className="h-3.5 w-3.5" />
          </span>
        )}

        {somenteLeitura && (
          <span
            className="shrink-0 text-texto-fraco"
            title="Fora das suas colunas — esta fica só para leitura."
          >
            <Lock className="h-3 w-3" />
          </span>
        )}

        {coluna.confidencial && (
          <span
            className="shrink-0 rounded bg-alerta-suave px-1 text-[9px] font-bold text-alerta"
            title="Campo confidencial — visível apenas para administradores"
          >
            ADM
          </span>
        )}
      </div>

      <span
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(e) => {
          e.preventDefault();
          arrastando.current = { inicioX: e.clientX, larguraInicial: largura };
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-marca-300"
      />
    </th>
  );
}
