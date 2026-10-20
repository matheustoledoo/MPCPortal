'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileSpreadsheet,
  Filter,
  FunctionSquare,
  Lock,
  PenLine,
  Pencil,
  SearchX,
  UserCheck,
  X,
} from 'lucide-react';

import { AssistenteImportacao } from '@/components/planilha/AssistenteImportacao';
import { BarraFerramentas } from '@/components/planilha/BarraFerramentas';
import { CelulaEditavel } from '@/components/planilha/CelulaEditavel';
import { DialogoOrdenacao } from '@/components/planilha/DialogoOrdenacao';
import { EditorColuna, type DadosColuna } from '@/components/planilha/EditorColuna';
import { MenuColuna } from '@/components/planilha/MenuColuna';
import { PainelColunas } from '@/components/planilha/PainelColunas';
import { PainelEmpresa, type AtalhosEmpresa } from '@/components/planilha/PainelEmpresa';
import {
  Botao,
  Campo,
  EsqueletoLinhas,
  EstadoErro,
  EstadoVazio,
  Modal,
  ModalConfirmacao,
  Selecao,
  Selo,
  cn,
  useAvisos,
} from '@/components/ui';
import type { ResponsavelDeColuna } from '@/lib/atribuicoes';
import { colunasPara, mesclarColunas, type DefinicaoColuna } from '@/lib/colunas';
import {
  atualizarEmMassa,
  carregarTodasEmpresas,
  criarEmpresa,
  excluirEmpresas,
  prepararValor,
  salvarCampoAdministrativo,
  salvarCampoExtra,
  salvarCampoGeral,
  type LinhaEmpresa,
} from '@/lib/empresas';
import {
  aplicarFiltros,
  filtroAtivo,
  ordenarLinhas,
  regraAtiva,
  valoresDistintos,
  type FiltroDeColuna,
  type NivelOrdenacao,
  type RegraFiltro,
} from '@/lib/planilha/filtros';
import {
  calcularFormulas,
  textoDaCelula,
  valorBruto,
  type LinhaPlanilha,
  type ResultadoFormula,
} from '@/lib/planilha/valores';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { PlanilhaColuna, TabelaPlanilha as NomeTabela } from '@/types/banco';

const OPCOES_POR_PAGINA = [25, 50, 100, 200, 500];
const LARGURA_SELECAO = 44;

export interface PreferenciasPlanilha {
  ordem?: string[];
  visiveis?: string[];
  larguras?: Record<string, number>;
  porPagina?: number | 'todas';
  ordenacao?: NivelOrdenacao[];
}

export interface ParametrosIniciais {
  busca?: string;
  /** Abre a planilha focada numa empresa (vindo do dashboard ou de uma notificação). */
  empresa?: string;
  /** `?f.cidade=Jundiaí` — filtros por valor já aplicados. */
  filtros?: Record<string, FiltroDeColuna>;
  /** Só empresas com documento vencido ou vencendo em 180 dias. */
  vencimentos?: boolean;
}

/** Os documentos com validade acompanhados no Dashboard. */
const CAMPOS_VALIDADE = ['avcb_clcb_validade', 'vigilancia_sanitaria_validade', 'validade_data'];

export function TabelaPlanilha({
  contexto,
  podeVerAdministrativo,
  podeEditar,
  podeCriar,
  podeExcluir,
  podeExportar = true,
  podeImportar = false,
  podePersonalizarColunas = false,
  colunasEditaveis = [],
  responsaveisPorColuna = {},
  definicoesIniciais = [],
  preferenciasIniciais = null,
  parametros = {},
  atalhos = {},
}: {
  contexto: 'legalizacao' | 'administrativo';
  podeVerAdministrativo: boolean;
  podeEditar: boolean;
  podeCriar: boolean;
  podeExcluir: boolean;
  podeExportar?: boolean;
  podeImportar?: boolean;
  podePersonalizarColunas?: boolean;
  /** Restrição pessoal de colunas. Vazio = pode editar todas as liberadas. */
  colunasEditaveis?: string[];
  /** Coluna → atribuições ativas. Visível para qualquer um que abra a tela. */
  responsaveisPorColuna?: Record<string, ResponsavelDeColuna[]>;
  definicoesIniciais?: PlanilhaColuna[];
  preferenciasIniciais?: PreferenciasPlanilha | null;
  parametros?: ParametrosIniciais;
  /** Telas ligadas à empresa que a pessoa pode abrir (atalhos no painel). */
  atalhos?: AtalhosEmpresa;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const chavePreferencias = `planilha:${contexto}`;

  /* ------------------------------ Dados -------------------------------- */

  const [linhas, setLinhas] = useState<LinhaEmpresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [definicoes, setDefinicoes] = useState<PlanilhaColuna[]>(definicoesIniciais);

  const colunas = useMemo(
    () => mesclarColunas(colunasPara(podeVerAdministrativo), definicoes),
    [podeVerAdministrativo, definicoes],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await carregarTodasEmpresas(supabase, podeVerAdministrativo));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os dados.');
    } finally {
      setCarregando(false);
    }
  }, [supabase, podeVerAdministrativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const recarregarDefinicoes = useCallback(async () => {
    const tabelas: NomeTabela[] = podeVerAdministrativo
      ? ['legalizacao_empresas', 'legalizacao_dados_administrativos']
      : ['legalizacao_empresas'];
    const { data, error } = await supabase.from('planilha_colunas').select('*').in('tabela', tabelas).order('ordem');
    if (!error) setDefinicoes((data ?? []) as PlanilhaColuna[]);
  }, [supabase, podeVerAdministrativo]);

  /* -------------------------- Preferências ----------------------------- */

  const padraoVisiveis = useMemo(() => colunas.filter((c) => c.padrao).map((c) => c.campo), [colunas]);
  const [ordemPessoal, setOrdemPessoal] = useState<string[]>(preferenciasIniciais?.ordem ?? []);
  const [visiveisPessoais, setVisiveisPessoais] = useState<string[] | null>(preferenciasIniciais?.visiveis ?? null);
  const [larguras, setLarguras] = useState<Record<string, number>>(preferenciasIniciais?.larguras ?? {});
  const [porPagina, setPorPagina] = useState<number | 'todas'>(preferenciasIniciais?.porPagina ?? 50);
  const [ordenacao, setOrdenacao] = useState<NivelOrdenacao[]>(
    preferenciasIniciais?.ordenacao?.length ? preferenciasIniciais.ordenacao : [{ campo: 'razao_social', ascendente: true }],
  );

  // Colunas novas da equipe aparecem para quem já tinha preferências salvas.
  const visiveis = useMemo(() => {
    if (!visiveisPessoais) return padraoVisiveis;
    const conhecidas = new Set([...ordemPessoal, ...visiveisPessoais]);
    const novas = colunas.filter((c) => c.personalizada && c.padrao && !conhecidas.has(c.campo)).map((c) => c.campo);
    return [...visiveisPessoais, ...novas];
  }, [visiveisPessoais, padraoVisiveis, colunas, ordemPessoal]);

  const primeiraCarga = useRef(true);
  useEffect(() => {
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void supabase.from('usuario_preferencias').upsert(
        {
          chave: chavePreferencias,
          valor: { ordem: ordemPessoal, visiveis: visiveisPessoais ?? undefined, larguras, porPagina, ordenacao },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'usuario_id,chave' },
      );
    }, 900);
    return () => clearTimeout(timer);
  }, [supabase, chavePreferencias, ordemPessoal, visiveisPessoais, larguras, porPagina, ordenacao]);

  const colunasOrdenadas = useMemo(() => {
    const fixas = colunas.filter((c) => c.fixa);
    const demais = colunas.filter((c) => !c.fixa);
    const posicao = (campo: string) => {
      const i = ordemPessoal.indexOf(campo);
      return i < 0 ? 10_000 + demais.findIndex((c) => c.campo === campo) : i;
    };
    return [...fixas, ...[...demais].sort((a, b) => posicao(a.campo) - posicao(b.campo))];
  }, [colunas, ordemPessoal]);

  const colunasExibidas = useMemo(
    () => colunasOrdenadas.filter((c) => c.fixa || visiveis.includes(c.campo)),
    [colunasOrdenadas, visiveis],
  );

  function alternarColuna(campo: string) {
    const atuais = visiveis;
    setVisiveisPessoais(atuais.includes(campo) ? atuais.filter((c) => c !== campo) : [...atuais, campo]);
  }

  function moverColuna(campo: string, direcao: -1 | 1) {
    const base = colunasOrdenadas.filter((c) => !c.fixa).map((c) => c.campo);
    const i = base.indexOf(campo);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= base.length) return;
    [base[i], base[j]] = [base[j], base[i]];
    setOrdemPessoal(base);
  }

  /* ------------------------- Filtros e busca --------------------------- */

  const [busca, setBusca] = useState(parametros.busca ?? '');
  const [buscaAplicada, setBuscaAplicada] = useState(parametros.busca ?? '');
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, FiltroDeColuna>>(parametros.filtros ?? {});
  const [regras, setRegras] = useState<RegraFiltro[]>([]);
  const [empresaFoco, setEmpresaFoco] = useState<string | null>(parametros.empresa ?? null);
  const [somenteVencimentos, setSomenteVencimentos] = useState(Boolean(parametros.vencimentos));
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [busca]);

  // Chegou filtrando por validade: as colunas de validade precisam aparecer.
  useEffect(() => {
    if (!somenteVencimentos) return;
    setVisiveisPessoais((atuais) => {
      const base = atuais ?? padraoVisiveis;
      const faltam = CAMPOS_VALIDADE.filter((c) => !base.includes(c));
      return faltam.length ? [...base, ...faltam] : atuais;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somenteVencimentos]);

  const temFormula = colunas.some((c) => c.tipo === 'formula');
  const formulas = useMemo(() => {
    const mapa = new Map<string, Record<string, ResultadoFormula>>();
    if (!temFormula) return mapa;
    const hoje = new Date();
    for (const linha of linhas) mapa.set(linha.id, calcularFormulas(linha as unknown as LinhaPlanilha, colunas, hoje));
    return mapa;
  }, [linhas, colunas, temFormula]);

  const baseFiltrada = useMemo(() => {
    let base = linhas as unknown as LinhaPlanilha[];
    if (empresaFoco) base = base.filter((l) => l.id === empresaFoco);
    if (somenteVencimentos) {
      const limite = new Date();
      limite.setDate(limite.getDate() + 180);
      const iso = limite.toISOString().slice(0, 10);
      base = base.filter((l) => CAMPOS_VALIDADE.some((c) => typeof l[c] === 'string' && (l[c] as string) <= iso));
    }
    return base;
  }, [linhas, empresaFoco, somenteVencimentos]);

  const filtradas = useMemo(
    () =>
      aplicarFiltros({
        linhas: baseFiltrada,
        colunas,
        colunasBusca: colunasExibidas,
        busca: buscaAplicada,
        filtrosColuna,
        regras,
        formulas,
      }),
    [baseFiltrada, colunas, colunasExibidas, buscaAplicada, filtrosColuna, regras, formulas],
  );

  const ordenadas = useMemo(
    () => ordenarLinhas(filtradas, ordenacao, colunas, formulas) as unknown as LinhaEmpresa[],
    [filtradas, ordenacao, colunas, formulas],
  );

  const total = ordenadas.length;
  const totalPaginas = porPagina === 'todas' ? 1 : Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveisNaPagina = useMemo(
    () => (porPagina === 'todas' ? ordenadas : ordenadas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina)),
    [ordenadas, porPagina, paginaAtual],
  );

  const filtrosAtivos =
    Object.values(filtrosColuna).filter(filtroAtivo).length +
    regras.filter(regraAtiva).length +
    (buscaAplicada.trim() ? 1 : 0) +
    (empresaFoco ? 1 : 0) +
    (somenteVencimentos ? 1 : 0);

  function limparTudo() {
    setBusca('');
    setBuscaAplicada('');
    setFiltrosColuna({});
    setRegras([]);
    setEmpresaFoco(null);
    setSomenteVencimentos(false);
    setPagina(1);
  }

  /* -------------------------- Menu da coluna --------------------------- */

  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const ancoras = useRef<Record<string, HTMLElement | null>>({});
  const ancoraMenu = useMemo(() => ({ current: menuAberto ? ancoras.current[menuAberto] ?? null : null }), [menuAberto]);

  // Como no Excel: a lista de valores considera os OUTROS filtros, não o da própria coluna.
  const valoresDoMenu = useMemo(() => {
    if (!menuAberto) return [];
    const coluna = colunas.find((c) => c.campo === menuAberto);
    if (!coluna) return [];
    const { [menuAberto]: _proprio, ...outros } = filtrosColuna;
    const base = aplicarFiltros({
      linhas: baseFiltrada,
      colunas,
      colunasBusca: colunasExibidas,
      busca: buscaAplicada,
      filtrosColuna: outros,
      regras,
      formulas,
    });
    return valoresDistintos(base, coluna, formulas);
  }, [menuAberto, colunas, filtrosColuna, baseFiltrada, colunasExibidas, buscaAplicada, regras, formulas]);

  function ordenarPor(campo: string, ascendente: boolean | null) {
    setOrdenacao(ascendente === null ? [] : [{ campo, ascendente }]);
    setPagina(1);
  }

  function alternarOrdenacaoCabecalho(campo: string) {
    const atual = ordenacao[0]?.campo === campo ? ordenacao[0] : null;
    if (!atual) ordenarPor(campo, true);
    else if (atual.ascendente) ordenarPor(campo, false);
    else ordenarPor('razao_social', true);
  }

  /* ---------------------------- Edição --------------------------------- */

  function editavelPeloUsuario(coluna: DefinicaoColuna): boolean {
    if (!podeEditar || !coluna.editavel) return false;
    if (coluna.confidencial) return podeVerAdministrativo;
    if (colunasEditaveis.length === 0) return true;
    return colunasEditaveis.includes(coluna.campo);
  }

  function motivoBloqueio(coluna: DefinicaoColuna): string | undefined {
    if (editavelPeloUsuario(coluna)) return undefined;
    if (coluna.tipo === 'formula') return 'Calculado por fórmula.';
    if (!coluna.editavel) return 'Campo calculado pelo sistema — não é editável.';
    if (!podeEditar) return 'Você tem acesso de leitura nesta base.';
    if (colunasEditaveis.length > 0) {
      return `Fora das suas colunas. Você edita: ${colunasEditaveis
        .map((c) => colunas.find((d) => d.campo === c)?.rotulo ?? c)
        .join(', ')}.`;
    }
    return undefined;
  }

  /** Atualização otimista: a célula já mostra o novo valor assim que o banco confirma. */
  async function salvarCelula(linha: LinhaEmpresa, coluna: DefinicaoColuna, bruto: string) {
    const valor = prepararValor(coluna.campo, coluna.tipo, bruto);

    if (coluna.personalizada) {
      const atuais = coluna.confidencial ? linha.administrativo?.campos_extras : linha.campos_extras;
      const novos = await salvarCampoExtra(supabase, linha.id, Boolean(coluna.confidencial), atuais, coluna.campo, valor);
      setLinhas((todas) =>
        todas.map((l) =>
          l.id !== linha.id
            ? l
            : coluna.confidencial
              ? { ...l, administrativo: { ...(l.administrativo ?? ({} as never)), campos_extras: novos } as LinhaEmpresa['administrativo'] }
              : { ...l, campos_extras: novos },
        ),
      );
    } else if (coluna.confidencial) {
      await salvarCampoAdministrativo(supabase, linha.id, coluna.campo, valor);
      setLinhas((todas) =>
        todas.map((l) =>
          l.id === linha.id
            ? {
                ...l,
                administrativo: { ...(l.administrativo ?? ({} as never)), [coluna.campo]: valor } as LinhaEmpresa['administrativo'],
              }
            : l,
        ),
      );
    } else {
      await salvarCampoGeral(supabase, linha.id, coluna.campo, valor);
      setLinhas((todas) => todas.map((l) => (l.id === linha.id ? { ...l, [coluna.campo]: valor } : l)));
    }
    avisar('sucesso', `${coluna.rotulo} atualizado.`);
  }

  const [painelAberto, setPainelAberto] = useState(false);
  const [empresaNoPainel, setEmpresaNoPainel] = useState<LinhaEmpresa | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [dialogoOrdenacao, setDialogoOrdenacao] = useState(false);
  const [importando, setImportando] = useState(false);
  const [colunaEmEdicao, setColunaEmEdicao] = useState<DefinicaoColuna | null | undefined>(undefined);
  const [mostrarFormulas, setMostrarFormulas] = useState(false);
  const [massa, setMassa] = useState<{ campo: string; valor: string } | null>(null);
  const [aplicandoMassa, setAplicandoMassa] = useState(false);

  async function salvarPeloPainel(
    gerais: Record<string, unknown>,
    administrativos: Record<string, unknown>,
  ) {
    if (empresaNoPainel) {
      const { error } = await supabase.from('legalizacao_empresas').update(gerais).eq('id', empresaNoPainel.id);
      if (error) throw new Error(error.message);
      if (podeVerAdministrativo && Object.keys(administrativos).length > 0) {
        const { error: erroAdm } = await supabase
          .from('legalizacao_dados_administrativos')
          .upsert({ empresa_id: empresaNoPainel.id, ...administrativos }, { onConflict: 'empresa_id' });
        if (erroAdm) throw new Error(erroAdm.message);
      }
      avisar('sucesso', 'Empresa atualizada.');
    } else {
      const nova = await criarEmpresa(supabase, gerais);
      if (podeVerAdministrativo && Object.values(administrativos).some((v) => v !== null && v !== undefined)) {
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

  async function aplicarEmMassa() {
    if (!massa) return;
    const coluna = colunas.find((c) => c.campo === massa.campo);
    if (!coluna) return;
    setAplicandoMassa(true);
    try {
      const valor = prepararValor(coluna.campo, coluna.tipo, massa.valor);
      if (coluna.personalizada || coluna.confidencial) {
        for (const id of selecionados) {
          const linha = linhas.find((l) => l.id === id);
          if (!linha) continue;
          if (coluna.personalizada) {
            const atuais = coluna.confidencial ? linha.administrativo?.campos_extras : linha.campos_extras;
            await salvarCampoExtra(supabase, id, Boolean(coluna.confidencial), atuais, coluna.campo, valor);
          } else {
            await salvarCampoAdministrativo(supabase, id, coluna.campo, valor);
          }
        }
      } else {
        await atualizarEmMassa(supabase, selecionados, coluna.campo, valor);
      }
      avisar('sucesso', `${coluna.rotulo} alterado em ${selecionados.length} empresa(s).`);
      setMassa(null);
      setSelecionados([]);
      await carregar();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Falha na alteração em massa.');
    } finally {
      setAplicandoMassa(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const resposta = await fetch('/api/exportar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contexto,
          ids: ordenadas.map((l) => l.id),
          colunas: colunasExibidas.map((c) => c.campo),
          resumoFiltros: descreverFiltros(),
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
      avisar('sucesso', `Exportadas ${ordenadas.length} empresa(s), do jeito que estão na tela.`);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setExportando(false);
    }
  }

  function descreverFiltros(): string {
    const partes: string[] = [];
    if (buscaAplicada.trim()) partes.push(`pesquisa "${buscaAplicada.trim()}"`);
    for (const [campo, f] of Object.entries(filtrosColuna)) {
      if (!filtroAtivo(f)) continue;
      const rotulo = colunas.find((c) => c.campo === campo)?.rotulo ?? campo;
      if (f.valores) partes.push(`${rotulo} ∈ {${f.valores.map((v) => v || '(vazias)').join(', ')}}`);
      if (f.condicao) partes.push(`${rotulo} ${f.condicao.operador} ${f.condicao.valor}`);
    }
    for (const r of regras.filter(regraAtiva)) {
      partes.push(`${colunas.find((c) => c.campo === r.campo)?.rotulo ?? r.campo} ${r.operador} ${r.valor}`);
    }
    if (somenteVencimentos) partes.push('documentos vencendo em 180 dias');
    if (empresaFoco) partes.push('uma empresa específica');
    return partes.join(' | ');
  }

  /* ------------------------ Colunas da equipe -------------------------- */

  async function salvarColuna(dados: DadosColuna) {
    const registro = {
      tabela: dados.tabela,
      campo: dados.campo,
      personalizada: dados.personalizada,
      rotulo: dados.rotulo,
      tipo: dados.tipo,
      formula: dados.formula,
      formato: dados.formato,
      opcoes: dados.opcoes,
      oculta: dados.oculta,
      descricao: dados.descricao,
      largura: Math.max(60, Math.min(640, dados.largura)),
      ...(dados.ordem ? { ordem: dados.ordem } : {}),
    };
    const { error } = await supabase.from('planilha_colunas').upsert(registro, { onConflict: 'tabela,campo' });
    if (error) throw new Error(error.message);
    await recarregarDefinicoes();
    if (!dados.id && dados.personalizada) {
      setVisiveisPessoais((atuais) => (atuais && !atuais.includes(dados.campo) ? [...atuais, dados.campo] : atuais));
    }
    avisar('sucesso', dados.id ? `Coluna “${dados.rotulo}” atualizada.` : `Coluna “${dados.rotulo}” criada.`);
  }

  async function excluirColuna(coluna: DefinicaoColuna) {
    if (!coluna.definicaoId) return;
    const { error } = await supabase.from('planilha_colunas').delete().eq('id', coluna.definicaoId);
    if (error) throw new Error(error.message);
    await recarregarDefinicoes();
    avisar('sucesso', `Coluna “${coluna.rotulo}” excluída.`);
  }

  /* ------------------------ Rolagem sincronizada ----------------------- */

  const rolagemTabela = useRef<HTMLDivElement>(null);
  const rolagemTopo = useRef<HTMLDivElement>(null);
  const [larguraConteudo, setLarguraConteudo] = useState(0);
  const sincronizando = useRef(false);

  useLayoutEffect(() => {
    const alvo = rolagemTabela.current;
    if (!alvo) return;
    const medir = () => setLarguraConteudo(alvo.scrollWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    const tabela = alvo.querySelector('table');
    if (tabela) observador.observe(tabela);
    return () => observador.disconnect();
  }, [colunasExibidas, larguras, visiveisNaPagina.length, carregando]);

  function sincronizar(origem: 'topo' | 'tabela') {
    if (sincronizando.current) {
      sincronizando.current = false;
      return;
    }
    const de = origem === 'topo' ? rolagemTopo.current : rolagemTabela.current;
    const para = origem === 'topo' ? rolagemTabela.current : rolagemTopo.current;
    if (!de || !para) return;
    sincronizando.current = true;
    para.scrollLeft = de.scrollLeft;
  }

  // Empresa em foco (vinda do dashboard/notificação): rola até a linha.
  useEffect(() => {
    if (!empresaFoco || carregando) return;
    const el = document.getElementById(`linha-${empresaFoco}`);
    el?.scrollIntoView({ block: 'center' });
  }, [empresaFoco, carregando]);

  /* ------------------------------ Tela --------------------------------- */

  const todosSelecionados =
    visiveisNaPagina.length > 0 && visiveisNaPagina.every((l) => selecionados.includes(l.id));
  const colunaMenu = colunas.find((c) => c.campo === menuAberto) ?? null;
  const colunasEditaveisMassa = colunas.filter((c) => editavelPeloUsuario(c) && c.tipo !== 'formula');
  const linhasExemplo = (ordenadas.length ? ordenadas : linhas).slice(0, 6) as unknown as LinhaPlanilha[];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarraFerramentas
        busca={busca}
        aoBuscar={setBusca}
        colunas={colunasOrdenadas.filter((c) => c.tipo !== 'processos')}
        regras={regras}
        aoMudarRegras={(novas) => {
          setRegras(novas);
          setPagina(1);
        }}
        painelColunas={
          <PainelColunas
            colunas={colunasOrdenadas}
            ordem={colunasOrdenadas.filter((c) => !c.fixa).map((c) => c.campo)}
            visiveis={colunasExibidas.map((c) => c.campo)}
            aoAlternar={alternarColuna}
            aoMover={moverColuna}
            aoMostrarTodas={() => setVisiveisPessoais(colunas.map((c) => c.campo))}
            aoRestaurar={() => {
              setVisiveisPessoais(null);
              setOrdemPessoal([]);
              setLarguras({});
            }}
            podePersonalizar={podePersonalizarColunas}
            aoNovaColuna={() => setColunaEmEdicao(null)}
            aoEditarColuna={(c) => setColunaEmEdicao(c)}
          />
        }
        selecionados={selecionados}
        aoExcluirSelecionados={() => setConfirmandoExclusao(true)}
        aoLimparSelecao={() => setSelecionados([])}
        aoNovaEmpresa={() => {
          setEmpresaNoPainel(null);
          setPainelAberto(true);
        }}
        aoAtualizar={() => {
          void carregar();
          void recarregarDefinicoes();
        }}
        atualizando={carregando}
        aoExportar={() => void exportar()}
        exportando={exportando}
        aoImportar={() => setImportando(true)}
        podeCriar={podeCriar}
        podeExcluir={podeExcluir}
        podeExportar={podeExportar}
        podeImportar={podeImportar}
      />

      {selecionados.length > 0 && podeEditar && (
        <div className="sem-impressao flex flex-wrap items-center gap-2 border-b border-borda bg-marca-50/60 px-5 py-2 text-sm sm:px-7">
          <span className="text-texto-suave">Ações em massa:</span>
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => setMassa({ campo: colunasEditaveisMassa[0]?.campo ?? 'status', valor: '' })}
          >
            <PenLine className="h-3.5 w-3.5" />
            Alterar uma coluna
          </Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarSelecionadosParaRevisao(true)}>
            Marcar para revisão
          </Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarSelecionadosParaRevisao(false)}>
            Remover marcação
          </Botao>
        </div>
      )}

      {/* Barra de navegação — no topo, junto da quantidade por página */}
      <div className="sem-impressao flex flex-wrap items-center justify-between gap-3 border-b border-borda bg-superficie px-5 py-2 text-sm sm:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-texto-suave">Mostrar</span>
          <div className="w-24">
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

          <div className="flex items-center gap-0.5">
            <BotaoPagina aoClicar={() => setPagina(1)} desabilitado={paginaAtual <= 1 || porPagina === 'todas'} rotulo="Primeira página">
              <ChevronsLeft className="h-4 w-4" />
            </BotaoPagina>
            <BotaoPagina
              aoClicar={() => setPagina((p) => Math.max(1, Math.min(p, totalPaginas) - 1))}
              desabilitado={paginaAtual <= 1 || porPagina === 'todas'}
              rotulo="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </BotaoPagina>
            <span className="px-2 text-xs tabular-nums text-texto-suave">
              {porPagina === 'todas' ? 'tudo' : `${paginaAtual} / ${totalPaginas}`}
            </span>
            <BotaoPagina
              aoClicar={() => setPagina((p) => Math.min(totalPaginas, Math.min(p, totalPaginas) + 1))}
              desabilitado={paginaAtual >= totalPaginas || porPagina === 'todas'}
              rotulo="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </BotaoPagina>
            <BotaoPagina
              aoClicar={() => setPagina(totalPaginas)}
              desabilitado={paginaAtual >= totalPaginas || porPagina === 'todas'}
              rotulo="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </BotaoPagina>
          </div>

          <span className="text-xs tabular-nums text-texto-suave">
            {total === 0
              ? 'nenhuma empresa'
              : porPagina === 'todas'
                ? `${total.toLocaleString('pt-BR')} empresa(s)`
                : `${((paginaAtual - 1) * porPagina + 1).toLocaleString('pt-BR')}–${Math.min(paginaAtual * porPagina, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
            {filtrosAtivos > 0 && ` · filtradas de ${linhas.length.toLocaleString('pt-BR')}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filtrosAtivos > 0 && (
            <Botao variante="fantasma" tamanho="sm" onClick={limparTudo} className="text-marca-700">
              <X className="h-3.5 w-3.5" />
              Limpar {filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''}
            </Botao>
          )}
          <Botao variante={ordenacao.length > 1 ? 'sutil' : 'secundario'} tamanho="sm" onClick={() => setDialogoOrdenacao(true)}>
            <ArrowDownUp className="h-3.5 w-3.5" />
            Ordenar
            {ordenacao.length > 0 && (
              <span className="text-[11px] text-texto-fraco">
                · {colunas.find((c) => c.campo === ordenacao[0].campo)?.rotulo}
                {ordenacao.length > 1 && ` +${ordenacao.length - 1}`}
              </span>
            )}
          </Botao>
          {temFormula && (
            <Botao
              variante={mostrarFormulas ? 'sutil' : 'secundario'}
              tamanho="sm"
              onClick={() => setMostrarFormulas((v) => !v)}
              title="Mostrar as fórmulas abaixo do cabeçalho"
            >
              <FunctionSquare className="h-3.5 w-3.5" />
              Fórmulas
            </Botao>
          )}
        </div>
      </div>

      {(empresaFoco || somenteVencimentos) && (
        <div className="sem-impressao flex flex-wrap items-center gap-2 border-b border-marca-200 bg-marca-50 px-5 py-2 text-sm text-marca-800 sm:px-7">
          {empresaFoco && (
            <span className="inline-flex items-center gap-1.5">
              Mostrando só <strong>{linhas.find((l) => l.id === empresaFoco)?.razao_social ?? 'a empresa escolhida'}</strong>
              <button type="button" onClick={() => setEmpresaFoco(null)} className="font-medium underline">
                ver todas
              </button>
            </span>
          )}
          {somenteVencimentos && (
            <span className="inline-flex items-center gap-1.5">
              Documentos vencidos ou vencendo em até 180 dias
              <button type="button" onClick={() => setSomenteVencimentos(false)} className="font-medium underline">
                remover
              </button>
            </span>
          )}
        </div>
      )}

      {/* Barra de rolagem lateral também em cima */}
      <div
        ref={rolagemTopo}
        onScroll={() => sincronizar('topo')}
        className="sem-impressao overflow-x-auto overflow-y-hidden border-b border-borda bg-superficie-elevada"
        style={{ height: 14 }}
        aria-hidden
      >
        <div style={{ width: larguraConteudo, height: 1 }} />
      </div>

      {/* Altura limitada à janela: o cabeçalho fica preso no topo e as duas
          barras de rolagem (a de cima e a de baixo) ficam sempre à vista. */}
      <div
        ref={rolagemTabela}
        onScroll={() => sincronizar('tabela')}
        className="min-h-0 flex-1 overflow-auto planilha-scroll"
        style={{ maxHeight: 'calc(100dvh - 14rem)', minHeight: 360 }}
      >
        {carregando && linhas.length === 0 ? (
          <EsqueletoLinhas linhas={12} />
        ) : erro ? (
          <EstadoErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
        ) : total === 0 ? (
          <EstadoVazio
            icone={filtrosAtivos > 0 ? <SearchX className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
            titulo={filtrosAtivos > 0 ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
            descricao={
              filtrosAtivos > 0
                ? 'Ajuste a pesquisa ou remova alguns filtros para ver mais resultados.'
                : 'Cadastre a primeira empresa ou importe uma planilha.'
            }
            acao={
              filtrosAtivos > 0 ? (
                <Botao variante="secundario" tamanho="sm" onClick={limparTudo}>
                  Limpar filtros
                </Botao>
              ) : podeImportar ? (
                <Botao tamanho="sm" onClick={() => setImportando(true)}>
                  Importar planilha
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
                  className="celula-fixa left-0 h-10 border-b border-r border-borda bg-superficie px-3 text-left"
                  style={{ width: LARGURA_SELECAO, minWidth: LARGURA_SELECAO }}
                >
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={(e) =>
                      setSelecionados(
                        e.target.checked
                          ? Array.from(new Set([...selecionados, ...visiveisNaPagina.map((l) => l.id)]))
                          : selecionados.filter((id) => !visiveisNaPagina.some((l) => l.id === id)),
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
                    aoRedimensionar={(nova) => setLarguras((atuais) => ({ ...atuais, [coluna.campo]: nova }))}
                    ordenacao={
                      ordenacao[0]?.campo === coluna.campo ? (ordenacao[0].ascendente ? 'asc' : 'desc') : null
                    }
                    nivelOrdenacao={ordenacao.findIndex((n) => n.campo === coluna.campo)}
                    aoOrdenar={() => alternarOrdenacaoCabecalho(coluna.campo)}
                    filtrada={filtroAtivo(filtrosColuna[coluna.campo])}
                    aoAbrirMenu={(el) => {
                      ancoras.current[coluna.campo] = el;
                      setMenuAberto((atual) => (atual === coluna.campo ? null : coluna.campo));
                    }}
                    responsaveis={responsaveisPorColuna[coluna.campo] ?? []}
                    somenteLeitura={podeEditar && coluna.editavel && !editavelPeloUsuario(coluna)}
                    deslocamentoFixo={
                      coluna.fixa ? LARGURA_SELECAO + somaLarguras(colunasExibidas, larguras, indice) : undefined
                    }
                    mostrarFormula={mostrarFormulas}
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
              {visiveisNaPagina.map((linha) => {
                const selecionada = selecionados.includes(linha.id);
                const resultados = formulas.get(linha.id);
                return (
                  <tr
                    key={linha.id}
                    id={`linha-${linha.id}`}
                    className={cn(
                      'group transition-colors hover:bg-marca-50',
                      selecionada && 'linha-selecionada bg-marca-50',
                      empresaFoco === linha.id && 'bg-amber-50',
                    )}
                  >
                    <td className="celula-fixa left-0 border-b border-r border-borda px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={(e) =>
                          setSelecionados((atuais) =>
                            e.target.checked ? [...atuais, linha.id] : atuais.filter((id) => id !== linha.id),
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
                          coluna.tipo === 'formula' && 'bg-sky-50/40',
                        )}
                        style={
                          coluna.fixa
                            ? {
                                left: LARGURA_SELECAO + somaLarguras(colunasExibidas, larguras, indice),
                                maxWidth: larguras[coluna.campo] ?? coluna.largura,
                              }
                            : { maxWidth: larguras[coluna.campo] ?? coluna.largura }
                        }
                      >
                        {coluna.tipo === 'processos' ? (
                          <AvisoProcessos linha={linha} />
                        ) : (
                          <div className="flex min-w-0 items-center gap-1">
                            {coluna.campo === 'razao_social' && <AlertaProcessos linha={linha} />}
                            <div className="min-w-0 flex-1">
                              <CelulaEditavel
                                coluna={coluna}
                                valor={valorBruto(linha as unknown as LinhaPlanilha, coluna)}
                                editavel={editavelPeloUsuario(coluna)}
                                dicaBloqueio={motivoBloqueio(coluna)}
                                textoFormula={
                                  coluna.tipo === 'formula'
                                    ? textoDaCelula(linha as unknown as LinhaPlanilha, coluna, resultados)
                                    : undefined
                                }
                                erroFormula={resultados?.[coluna.campo]?.erro?.message}
                                aoSalvar={async (novo) => {
                                  try {
                                    await salvarCelula(linha, coluna, novo);
                                  } catch (e) {
                                    avisar('erro', e instanceof Error ? e.message : 'Falha ao salvar.');
                                    throw e;
                                  }
                                }}
                              />
                            </div>
                          </div>
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

      {colunaMenu && (
        <MenuColuna
          coluna={colunaMenu}
          ancora={ancoraMenu}
          aberto={Boolean(menuAberto)}
          aoFechar={() => setMenuAberto(null)}
          valores={valoresDoMenu}
          filtro={filtrosColuna[colunaMenu.campo]}
          aoFiltrar={(f) => {
            setFiltrosColuna((atuais) => {
              const { [colunaMenu.campo]: _anterior, ...resto } = atuais;
              return f ? { ...resto, [colunaMenu.campo]: f } : resto;
            });
            setPagina(1);
          }}
          ordenacaoAtual={
            ordenacao[0]?.campo === colunaMenu.campo ? (ordenacao[0].ascendente ? 'asc' : 'desc') : null
          }
          aoOrdenar={(asc) => ordenarPor(colunaMenu.campo, asc)}
          aoOcultar={() => !colunaMenu.fixa && alternarColuna(colunaMenu.campo)}
          aoEditarColuna={
            podePersonalizarColunas && colunaMenu.tipo !== 'processos' ? () => setColunaEmEdicao(colunaMenu) : undefined
          }
        />
      )}

      <PainelEmpresa
        aberto={painelAberto}
        empresa={empresaNoPainel}
        podeVerAdministrativo={podeVerAdministrativo}
        podeEditar={empresaNoPainel ? podeEditar : podeCriar}
        colunasEditaveis={colunasEditaveis}
        colunasEquipe={colunas.filter((c) => c.personalizada)}
        resultadosFormula={empresaNoPainel ? formulas.get(empresaNoPainel.id) : undefined}
        atalhos={atalhos}
        aoFechar={() => {
          setPainelAberto(false);
          setEmpresaNoPainel(null);
        }}
        aoSalvar={salvarPeloPainel}
      />

      <DialogoOrdenacao
        aberto={dialogoOrdenacao}
        aoFechar={() => setDialogoOrdenacao(false)}
        colunas={colunasOrdenadas}
        niveis={ordenacao}
        aoAplicar={(niveis) => {
          setOrdenacao(niveis);
          setPagina(1);
        }}
      />

      <EditorColuna
        aberto={colunaEmEdicao !== undefined}
        aoFechar={() => setColunaEmEdicao(undefined)}
        coluna={colunaEmEdicao ?? null}
        tabelasPermitidas={
          podeVerAdministrativo && contexto === 'administrativo'
            ? ['legalizacao_empresas', 'legalizacao_dados_administrativos']
            : ['legalizacao_empresas']
        }
        colunas={colunas}
        linhasExemplo={linhasExemplo}
        aoSalvar={salvarColuna}
        aoExcluir={excluirColuna}
      />

      <AssistenteImportacao
        aberto={importando}
        aoFechar={() => setImportando(false)}
        supabase={supabase}
        colunas={colunas}
        existentes={linhas}
        podeVerAdministrativo={podeVerAdministrativo}
        podeCriarEmpresas={podeCriar}
        podeAtualizar={podeEditar}
        podeCriarColunas={podePersonalizarColunas}
        podeEditarColuna={editavelPeloUsuario}
        aoConcluir={async () => {
          await recarregarDefinicoes();
          await carregar();
        }}
      />

      <Modal
        aberto={Boolean(massa)}
        aoFechar={() => setMassa(null)}
        titulo={`Alterar ${selecionados.length} empresa(s) de uma vez`}
        descricao="O mesmo valor vai para a coluna escolhida em todas as linhas selecionadas. Fica tudo na auditoria."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setMassa(null)} disabled={aplicandoMassa}>
              Cancelar
            </Botao>
            <Botao onClick={() => void aplicarEmMassa()} carregando={aplicandoMassa}>
              Aplicar
            </Botao>
          </>
        }
      >
        {massa && (
          <div className="space-y-3">
            <Selecao rotulo="Coluna" value={massa.campo} onChange={(e) => setMassa({ campo: e.target.value, valor: '' })}>
              {colunasEditaveisMassa.map((c) => (
                <option key={c.campo} value={c.campo}>
                  {c.rotulo}
                  {c.confidencial ? ' (ADM)' : ''}
                </option>
              ))}
            </Selecao>
            {(() => {
              const coluna = colunas.find((c) => c.campo === massa.campo);
              if (coluna?.tipo === 'booleano') {
                return (
                  <Selecao rotulo="Valor" value={massa.valor} onChange={(e) => setMassa({ ...massa, valor: e.target.value })}>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </Selecao>
                );
              }
              return (
                <>
                  <Campo
                    rotulo="Novo valor"
                    value={massa.valor}
                    list="opcoes-massa"
                    onChange={(e) => setMassa({ ...massa, valor: e.target.value })}
                    placeholder={coluna?.tipo === 'data' ? 'dd/mm/aaaa' : 'deixe vazio para apagar'}
                  />
                  {coluna?.opcoes && (
                    <datalist id="opcoes-massa">
                      {coluna.opcoes.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </Modal>

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

function BotaoPagina({
  aoClicar,
  desabilitado,
  rotulo,
  children,
}: {
  aoClicar: () => void;
  desabilitado: boolean;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-label={rotulo}
      title={rotulo}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda-forte bg-white text-texto-suave transition-colors hover:border-marca-300 hover:text-texto disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function diasAte(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(ano, (mes ?? 1) - 1, dia ?? 1);
  const hoje = new Date();
  return Math.round((alvo.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86_400_000);
}

/**
 * Sinal ao lado do nome: "tem coisa desta empresa no Controle Legalização".
 * Vermelho com prazo vencido, âmbar vencendo em até 3 dias. Um clique leva
 * direto aos processos dela.
 */
function AlertaProcessos({ linha }: { linha: LinhaEmpresa }) {
  const abertos = linha.processos_abertos ?? 0;
  if (abertos === 0) return null;
  const dias = linha.processo_proximo_prazo ? diasAte(linha.processo_proximo_prazo) : null;
  const tom = dias === null ? 'marca' : dias < 0 ? 'erro' : dias <= 3 ? 'alerta' : 'marca';
  const cores = {
    erro: 'bg-erro text-white ring-red-300',
    alerta: 'bg-alerta text-white ring-amber-300',
    marca: 'bg-marca-600 text-white ring-marca-300',
  };
  const detalhe =
    dias === null ? 'sem prazo' : dias < 0 ? `${Math.abs(dias)}d em atraso` : dias === 0 ? 'vence hoje' : `próximo prazo em ${dias}d`;
  return (
    <Link
      href={`/controle-legalizacao?empresa=${linha.id}`}
      title={`${abertos} processo(s) no Controle Legalização — ${detalhe}. Clique para abrir.`}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold ring-2 transition-transform hover:scale-110',
        cores[tom],
        tom === 'erro' && 'animate-pulse',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {tom === 'marca' ? <ClipboardList className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {abertos}
    </Link>
  );
}

/** A coluna "Processos": o mesmo aviso, com o texto do prazo. */
function AvisoProcessos({ linha }: { linha: LinhaEmpresa }) {
  const abertos = linha.processos_abertos ?? 0;
  if (abertos === 0) return <span className="px-1 text-texto-fraco">—</span>;

  const dias = linha.processo_proximo_prazo ? diasAte(linha.processo_proximo_prazo) : null;
  let tom: 'marca' | 'alerta' | 'erro' = 'marca';
  let detalhe = 'em andamento';
  if (dias !== null) {
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
      href={`/controle-legalizacao?empresa=${linha.id}`}
      title={`${abertos} processo(s) no Controle Legalização — ${detalhe}. Clique para abrir.`}
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
function somaLarguras(colunas: DefinicaoColuna[], larguras: Record<string, number>, ateIndice: number): number {
  return colunas
    .slice(0, ateIndice)
    .filter((c) => c.fixa)
    .reduce((total, c) => total + (larguras[c.campo] ?? c.largura), 0);
}

function CabecalhoColuna({
  coluna,
  largura,
  aoRedimensionar,
  ordenacao,
  nivelOrdenacao,
  aoOrdenar,
  filtrada,
  aoAbrirMenu,
  responsaveis,
  somenteLeitura,
  deslocamentoFixo,
  mostrarFormula,
}: {
  coluna: DefinicaoColuna;
  largura: number;
  aoRedimensionar: (nova: number) => void;
  ordenacao: 'asc' | 'desc' | null;
  /** Posição na ordenação de vários níveis (-1 = não participa). */
  nivelOrdenacao: number;
  aoOrdenar: () => void;
  filtrada: boolean;
  aoAbrirMenu: (el: HTMLElement) => void;
  responsaveis: ResponsavelDeColuna[];
  somenteLeitura: boolean;
  deslocamentoFixo?: number;
  mostrarFormula: boolean;
}) {
  const arrastando = useRef<{ inicioX: number; larguraInicial: number } | null>(null);
  const botaoFiltro = useRef<HTMLButtonElement>(null);

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

  // Quem cuida desta coluna é informação aberta: qualquer pessoa do time
  // precisa saber a quem recorrer, mesmo sem poder editar.
  const dicaResponsaveis = responsaveis
    .map((r) => `${r.responsavel}${r.souEu ? ' (você)' : ''} — ${r.titulo} · ${r.periodicidade}, próximo prazo ${r.proximo_prazo}`)
    .join('\n');

  return (
    <th
      scope="col"
      style={{ width: largura, minWidth: largura, maxWidth: largura, left: deslocamentoFixo }}
      className={cn(
        'group/col relative border-b border-borda bg-superficie px-2 text-left align-middle',
        mostrarFormula && coluna.tipo === 'formula' ? 'h-14' : 'h-10',
        coluna.fixa && 'celula-fixa border-r !bg-superficie',
        coluna.confidencial && 'bg-amber-100/70',
        coluna.tipo === 'formula' && 'bg-sky-50',
        filtrada && '!bg-marca-50',
      )}
      title={coluna.descricao ?? coluna.origem}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={aoOrdenar}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-texto-suave transition-colors hover:text-texto"
          title="Clique para ordenar"
        >
          {coluna.tipo === 'formula' && <FunctionSquare className="h-3.5 w-3.5 shrink-0 text-marca-600" />}
          <span className="truncate">{coluna.rotulo}</span>
          {ordenacao ? (
            ordenacao === 'asc' ? (
              <ArrowUp className="h-3 w-3 shrink-0 text-marca-600" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0 text-marca-600" />
            )
          ) : nivelOrdenacao > 0 ? (
            <span className="shrink-0 rounded bg-marca-100 px-1 text-[9px] text-marca-800">{nivelOrdenacao + 1}º</span>
          ) : null}
        </button>

        {responsaveis.length > 0 && (
          <span
            className={cn('shrink-0 cursor-help', responsaveis.some((r) => r.souEu) ? 'text-marca-600' : 'text-texto-fraco')}
            title={`Responsável por esta coluna:\n${dicaResponsaveis}`}
            aria-label={`Responsável: ${responsaveis.map((r) => r.responsavel).join(', ')}`}
          >
            <UserCheck className="h-3.5 w-3.5" />
          </span>
        )}

        {somenteLeitura && (
          <span className="shrink-0 text-texto-fraco" title="Fora das suas colunas — esta fica só para leitura.">
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

        <button
          ref={botaoFiltro}
          type="button"
          onClick={() => botaoFiltro.current && aoAbrirMenu(botaoFiltro.current)}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors',
            filtrada
              ? 'border-marca-400 bg-marca-600 text-white'
              : 'border-borda-forte bg-white text-texto-fraco hover:border-marca-300 hover:text-marca-700',
          )}
          aria-label={`Filtrar e ordenar ${coluna.rotulo}`}
          title={filtrada ? 'Filtro aplicado — clique para mudar' : 'Filtrar / ordenar (como no Excel)'}
        >
          {filtrada ? <Filter className="h-3 w-3" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {mostrarFormula && coluna.tipo === 'formula' && (
        <p className="mt-1 truncate font-mono text-[10px] normal-case text-marca-800" title={coluna.formula ?? ''}>
          {coluna.formula}
        </p>
      )}

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
