'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { BookOpen, FunctionSquare, Info, Trash2 } from 'lucide-react';

import { AreaTexto, Botao, Campo, Modal, ModalConfirmacao, Selecao, Selo, cn } from '@/components/ui';
import { campoAPartirDoRotulo, colunaDaEquipe, type DefinicaoColuna } from '@/lib/colunas';
import {
  ErroFormula,
  FUNCOES_DISPONIVEIS,
  compilarFormula,
  normalizarNome,
} from '@/lib/planilha/formulas';
import { calcularFormulas, indiceDeColunas, textoDaCelula, type LinhaPlanilha } from '@/lib/planilha/valores';
import type { FormatoFormula, PlanilhaColuna, TabelaPlanilha, TipoColunaPersonalizada } from '@/types/banco';

const TIPOS: { valor: TipoColunaPersonalizada; rotulo: string; dica: string }[] = [
  { valor: 'texto', rotulo: 'Texto', dica: 'Qualquer texto curto.' },
  { valor: 'longo', rotulo: 'Texto longo', dica: 'Observações, várias linhas.' },
  { valor: 'status', rotulo: 'Lista de opções', dica: 'Escolhe de uma lista (e ainda aceita digitar outro valor).' },
  { valor: 'data', rotulo: 'Data', dica: 'dd/mm/aaaa.' },
  { valor: 'numero', rotulo: 'Número', dica: 'Quantidades, códigos numéricos.' },
  { valor: 'moeda', rotulo: 'Valor em R$', dica: 'Mostra como moeda.' },
  { valor: 'booleano', rotulo: 'Sim / Não', dica: 'Caixa de marcar.' },
];

const FORMATOS: { valor: FormatoFormula; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'status', rotulo: 'Selo colorido' },
  { valor: 'numero', rotulo: 'Número' },
  { valor: 'moeda', rotulo: 'Valor em R$' },
  { valor: 'data', rotulo: 'Data' },
  { valor: 'booleano', rotulo: 'Sim / Não' },
];

export interface DadosColuna {
  id?: string;
  tabela: TabelaPlanilha;
  campo: string;
  personalizada: boolean;
  rotulo: string;
  tipo: TipoColunaPersonalizada;
  formula: string | null;
  formato: FormatoFormula;
  opcoes: string[];
  oculta: boolean;
  descricao: string | null;
  largura: number;
  ordem: number;
}

/**
 * Criar ou editar uma coluna: tipo, lista de opções e — com o interruptor
 * "Calcular por fórmula" — uma expressão no estilo do Excel, com prévia ao
 * vivo nas primeiras linhas da planilha.
 */
export function EditorColuna({
  aberto,
  aoFechar,
  coluna,
  tabelasPermitidas,
  colunas,
  linhasExemplo,
  aoSalvar,
  aoExcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** null = coluna nova. Nativa = só renomear/ocultar para o time. */
  coluna: DefinicaoColuna | null;
  tabelasPermitidas: TabelaPlanilha[];
  /** Todas as colunas da planilha (para referência nas fórmulas). */
  colunas: DefinicaoColuna[];
  linhasExemplo: LinhaPlanilha[];
  aoSalvar: (dados: DadosColuna) => Promise<void>;
  aoExcluir: (coluna: DefinicaoColuna) => Promise<void>;
}) {
  const nativa = Boolean(coluna && !coluna.personalizada);
  const [rotulo, setRotulo] = useState('');
  const [tipo, setTipo] = useState<TipoColunaPersonalizada>('texto');
  const [usaFormula, setUsaFormula] = useState(false);
  const [formula, setFormula] = useState('');
  const [formato, setFormato] = useState<FormatoFormula>('texto');
  const [opcoes, setOpcoes] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tabela, setTabela] = useState<TabelaPlanilha>(tabelasPermitidas[0]);
  const [oculta, setOculta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [mostrarFuncoes, setMostrarFuncoes] = useState(false);
  const campoFormula = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setRotulo(coluna?.rotulo ?? '');
    setUsaFormula(coluna?.tipo === 'formula');
    setFormula(coluna?.formula ?? '');
    setFormato(coluna?.formato ?? 'texto');
    setTipo(
      coluna?.personalizada && coluna.tipo !== 'formula'
        ? (coluna.tipo as TipoColunaPersonalizada)
        : 'texto',
    );
    setOpcoes((coluna?.opcoes ?? []).join('\n'));
    setDescricao(coluna?.descricao ?? '');
    setTabela(coluna?.tabela ?? tabelasPermitidas[0]);
    setOculta(Boolean(coluna?.ocultaParaTodos));
  }, [aberto, coluna, tabelasPermitidas]);

  // Validação e prévia da fórmula a cada tecla.
  const analise = useMemo(() => {
    if (!usaFormula || !formula.trim()) return null;
    try {
      const compilada = compilarFormula(formula);
      const indice = indiceDeColunas(colunas);
      const desconhecidas = compilada.referencias.filter((r) => !indice.has(normalizarNome(r)));
      if (desconhecidas.length) {
        return { erro: `Coluna não encontrada: ${desconhecidas.map((d) => `[${d}]`).join(', ')}.` };
      }
      const provisoria = colunaDaEquipe({
        id: coluna?.definicaoId ?? 'previa',
        tabela,
        campo: coluna?.campo ?? '__previa__',
        personalizada: true,
        rotulo: rotulo || 'Nova coluna',
        tipo: 'formula',
        formula,
        formato,
        opcoes: [],
        largura: 160,
        ordem: 0,
        oculta: false,
        descricao: null,
        created_at: '',
        updated_at: '',
      } satisfies PlanilhaColuna);
      const conjunto = [...colunas.filter((c) => c.campo !== provisoria.campo), provisoria];
      const previa = linhasExemplo.slice(0, 6).map((linha) => {
        const r = calcularFormulas(linha, conjunto)[provisoria.campo];
        return {
          id: linha.id,
          nome: String(linha.razao_social ?? linha.empresa ?? ''),
          texto: textoDaCelula(linha, provisoria, { [provisoria.campo]: r }),
          erro: r?.erro?.message,
        };
      });
      return { previa };
    } catch (e) {
      return { erro: e instanceof ErroFormula ? e.message : String(e) };
    }
  }, [usaFormula, formula, formato, colunas, linhasExemplo, coluna, rotulo, tabela]);

  function inserir(texto: string) {
    const el = campoFormula.current;
    if (!el) {
      setFormula((f) => f + texto);
      return;
    }
    const inicio = el.selectionStart ?? formula.length;
    const fim = el.selectionEnd ?? formula.length;
    const novo = formula.slice(0, inicio) + texto + formula.slice(fim);
    setFormula(novo.startsWith('=') ? novo : `=${novo}`);
    requestAnimationFrame(() => {
      el.focus();
      const pos = inicio + texto.length + (novo.startsWith('=') ? 0 : 1);
      el.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    setErro(null);
    const nome = rotulo.trim();
    if (nome.length < 1 || nome.length > 80) {
      setErro('Dê um nome de até 80 caracteres para a coluna.');
      return;
    }
    if (
      colunas.some(
        (c) => c.campo !== coluna?.campo && normalizarNome(c.rotulo) === normalizarNome(nome),
      )
    ) {
      setErro('Já existe uma coluna com esse nome — as fórmulas não saberiam qual usar.');
      return;
    }
    if (usaFormula && (!formula.trim() || analise?.erro)) {
      setErro(analise?.erro ?? 'Escreva a fórmula.');
      return;
    }

    setSalvando(true);
    try {
      if (nativa && coluna) {
        await aoSalvar({
          id: coluna.definicaoId,
          tabela: coluna.confidencial ? 'legalizacao_dados_administrativos' : 'legalizacao_empresas',
          campo: coluna.campo,
          personalizada: false,
          rotulo: nome,
          tipo: 'texto',
          formula: null,
          formato: 'texto',
          opcoes: [],
          oculta,
          descricao: null,
          largura: coluna.largura,
          ordem: 0,
        });
      } else {
        const campo = coluna?.campo ?? campoAPartirDoRotulo(nome, colunas.map((c) => c.campo));
        await aoSalvar({
          id: coluna?.definicaoId,
          tabela,
          campo,
          personalizada: true,
          rotulo: nome,
          tipo: usaFormula ? 'formula' : tipo,
          formula: usaFormula ? (formula.trim().startsWith('=') ? formula.trim() : `=${formula.trim()}`) : null,
          formato: usaFormula ? formato : tipo === 'status' ? 'status' : 'texto',
          opcoes:
            !usaFormula && tipo === 'status'
              ? opcoes
                  .split(/\n|;/)
                  .map((o) => o.trim())
                  .filter(Boolean)
              : [],
          oculta,
          descricao: descricao.trim() || null,
          largura: coluna?.largura ?? (tipo === 'longo' ? 260 : 160),
          ordem: coluna ? 0 : colunas.filter((c) => c.personalizada).length + 1,
        });
      }
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a coluna.');
    } finally {
      setSalvando(false);
    }
  }

  const referencias = colunas.filter((c) => c.campo !== coluna?.campo && c.tipo !== 'processos');

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        largura="lg"
        titulo={coluna ? (nativa ? `Coluna “${coluna.rotulo}”` : 'Editar coluna') : 'Nova coluna'}
        descricao={
          nativa
            ? 'Coluna original da planilha: dá para renomear e esconder para o time. Os dados continuam guardados.'
            : 'A coluna aparece para todo o time nesta planilha. Os valores ficam guardados na própria empresa.'
        }
        rodape={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {coluna?.personalizada && (
                <Botao variante="fantasma" className="text-erro" onClick={() => setConfirmandoExclusao(true)}>
                  <Trash2 className="h-4 w-4" />
                  Excluir coluna
                </Botao>
              )}
            </div>
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao onClick={() => void salvar()} carregando={salvando}>
                {coluna ? 'Salvar coluna' : 'Criar coluna'}
              </Botao>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              rotulo="Nome da coluna"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="Ex.: Validade do alvará"
              maxLength={80}
              autoFocus
            />
            {!nativa && tabelasPermitidas.length > 1 && (
              <Selecao
                rotulo="Onde guardar"
                value={tabela}
                onChange={(e) => setTabela(e.target.value as TabelaPlanilha)}
                disabled={Boolean(coluna)}
              >
                <option value="legalizacao_empresas">Base geral (aparece também na Planilha Legalização)</option>
                <option value="legalizacao_dados_administrativos">Bloco ADM — confidencial</option>
              </Selecao>
            )}
          </div>

          {!nativa && (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borda bg-superficie p-3.5">
                <input
                  type="checkbox"
                  checked={usaFormula}
                  onChange={(e) => {
                    setUsaFormula(e.target.checked);
                    if (e.target.checked && !formula) setFormula('=');
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-texto">
                    <FunctionSquare className="h-4 w-4 text-marca-600" />
                    Calcular por fórmula
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-texto-suave">
                    Igual ao Excel: o valor de cada linha sai de uma conta com as outras colunas e se
                    atualiza sozinho. Não dá para digitar nessa coluna.
                  </span>
                </span>
              </label>

              {usaFormula ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-texto-suave">Fórmula</label>
                    <textarea
                      ref={campoFormula}
                      value={formula}
                      onChange={(e) => setFormula(e.target.value)}
                      rows={3}
                      spellCheck={false}
                      className={cn(
                        'w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm leading-relaxed',
                        analise?.erro ? 'border-erro' : 'border-borda-forte focus:border-marca-500',
                      )}
                      placeholder='=SE(DIAS([Validade AVCB]; HOJE()) < 30; "Renovar"; "OK")'
                    />
                    {analise?.erro ? (
                      <p className="mt-1.5 text-xs font-medium text-erro">{analise.erro}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-texto-fraco">
                        Use <code className="font-mono">[Nome da coluna]</code>, aspas para texto e{' '}
                        <code className="font-mono">;</code> entre os argumentos.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-texto-fraco">
                      Clique para inserir uma coluna
                    </p>
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {referencias.map((c) => (
                        <button
                          key={c.campo}
                          type="button"
                          onClick={() => inserir(`[${c.rotulo}]`)}
                          className="rounded-md border border-borda bg-white px-2 py-0.5 text-xs text-texto-suave transition-colors hover:border-marca-300 hover:text-marca-800"
                        >
                          {c.rotulo}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-borda">
                    <button
                      type="button"
                      onClick={() => setMostrarFuncoes((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-texto-suave"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Funções disponíveis {mostrarFuncoes ? '▴' : '▾'}
                    </button>
                    {mostrarFuncoes && (
                      <ul className="max-h-48 divide-y divide-borda overflow-y-auto border-t border-borda">
                        {FUNCOES_DISPONIVEIS.map((f) => (
                          <li key={f.nome} className="flex items-start justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-texto">{f.nome}</p>
                              <p className="text-[11px] text-texto-suave">{f.descricao}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => inserir(f.exemplo)}
                              className="shrink-0 rounded bg-superficie px-1.5 py-0.5 text-left font-mono text-[10px] text-marca-800 hover:bg-marca-50"
                              title="Inserir este exemplo"
                            >
                              {f.exemplo}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Selecao rotulo="Mostrar o resultado como" value={formato} onChange={(e) => setFormato(e.target.value as FormatoFormula)}>
                    {FORMATOS.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </Selecao>

                  {analise?.previa && (
                    <div className="overflow-hidden rounded-xl border border-borda">
                      <p className="bg-superficie px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">
                        Prévia nas primeiras linhas
                      </p>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-borda">
                          {analise.previa.map((p) => (
                            <tr key={p.id}>
                              <td className="max-w-[260px] truncate px-3 py-1.5 text-texto-suave">{p.nome}</td>
                              <td className={cn('px-3 py-1.5 font-medium', p.erro ? 'text-erro' : 'text-texto')} title={p.erro}>
                                {p.texto || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {TIPOS.map((t) => (
                      <label
                        key={t.valor}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
                          tipo === t.valor ? 'border-marca-400 bg-marca-50' : 'border-borda hover:border-marca-200',
                        )}
                      >
                        <input
                          type="radio"
                          name="tipo-coluna"
                          checked={tipo === t.valor}
                          onChange={() => setTipo(t.valor)}
                          className="mt-0.5 h-3.5 w-3.5 text-marca-600"
                        />
                        <span>
                          <span className="block text-sm font-medium text-texto">{t.rotulo}</span>
                          <span className="block text-[11px] text-texto-suave">{t.dica}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {tipo === 'status' && (
                    <AreaTexto
                      rotulo="Opções da lista (uma por linha)"
                      value={opcoes}
                      onChange={(e) => setOpcoes(e.target.value)}
                      rows={4}
                      placeholder={'SIM\nNÃO\nEM ANÁLISE'}
                    />
                  )}
                </div>
              )}

              <Campo
                rotulo="Descrição (aparece ao passar o mouse no cabeçalho)"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={200}
              />
            </>
          )}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-texto">
            <input
              type="checkbox"
              checked={oculta}
              onChange={(e) => setOculta(e.target.checked)}
              className="h-4 w-4 rounded border-borda-forte text-marca-600"
            />
            Começar oculta para todo o time (cada pessoa ainda pode mostrar em “Colunas”)
          </label>

          {coluna?.personalizada && (
            <p className="flex items-center gap-2 text-[11px] text-texto-fraco">
              <Info className="h-3.5 w-3.5" /> Nome técnico: <Selo className="font-mono">{coluna.campo}</Selo>
            </p>
          )}

          {erro && (
            <div role="alert" className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro">
              {erro}
            </div>
          )}
        </div>
      </Modal>

      <ModalConfirmacao
        aberto={confirmandoExclusao}
        aoFechar={() => setConfirmandoExclusao(false)}
        aoConfirmar={async () => {
          if (!coluna) return;
          setSalvando(true);
          try {
            await aoExcluir(coluna);
            setConfirmandoExclusao(false);
            aoFechar();
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
            setConfirmandoExclusao(false);
          } finally {
            setSalvando(false);
          }
        }}
        titulo="Excluir coluna"
        rotuloConfirmar="Excluir coluna"
        carregando={salvando}
        mensagem={
          <>
            A coluna <strong>{coluna?.rotulo}</strong> deixa de aparecer para todo o time. Os valores já
            digitados continuam guardados nas empresas e voltam se a coluna for recriada com o mesmo
            nome técnico.
          </>
        }
      />
    </>
  );
}
