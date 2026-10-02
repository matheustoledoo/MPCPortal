'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import Link from 'next/link';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';

import {
  FormularioProcesso,
  rascunhoDe,
  rascunhoVazio,
  type RascunhoProcesso,
} from '@/app/(portal)/controle-geral/FormularioProcesso';
import { PaineisProcessos } from '@/components/processos/PaineisProcessos';
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
  useAvisos,
} from '@/components/ui';
import { formatarCnpj } from '@/lib/normalizacao';
import {
  COLUNAS_PROCESSO,
  FUNDO_SITUACAO,
  ROTULO_SITUACAO,
  TOM_SITUACAO,
  buscarProcessos,
  diasAtePrazo,
  situacaoProcesso,
  type FiltroProcessos,
} from '@/lib/processos';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { EstatisticasProcessos, Perfil, Processo } from '@/types/banco';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function PainelProcessos({
  processosIniciais,
  estatisticasIniciais,
  opcoesIniciais,
  pessoas,
  podeCriar,
  podeEditar,
  podeExcluir,
  podeAdicionarOpcao,
  empresaFiltrada,
}: {
  processosIniciais: Processo[];
  estatisticasIniciais: EstatisticasProcessos;
  opcoesIniciais: Record<string, string[]>;
  pessoas: Pick<Perfil, 'id' | 'nome'>[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeAdicionarOpcao: boolean;
  /** Quando veio de um clique na planilha principal: id + nome da empresa. */
  empresaFiltrada: { id: string; nome: string } | null;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [processos, setProcessos] = useState(processosIniciais);
  const [stats, setStats] = useState(estatisticasIniciais);
  const [opcoes, setOpcoes] = useState(opcoesIniciais);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [recorte, setRecorte] = useState<FiltroProcessos['recorte']>('abertos');
  const [filtroOrgao, setFiltroOrgao] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [ordenarPor, setOrdenarPor] = useState('prazo');
  const [ascendente, setAscendente] = useState(true);

  const [rascunho, setRascunho] = useState<RascunhoProcesso | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<Processo | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, { data: novasStats }] = await Promise.all([
        buscarProcessos(supabase, {
          busca: buscaAplicada,
          recorte,
          orgao: filtroOrgao || undefined,
          tipoServico: filtroTipo || undefined,
          responsavelId: filtroResponsavel || undefined,
          empresaId: empresaFiltrada?.id,
          ordenarPor,
          ascendente,
        }),
        supabase.rpc('processos_estatisticas'),
      ]);
      setProcessos(lista);
      if (novasStats) setStats(novasStats as unknown as EstatisticasProcessos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os processos.');
    } finally {
      setCarregando(false);
    }
  }, [
    supabase, buscaAplicada, recorte, filtroOrgao, filtroTipo,
    filtroResponsavel, empresaFiltrada, ordenarPor, ascendente,
  ]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionarOpcao(grupo: string, valor: string) {
    const proxima = (opcoes[grupo]?.length ?? 0) + 1;
    const { error } = await supabase
      .from('legalizacao_opcoes')
      .insert({ grupo, valor, ordem: proxima });
    if (error) {
      avisar('erro', `Não foi possível guardar a opção: ${error.message}`);
      return;
    }
    setOpcoes((atuais) => ({ ...atuais, [grupo]: [...(atuais[grupo] ?? []), valor] }));
    avisar('sucesso', `“${valor}” entrou na lista do time.`);
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
      };

      const { error } = rascunho.id
        ? await supabase.from('legalizacao_processos').update(registro).eq('id', rascunho.id)
        : await supabase.from('legalizacao_processos').insert(registro);

      if (error) throw new Error(error.message);

      avisar('sucesso', rascunho.id ? 'Processo atualizado.' : 'Processo aberto.');
      setRascunho(null);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /** Edição rápida na própria linha — status e próxima ação mudam o dia todo. */
  async function alterarNaLinha(processo: Processo, campo: 'status' | 'proxima_acao', valor: string | null) {
    const anterior = processos;
    setProcessos((atuais) =>
      atuais.map((p) => (p.id === processo.id ? { ...p, [campo]: valor } : p)),
    );
    const { error } = await supabase
      .from('legalizacao_processos')
      .update({ [campo]: valor })
      .eq('id', processo.id);

    if (error) {
      setProcessos(anterior);
      avisar('erro', error.message);
      return;
    }
    // O status muda o painel e o aviso da planilha principal: recarrega.
    if (campo === 'status') void carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('legalizacao_processos')
        .delete()
        .eq('id', excluindo.id);
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
        body: JSON.stringify({
          busca: buscaAplicada,
          recorte,
          orgao: filtroOrgao || undefined,
          tipoServico: filtroTipo || undefined,
          responsavelId: filtroResponsavel || undefined,
          empresaId: empresaFiltrada?.id,
          ordenarPor,
          ascendente,
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
      link.download = `controle-geral-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  function ordenar(campo: string) {
    if (ordenarPor === campo) setAscendente((v) => !v);
    else {
      setOrdenarPor(campo);
      setAscendente(true);
    }
  }

  return (
    <div className="space-y-4">
      <PaineisProcessos stats={stats} recorte={recorte ?? 'abertos'} aoRecortar={setRecorte} />

      {empresaFiltrada && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-800">
          <span>
            Mostrando apenas os processos de <strong>{empresaFiltrada.nome}</strong>.
          </span>
          <Link
            href="/controle-geral"
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            Ver todos os processos
          </Link>
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
            <Selecao
              value={recorte}
              onChange={(e) => setRecorte(e.target.value as FiltroProcessos['recorte'])}
              aria-label="Recorte"
            >
              <option value="abertos">Em aberto</option>
              <option value="atrasados">Atrasados</option>
              <option value="atencao">Vencem em 3 dias</option>
              <option value="encerrados">Encerrados</option>
              <option value="todos">Todos</option>
            </Selecao>
          </div>

          <div className="w-44">
            <Selecao value={filtroOrgao} onChange={(e) => setFiltroOrgao(e.target.value)} aria-label="Órgão">
              <option value="">Todos os órgãos</option>
              {(opcoes['processo_orgao'] ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Selecao>
          </div>

          <div className="w-48">
            <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Tipo de serviço">
              <option value="">Todos os serviços</option>
              {(opcoes['processo_tipo_servico'] ?? []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Selecao>
          </div>

          <div className="w-44">
            <Selecao
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              aria-label="Responsável"
            >
              <option value="">Todos os responsáveis</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
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

          {podeCriar && (
            <Botao onClick={() => setRascunho(rascunhoVazio())}>
              <Plus className="h-4 w-4" />
              Novo processo
            </Botao>
          )}
        </div>
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
              buscaAplicada || filtroOrgao || filtroTipo
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
          <div className="overflow-x-auto planilha-scroll">
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
                        {ordenarPor === coluna.campo && (
                          <span className="text-marca-600">{ascendente ? '↑' : '↓'}</span>
                        )}
                      </button>
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

                  return (
                    <tr
                      key={processo.id}
                      className={cn('transition-colors hover:bg-marca-50/60', FUNDO_SITUACAO[situacao])}
                    >
                      <td className="border-b border-borda px-3 py-2">
                        <Selo tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}</Selo>
                      </td>

                      {COLUNAS_PROCESSO.map((coluna) => (
                        <td key={coluna.campo} className="border-b border-borda px-2 py-1.5 align-middle">
                          {coluna.campo === 'status' && podeEditar ? (
                            <Combo
                              valor={processo.status}
                              opcoes={opcoes['processo_status'] ?? []}
                              aoMudar={(v) => void alterarNaLinha(processo, 'status', v)}
                              aoAdicionarOpcao={
                                podeAdicionarOpcao
                                  ? (v) => adicionarOpcao('processo_status', v)
                                  : undefined
                              }
                              className="min-w-[170px]"
                            />
                          ) : coluna.campo === 'proxima_acao' && podeEditar ? (
                            <Combo
                              valor={processo.proxima_acao}
                              opcoes={opcoes['processo_proxima_acao'] ?? []}
                              aoMudar={(v) => void alterarNaLinha(processo, 'proxima_acao', v)}
                              aoAdicionarOpcao={
                                podeAdicionarOpcao
                                  ? (v) => adicionarOpcao('processo_proxima_acao', v)
                                  : undefined
                              }
                              placeholder="definir…"
                              className="min-w-[200px]"
                            />
                          ) : (
                            <CelulaProcesso processo={processo} campo={coluna.campo} dias={dias} />
                          )}
                        </td>
                      ))}

                      <td className="border-b border-borda px-2 py-1.5">
                        <div className="flex gap-0.5">
                          {podeEditar && (
                            <button
                              onClick={() => setRascunho(rascunhoDe(processo))}
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

        <div className="flex items-center justify-between border-t border-borda px-5 py-3 text-xs text-texto-suave">
          <span className="tabular-nums">
            {processos.length.toLocaleString('pt-BR')} processo(s) nesta visão
          </span>
          <span>Linha vermelha: prazo vencido · Linha âmbar: vence em até 3 dias</span>
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
          />
        )}
      </Modal>

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
            Geral. A exclusão fica registrada na auditoria, mas não pode ser desfeita pela
            interface.
          </>
        }
      />
    </div>
  );
}

function CelulaProcesso({
  processo,
  campo,
  dias,
}: {
  processo: Processo;
  campo: keyof Processo;
  dias: number | null;
}) {
  const valor = processo[campo];

  if (campo === 'empresa') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-texto">{processo.empresa}</span>
        {processo.empresa_id ? (
          <Link
            href={`/legalizacao?busca=${encodeURIComponent(processo.cnpj ?? processo.empresa)}`}
            className="shrink-0 text-texto-fraco transition-colors hover:text-marca-700"
            title="Abrir o cadastro na planilha de Legalização"
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="shrink-0" title="Ainda não existe na base geral de clientes">
            <Selo className="text-[10px]">fora da base</Selo>
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
          <span className="text-[10px] text-texto-fraco">
            {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'hoje' : `${dias}d`}
          </span>
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

  return <span className="block truncate">{String(valor)}</span>;
}
