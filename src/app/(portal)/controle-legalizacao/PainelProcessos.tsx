'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import Link from 'next/link';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FunctionSquare,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

import {
  FormularioProcesso,
  camposExtrasDoRascunho,
  rascunhoDe,
  rascunhoVazio,
  type RascunhoProcesso,
} from '@/app/(portal)/controle-legalizacao/FormularioProcesso';
import { EditorColuna, type DadosColuna } from '@/components/planilha/EditorColuna';
import { MESES_EXTENSO, PaineisProcessos, type VencimentoMes } from '@/components/processos/PaineisProcessos';
import {
  Botao,
  Campo,
  Cartao,
  Combo,
  EsqueletoLinhas,
  EstadoErro,
  EstadoVazio,
  Modal,
  ModalConfirmacao,
  Selecao,
  Selo,
  cn,
  tomDoValor,
  useAvisos,
} from '@/components/ui';
import { colunaDaEquipe, type DefinicaoColuna } from '@/lib/colunas';
import { formatarCnpj } from '@/lib/normalizacao';
import { calcularFormulas, textoDaCelula, type LinhaPlanilha } from '@/lib/planilha/valores';
import {
  COLUNAS_PROCESSO,
  FUNDO_SITUACAO,
  ROTULO_SITUACAO,
  TOM_SITUACAO,
  buscarProcessos,
  camposLivres,
  colunasProcessoComoDefinicao,
  diasAtePrazo,
  periodoDoMes,
  situacaoProcesso,
  type FiltroProcessos,
} from '@/lib/processos';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { EstatisticasProcessos, Perfil, PlanilhaColuna, Processo } from '@/types/banco';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Campos que mudam o dia todo: dá para trocar direto na linha. */
const EDITAVEIS_NA_LINHA: Partial<Record<keyof Processo, string>> = {
  status: 'processo_status',
  tipo_servico: 'processo_tipo_servico',
  orgao: 'processo_orgao',
  proxima_acao: 'processo_proxima_acao',
  indicador: 'processo_indicador',
};

export function PainelProcessos({
  processosIniciais,
  estatisticasIniciais,
  vencimentosIniciais,
  anoInicial,
  opcoesIniciais,
  pessoas,
  camposIniciais,
  podeCriar,
  podeEditar,
  podeExcluir,
  podeAdicionarOpcao,
  podePersonalizar,
  empresaFiltrada,
  processoInicial,
}: {
  processosIniciais: Processo[];
  estatisticasIniciais: EstatisticasProcessos;
  vencimentosIniciais: VencimentoMes[];
  anoInicial: number;
  opcoesIniciais: Record<string, string[]>;
  pessoas: Pick<Perfil, 'id' | 'nome'>[];
  /** Campos do time para processos (planilha_colunas). */
  camposIniciais: PlanilhaColuna[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeAdicionarOpcao: boolean;
  podePersonalizar: boolean;
  /** Quando veio de um clique na planilha principal: id + nome da empresa. */
  empresaFiltrada: { id: string; nome: string } | null;
  /** `?processo=<id>` — abre direto o formulário daquele processo. */
  processoInicial: Processo | null;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [processos, setProcessos] = useState(processosIniciais);
  const [stats, setStats] = useState(estatisticasIniciais);
  const [vencimentos, setVencimentos] = useState(vencimentosIniciais);
  const [opcoes, setOpcoes] = useState(opcoesIniciais);
  const [definicoes, setDefinicoes] = useState(camposIniciais);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [recorte, setRecorte] = useState<FiltroProcessos['recorte']>(processoInicial ? 'todos' : 'abertos');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroOrgao, setFiltroOrgao] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState<number | null>(null);
  const [ordenarPor, setOrdenarPor] = useState('prazo');
  const [ascendente, setAscendente] = useState(true);

  const [rascunho, setRascunho] = useState<RascunhoProcesso | null>(processoInicial ? rascunhoDe(processoInicial) : null);
  const [extrasOriginais, setExtrasOriginais] = useState<Record<string, unknown>>(processoInicial?.campos_extras ?? {});
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<Processo | null>(null);
  const [exportando, setExportando] = useState(false);
  const [editorCampo, setEditorCampo] = useState<DefinicaoColuna | null | undefined>(undefined);

  const camposEquipe = useMemo(
    () => definicoes.filter((d) => d.personalizada && !d.oculta).map(colunaDaEquipe),
    [definicoes],
  );
  const colunasParaFormula = useMemo(() => [...colunasProcessoComoDefinicao(), ...camposEquipe], [camposEquipe]);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(timer);
  }, [busca]);

  const periodo = mes ? periodoDoMes(ano, mes) : null;

  const filtroAtual = useMemo(
    (): FiltroProcessos => ({
      busca: buscaAplicada,
      recorte,
      status: filtroStatus || undefined,
      orgao: filtroOrgao || undefined,
      tipoServico: filtroTipo || undefined,
      responsavelId: filtroResponsavel || undefined,
      empresaId: empresaFiltrada?.id,
      prazoDe: periodo?.prazoDe,
      prazoAte: periodo?.prazoAte,
      ordenarPor,
      ascendente,
    }),
    [buscaAplicada, recorte, filtroStatus, filtroOrgao, filtroTipo, filtroResponsavel, empresaFiltrada, periodo?.prazoDe, periodo?.prazoAte, ordenarPor, ascendente],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, { data: novasStats }, { data: novosVenc }] = await Promise.all([
        buscarProcessos(supabase, filtroAtual),
        supabase.rpc('processos_estatisticas'),
        supabase.rpc('processos_vencimentos_por_mes', { p_ano: ano }),
      ]);
      setProcessos(lista);
      if (novasStats) setStats(novasStats as unknown as EstatisticasProcessos);
      if (novosVenc) setVencimentos(novosVenc as VencimentoMes[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os processos.');
    } finally {
      setCarregando(false);
    }
  }, [supabase, filtroAtual, ano]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function recarregarCampos() {
    const { data } = await supabase.from('planilha_colunas').select('*').eq('tabela', 'legalizacao_processos').order('ordem');
    setDefinicoes((data ?? []) as PlanilhaColuna[]);
  }

  async function adicionarOpcao(grupo: string, valor: string) {
    const proxima = (opcoes[grupo]?.length ?? 0) + 1;
    const { error } = await supabase.from('legalizacao_opcoes').insert({ grupo, valor, ordem: proxima });
    if (error) {
      avisar('erro', `Não foi possível guardar a opção: ${error.message}`);
      return;
    }
    setOpcoes((atuais) => ({ ...atuais, [grupo]: [...(atuais[grupo] ?? []), valor] }));
    avisar('sucesso', `“${valor}” entrou na lista do time.`);
  }

  function abrirProcesso(processo: Processo) {
    setRascunho(rascunhoDe(processo));
    setExtrasOriginais(processo.campos_extras ?? {});
    setErroForm(null);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!rascunho) return;
    setErroForm(null);

    if (rascunho.empresa.trim().length < 2) {
      setErroForm('Informe a empresa — escolha da base ou digite o nome.');
      return;
    }

    setSalvando(true);
    try {
      const registro = {
        empresa_id: rascunho.empresa_id,
        empresa: rascunho.empresa.trim(),
        cnpj: rascunho.cnpj.replace(/\D/g, '') || null,
        status: rascunho.status,
        tipo_servico: rascunho.tipo_servico,
        orgao: rascunho.orgao,
        protocolo: rascunho.protocolo.trim() || null,
        data_entrada: rascunho.data_entrada,
        prazo: rascunho.prazo || null,
        responsavel_id: rascunho.responsavel_id,
        responsavel: rascunho.responsavel?.trim() || null,
        proxima_acao: rascunho.proxima_acao,
        observacoes: rascunho.observacoes.trim() || null,
        indicador: rascunho.indicador,
        campos_extras: camposExtrasDoRascunho(rascunho, rascunho.id ? extrasOriginais : {}),
      };

      const { error } = rascunho.id
        ? await supabase.from('legalizacao_processos').update(registro).eq('id', rascunho.id)
        : await supabase.from('legalizacao_processos').insert(registro);

      if (error) throw new Error(error.message);

      avisar('sucesso', rascunho.id ? 'Processo atualizado.' : 'Processo aberto — o aviso já aparece na Planilha Legalização.');
      setRascunho(null);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /** Edição rápida na própria linha. Otimista: volta atrás se o banco recusar. */
  async function alterarNaLinha(processo: Processo, mudancas: Partial<Processo>) {
    const anterior = processos;
    setProcessos((atuais) => atuais.map((p) => (p.id === processo.id ? { ...p, ...mudancas } : p)));
    const { error } = await supabase.from('legalizacao_processos').update(mudancas).eq('id', processo.id);
    if (error) {
      setProcessos(anterior);
      avisar('erro', error.message);
      return;
    }
    // Status e prazo mudam o painel e o aviso da planilha principal.
    if ('status' in mudancas || 'prazo' in mudancas || 'responsavel_id' in mudancas) void carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('legalizacao_processos').delete().eq('id', excluindo.id);
      if (error) throw new Error(error.message);
      avisar('sucesso', 'Processo removido.');
      setExcluindo(null);
      await carregar();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível remover.');
    } finally {
      setSalvando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const resposta = await fetch('/api/exportar-processos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(filtroAtual),
      });
      if (!resposta.ok) {
        const detalhe = await resposta.json().catch(() => ({ erro: 'Falha na exportação.' }));
        throw new Error(detalhe.erro ?? 'Falha na exportação.');
      }
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `controle-legalizacao-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      avisar('sucesso', 'Planilha gerada com o mesmo layout do CONTROLE_GERAL.');
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setExportando(false);
    }
  }

  async function salvarCampo(dados: DadosColuna) {
    const { error } = await supabase.from('planilha_colunas').upsert(
      {
        tabela: 'legalizacao_processos',
        campo: dados.campo,
        personalizada: true,
        rotulo: dados.rotulo,
        tipo: dados.tipo,
        formula: dados.formula,
        formato: dados.formato,
        opcoes: dados.opcoes,
        oculta: dados.oculta,
        descricao: dados.descricao,
        largura: Math.max(60, Math.min(640, dados.largura)),
        ...(dados.ordem ? { ordem: dados.ordem } : {}),
      },
      { onConflict: 'tabela,campo' },
    );
    if (error) throw new Error(error.message);
    await recarregarCampos();
    avisar('sucesso', `Campo “${dados.rotulo}” salvo para todos os processos.`);
  }

  async function excluirCampo(coluna: DefinicaoColuna) {
    if (!coluna.definicaoId) return;
    const { error } = await supabase.from('planilha_colunas').delete().eq('id', coluna.definicaoId);
    if (error) throw new Error(error.message);
    await recarregarCampos();
  }

  function ordenar(campo: string) {
    if (ordenarPor === campo) setAscendente((v) => !v);
    else {
      setOrdenarPor(campo);
      setAscendente(true);
    }
  }

  function filtrarResponsavelPorNome(nome: string) {
    if (!nome) {
      setFiltroResponsavel('');
      return;
    }
    const pessoa = pessoas.find((p) => p.nome === nome);
    if (pessoa) setFiltroResponsavel(pessoa.id);
    else setBusca(nome);
  }

  const temFormula = camposEquipe.some((c) => c.tipo === 'formula');
  const resultadosFormula = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof calcularFormulas>>();
    if (!temFormula) return mapa;
    const hoje = new Date();
    for (const p of processos) mapa.set(p.id, calcularFormulas(p as unknown as LinhaPlanilha, colunasParaFormula, hoje));
    return mapa;
  }, [processos, colunasParaFormula, temFormula]);

  const filtrosLigados = [
    filtroStatus && { rotulo: `Status: ${filtroStatus}`, limpar: () => setFiltroStatus('') },
    filtroOrgao && { rotulo: `Órgão: ${filtroOrgao}`, limpar: () => setFiltroOrgao('') },
    filtroTipo && { rotulo: `Serviço: ${filtroTipo}`, limpar: () => setFiltroTipo('') },
    filtroResponsavel && {
      rotulo: `Responsável: ${pessoas.find((p) => p.id === filtroResponsavel)?.nome ?? '—'}`,
      limpar: () => setFiltroResponsavel(''),
    },
    mes && { rotulo: `Prazo em ${MESES_EXTENSO[mes - 1]} de ${ano}`, limpar: () => setMes(null) },
    buscaAplicada && { rotulo: `“${buscaAplicada}”`, limpar: () => setBusca('') },
  ].filter(Boolean) as { rotulo: string; limpar: () => void }[];

  const nomeResponsavelFiltrado = pessoas.find((p) => p.id === filtroResponsavel)?.nome ?? '';

  return (
    <div className="space-y-4">
      <PaineisProcessos
        stats={stats}
        recorte={recorte ?? 'abertos'}
        aoRecortar={setRecorte}
        vencimentos={vencimentos}
        ano={ano}
        aoMudarAno={(novo) => {
          setAno(novo);
          setMes(null);
        }}
        mesSelecionado={mes}
        aoEscolherMes={(m) => {
          setMes(m);
          // Mês escolhido: mostra tudo que vence nele, encerrado ou não.
          if (m) setRecorte('todos');
        }}
        filtroStatus={filtroStatus}
        aoFiltrarStatus={(v) => {
          setFiltroStatus(v);
          if (v) setRecorte('todos');
        }}
        filtroOrgao={filtroOrgao}
        aoFiltrarOrgao={setFiltroOrgao}
        filtroResponsavel={nomeResponsavelFiltrado}
        aoFiltrarResponsavel={filtrarResponsavelPorNome}
      />

      {empresaFiltrada && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-800">
          <span>
            Mostrando apenas os processos de <strong>{empresaFiltrada.nome}</strong>.
          </span>
          <div className="flex gap-3">
            <Link href={`/legalizacao?empresa=${empresaFiltrada.id}`} className="inline-flex items-center gap-1 font-medium hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Ver na planilha
            </Link>
            <Link href="/controle-legalizacao" className="inline-flex items-center gap-1 font-medium hover:underline">
              Ver todos os processos
            </Link>
          </div>
        </div>
      )}

      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Campo
              type="search"
              placeholder="Empresa, CNPJ, protocolo, responsável…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              iconeInicial={<Search className="h-4 w-4" />}
              aria-label="Buscar processo"
            />
          </div>

          <div className="w-44">
            <Selecao value={recorte} onChange={(e) => setRecorte(e.target.value as FiltroProcessos['recorte'])} aria-label="Recorte">
              <option value="abertos">Em aberto</option>
              <option value="atrasados">Atrasados</option>
              <option value="atencao">Vencem em 3 dias</option>
              <option value="encerrados">Encerrados</option>
              <option value="todos">Todos</option>
            </Selecao>
          </div>

          <div className="w-44">
            <Selecao value={mes ?? ''} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)} aria-label="Mês do prazo">
              <option value="">Qualquer mês</option>
              {MESES_EXTENSO.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  Prazo em {nome}/{ano}
                </option>
              ))}
            </Selecao>
          </div>

          <div className="w-44">
            <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Tipo de serviço">
              <option value="">Todos os serviços</option>
              {(opcoes['processo_tipo_servico'] ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Selecao>
          </div>

          <div className="w-44">
            <Selecao value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </div>

          <Botao variante="secundario" tamanho="icone" onClick={() => void carregar()} aria-label="Atualizar">
            <RotateCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          </Botao>

          <Botao variante="secundario" onClick={() => void exportar()} carregando={exportando}>
            <Download className="h-4 w-4" />
            Exportar
          </Botao>

          {podePersonalizar && (
            <Botao variante="secundario" onClick={() => setEditorCampo(null)} title="Criar um campo para todos os processos">
              <Settings2 className="h-4 w-4" />
              Novo campo
            </Botao>
          )}

          {podeCriar && (
            <Botao onClick={() => setRascunho(rascunhoVazio())}>
              <Plus className="h-4 w-4" />
              Novo processo
            </Botao>
          )}
        </div>

        {filtrosLigados.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {filtrosLigados.map((f) => (
              <button
                key={f.rotulo}
                type="button"
                onClick={f.limpar}
                className="inline-flex items-center gap-1 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-800 ring-1 ring-marca-200 hover:bg-marca-100"
              >
                {f.rotulo}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setFiltroStatus('');
                setFiltroOrgao('');
                setFiltroTipo('');
                setFiltroResponsavel('');
                setMes(null);
                setBusca('');
              }}
              className="text-xs font-medium text-texto-suave hover:underline"
            >
              limpar tudo
            </button>
          </div>
        )}
      </Cartao>

      <Cartao className="overflow-hidden">
        {carregando && processos.length === 0 ? (
          <EsqueletoLinhas linhas={8} />
        ) : erro ? (
          <EstadoErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
        ) : processos.length === 0 ? (
          <EstadoVazio
            icone={<FileSpreadsheet className="h-6 w-6" />}
            titulo="Nenhum processo por aqui"
            descricao={
              filtrosLigados.length
                ? 'Ajuste a pesquisa ou troque o recorte para ver mais.'
                : 'Abra o primeiro processo: digite o nome ou o CNPJ do cliente e o resto se preenche.'
            }
            acao={
              podeCriar ? (
                <Botao tamanho="sm" onClick={() => setRascunho(rascunhoVazio())}>
                  Novo processo
                </Botao>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-auto planilha-scroll" style={{ maxHeight: 'calc(100dvh - 12rem)' }}>
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="h-10 w-28 border-b border-borda bg-superficie px-3 text-left text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Situação
                  </th>
                  {COLUNAS_PROCESSO.map((coluna) => (
                    <th
                      key={coluna.campo}
                      style={{ width: coluna.largura, minWidth: coluna.largura }}
                      title={coluna.ajuda}
                      className="h-10 border-b border-borda bg-superficie px-2 text-left"
                    >
                      <button
                        onClick={() => ordenar(coluna.campo)}
                        className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-texto-suave transition-colors hover:text-texto"
                      >
                        <span className="truncate">{coluna.rotulo}</span>
                        {ordenarPor === coluna.campo && <span className="text-marca-600">{ascendente ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  ))}
                  {camposEquipe.map((campo) => (
                    <th
                      key={campo.campo}
                      style={{ width: campo.largura, minWidth: campo.largura }}
                      title={campo.descricao ?? campo.origem}
                      className={cn('h-10 border-b border-borda bg-sky-50 px-2 text-left', campo.tipo === 'formula' && 'bg-sky-100/70')}
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                        {campo.tipo === 'formula' && <FunctionSquare className="h-3.5 w-3.5 text-marca-600" />}
                        <span className="truncate">{campo.rotulo}</span>
                        {podePersonalizar && (
                          <button
                            type="button"
                            onClick={() => setEditorCampo(campo)}
                            className="ml-auto rounded p-0.5 text-texto-fraco hover:bg-white hover:text-texto"
                            aria-label={`Editar o campo ${campo.rotulo}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="h-10 w-20 border-b border-borda bg-superficie px-3 text-left text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {processos.map((processo) => {
                  const situacao = situacaoProcesso(processo.prazo, processo.status);
                  const dias = processo.prazo ? diasAtePrazo(processo.prazo) : null;
                  const livres = camposLivres(processo);
                  const formulas = resultadosFormula.get(processo.id);

                  return (
                    <tr key={processo.id} className={cn('transition-colors hover:bg-marca-50/60', FUNDO_SITUACAO[situacao])}>
                      <td className="border-b border-borda px-3 py-2">
                        <Selo tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}</Selo>
                      </td>

                      {COLUNAS_PROCESSO.map((coluna) => {
                        const grupo = EDITAVEIS_NA_LINHA[coluna.campo];
                        return (
                          <td key={coluna.campo} className="border-b border-borda px-2 py-1.5 align-middle">
                            {grupo && podeEditar ? (
                              <Combo
                                tamanho="sm"
                                valor={(processo[coluna.campo] as string | null) ?? null}
                                opcoes={opcoes[grupo] ?? []}
                                aoMudar={(v) => {
                                  if (coluna.campo === 'status' && !v) return;
                                  void alterarNaLinha(processo, { [coluna.campo]: v } as Partial<Processo>);
                                }}
                                aoAdicionarOpcao={podeAdicionarOpcao ? (v) => adicionarOpcao(grupo, v) : undefined}
                                placeholder="definir…"
                                classeValor={coluna.campo === 'status' ? classeStatus(processo.status) : undefined}
                              />
                            ) : coluna.campo === 'prazo' && podeEditar ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={processo.prazo?.slice(0, 10) ?? ''}
                                  onChange={(e) => void alterarNaLinha(processo, { prazo: e.target.value || null })}
                                  className="h-8 rounded-lg border border-borda-forte bg-white px-2 text-xs tabular-nums hover:border-marca-300"
                                  aria-label={`Prazo de ${processo.empresa}`}
                                />
                                {dias !== null && (
                                  <span className="whitespace-nowrap text-[10px] text-texto-fraco">
                                    {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'hoje' : `${dias}d`}
                                  </span>
                                )}
                              </div>
                            ) : coluna.campo === 'responsavel' && podeEditar ? (
                              <select
                                value={processo.responsavel_id ?? ''}
                                onChange={(e) =>
                                  void alterarNaLinha(processo, {
                                    responsavel_id: e.target.value || null,
                                    responsavel: e.target.value ? pessoas.find((p) => p.id === e.target.value)?.nome ?? null : processo.responsavel,
                                  })
                                }
                                className="h-8 w-full rounded-lg border border-borda-forte bg-white px-2 text-xs hover:border-marca-300"
                                aria-label={`Responsável por ${processo.empresa}`}
                              >
                                <option value="">{processo.responsavel && !processo.responsavel_id ? processo.responsavel : '— sem responsável —'}</option>
                                {pessoas.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nome}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <CelulaProcesso processo={processo} campo={coluna.campo} dias={dias} livres={livres.length} />
                            )}
                          </td>
                        );
                      })}

                      {camposEquipe.map((campo) => (
                        <td key={campo.campo} className="border-b border-borda bg-sky-50/30 px-2 py-1.5 align-middle">
                          <span className="block truncate text-texto" title={campo.tipo === 'formula' ? formulas?.[campo.campo]?.erro?.message : undefined}>
                            {textoDaCelula(processo as unknown as LinhaPlanilha, campo, formulas) || <span className="text-texto-fraco">—</span>}
                          </span>
                        </td>
                      ))}

                      <td className="border-b border-borda px-2 py-1.5">
                        <div className="flex gap-0.5">
                          {podeEditar && (
                            <button
                              onClick={() => abrirProcesso(processo)}
                              className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-marca-100 hover:text-marca-800"
                              aria-label={`Editar processo de ${processo.empresa}`}
                              title="Abrir formulário completo"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {podeExcluir && (
                            <button
                              onClick={() => setExcluindo(processo)}
                              className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-erro-suave hover:text-erro"
                              aria-label={`Excluir processo de ${processo.empresa}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-5 py-3 text-xs text-texto-suave">
          <span className="tabular-nums">{processos.length.toLocaleString('pt-BR')} processo(s) nesta visão</span>
          <span>Linha vermelha: prazo vencido · Linha âmbar: vence em até 3 dias · Status, órgão, prazo e responsável mudam direto na linha</span>
        </div>
      </Cartao>

      <Modal
        aberto={Boolean(rascunho)}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Editar processo' : 'Novo processo'}
        descricao="Comece pela empresa: digite o nome ou o CNPJ e o portal completa o resto."
        largura="lg"
      >
        {rascunho && (
          <FormularioProcesso
            rascunho={rascunho}
            aoMudar={setRascunho}
            aoSalvar={salvar}
            aoCancelar={() => setRascunho(null)}
            opcoes={opcoes}
            pessoas={pessoas}
            podeAdicionarOpcao={podeAdicionarOpcao}
            aoAdicionarOpcao={adicionarOpcao}
            salvando={salvando}
            erro={erroForm}
            camposEquipe={camposEquipe}
            aoGerenciarCampos={podePersonalizar ? () => setEditorCampo(null) : undefined}
          />
        )}
      </Modal>

      <EditorColuna
        aberto={editorCampo !== undefined}
        aoFechar={() => setEditorCampo(undefined)}
        coluna={editorCampo ?? null}
        tabelasPermitidas={['legalizacao_processos']}
        colunas={colunasParaFormula}
        linhasExemplo={processos.slice(0, 6) as unknown as LinhaPlanilha[]}
        aoSalvar={salvarCampo}
        aoExcluir={excluirCampo}
      />

      <ModalConfirmacao
        aberto={Boolean(excluindo)}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={() => void excluir()}
        titulo="Excluir processo"
        rotuloConfirmar="Excluir"
        carregando={salvando}
        mensagem={
          <>
            O processo de <strong>{excluindo?.empresa}</strong>
            {excluindo?.tipo_servico && ` (${excluindo.tipo_servico})`} será removido do Controle
            Legalização. A exclusão fica registrada na auditoria, mas não pode ser desfeita pela
            interface.
          </>
        }
      />
    </div>
  );
}

/** Fundo do campo de status conforme o valor, como as cores da planilha. */
function classeStatus(status: string | null): string {
  const tom = tomDoValor(status);
  if (['Concluído', 'Deferido'].includes(status ?? '')) return 'bg-sucesso-suave/70 font-medium';
  if (['Indeferido', 'Cancelado'].includes(status ?? '')) return 'bg-erro-suave/70 font-medium';
  if (/exig|pend|aguard/i.test(status ?? '')) return 'bg-alerta-suave/70 font-medium';
  return tom === 'neutro' ? '' : 'font-medium';
}

function CelulaProcesso({
  processo,
  campo,
  dias,
  livres,
}: {
  processo: Processo;
  campo: keyof Processo;
  dias: number | null;
  livres: number;
}) {
  const valor = processo[campo];

  if (campo === 'empresa') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-texto">{processo.empresa}</span>
        {processo.empresa_id ? (
          <Link
            href={`/legalizacao?empresa=${processo.empresa_id}`}
            className="shrink-0 text-texto-fraco transition-colors hover:text-marca-700"
            title="Abrir o cadastro na Planilha Legalização"
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="shrink-0" title="Ainda não existe na base geral de clientes">
            <Selo className="text-[10px]">fora da base</Selo>
          </span>
        )}
        {livres > 0 && (
          <span className="shrink-0" title={`${livres} campo(s) adicional(is) neste processo`}>
            <Selo tom="info" className="text-[10px]">
              +{livres}
            </Selo>
          </span>
        )}
      </span>
    );
  }

  if (campo === 'cnpj') {
    return <span className="tabular-nums">{processo.cnpj ? formatarCnpj(processo.cnpj) : '—'}</span>;
  }

  if (campo === 'prazo') {
    if (!processo.prazo) return <span className="text-texto-fraco">—</span>;
    return (
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="tabular-nums">{formatarData(processo.prazo)}</span>
        {dias !== null && (
          <span className="text-[10px] text-texto-fraco">{dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'hoje' : `${dias}d`}</span>
        )}
      </span>
    );
  }

  if (campo === 'data_entrada') {
    return <span className="tabular-nums">{formatarData(processo.data_entrada)}</span>;
  }

  if (campo === 'ultima_atualizacao') {
    return (
      <span className="whitespace-nowrap tabular-nums text-texto-suave">
        {new Date(processo.ultima_atualizacao).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    );
  }

  if (campo === 'indicador' && processo.indicador) {
    return <Selo tom="info">{processo.indicador}</Selo>;
  }

  if (valor === null || valor === undefined || valor === '') {
    return <span className="text-texto-fraco">—</span>;
  }

  return (
    <span className="block truncate" title={String(valor)}>
      {String(valor)}
    </span>
  );
}
