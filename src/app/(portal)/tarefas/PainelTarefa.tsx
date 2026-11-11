'use client';

import { useCallback, useEffect, useState } from 'react';

import { CalendarDays, CheckSquare, History, Lock, MessageSquare, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';

import { BotaoAnexar, ListaAnexos } from '@/components/arquivos/Anexos';
import { AvatarPessoa, SeletorPessoas } from '@/components/equipe/Pessoas';
import { AreaTexto, Botao, Campo, Carregando, Modal, ModalConfirmacao, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { CampoOpcoes } from '@/components/ui/CampoOpcoes';
import { apagarArquivo } from '@/lib/arquivos';
import { tempoRelativo } from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { CAMPOS_TAREFA, COLUNAS_TAREFA, PRIORIDADES, podeEditarTarefa, tarefaEncerrada } from '@/lib/tarefas';
import type {
  AnexoArquivo,
  AnexoTarefa,
  ComentarioTarefa,
  HistoricoTarefa,
  ItemChecklistTarefa,
  PessoaEquipe,
  StatusTarefa,
  Tarefa,
} from '@/types/banco';

const novoId = () => Math.random().toString(36).slice(2, 10);

type Rascunho = Pick<
  Tarefa,
  'titulo' | 'descricao' | 'tipo' | 'status' | 'prioridade' | 'categoria' | 'vencimento' | 'hora' | 'responsaveis' | 'privada' | 'empresa' | 'checklist'
>;

/**
 * Cartão da tarefa. Em tarefa existente cada campo salva ao mudar (sem botão
 * "Salvar"); o banco registra o histórico, atualiza o calendário e avisa os
 * responsáveis. Em tarefa nova, nada é gravado até "Criar tarefa".
 */
export function PainelTarefa({
  tarefaId,
  statusInicial,
  ordemInicial,
  meuId,
  meuNome,
  gerencia,
  podeOpcoes,
  pessoas,
  aoFechar,
  aoCriar,
  aoMudar,
}: {
  tarefaId: string | null;
  statusInicial: StatusTarefa;
  ordemInicial: number;
  meuId: string;
  meuNome: string;
  gerencia: boolean;
  podeOpcoes: boolean;
  pessoas: PessoaEquipe[];
  aoFechar: () => void;
  aoCriar: (id: string) => void;
  aoMudar: () => void;
}) {
  const { avisar } = useAvisos();
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>({
    titulo: '',
    descricao: '',
    tipo: 'tarefa',
    status: statusInicial,
    prioridade: 'normal',
    categoria: null,
    vencimento: null,
    hora: null,
    responsaveis: [meuId],
    privada: false,
    empresa: null,
    checklist: [],
  });
  const [comentarios, setComentarios] = useState<ComentarioTarefa[]>([]);
  const [anexos, setAnexos] = useState<AnexoTarefa[]>([]);
  const [historico, setHistorico] = useState<HistoricoTarefa[]>([]);
  const [carregando, setCarregando] = useState(Boolean(tarefaId));
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoComentario, setNovoComentario] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [excluir, setExcluir] = useState(false);
  const [aba, setAba] = useState<'comentarios' | 'historico'>('comentarios');

  const carregar = useCallback(async () => {
    if (!tarefaId) return;
    const supabase = criarClienteNavegador();
    const [{ data: t }, { data: c }, { data: a }, { data: h }] = await Promise.all([
      supabase.from('tarefas').select(CAMPOS_TAREFA).eq('id', tarefaId).maybeSingle(),
      supabase.from('tarefa_comentarios').select('*').eq('tarefa_id', tarefaId).order('created_at'),
      supabase.from('tarefa_anexos').select('*').eq('tarefa_id', tarefaId).order('created_at'),
      supabase.from('tarefa_historico').select('*').eq('tarefa_id', tarefaId).order('created_at', { ascending: false }).limit(80),
    ]);
    if (!t) setNaoEncontrada(true);
    else {
      const atual = t as unknown as Tarefa;
      setTarefa(atual);
      setRascunho(atual);
    }
    setComentarios((c ?? []) as ComentarioTarefa[]);
    setAnexos((a ?? []) as AnexoTarefa[]);
    setHistorico((h ?? []) as HistoricoTarefa[]);
    setCarregando(false);
  }, [tarefaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const existente = Boolean(tarefa);
  const edita = !tarefa || podeEditarTarefa(tarefa, meuId, gerencia);

  /** Tarefa existente: grava na hora. Tarefa nova: só guarda no rascunho. */
  async function mudar(patch: Partial<Rascunho>) {
    setRascunho((r) => ({ ...r, ...patch }));
    if (!tarefa) return;
    const { error } = await criarClienteNavegador().from('tarefas').update(patch).eq('id', tarefa.id);
    if (error) {
      avisar('erro', `Não foi possível salvar: ${error.message}`);
      setRascunho(tarefa);
      return;
    }
    setTarefa({ ...tarefa, ...patch });
    aoMudar();
    if ('status' in patch || 'responsaveis' in patch || 'vencimento' in patch || 'hora' in patch || 'prioridade' in patch) void carregar();
  }

  async function criar() {
    if (!rascunho.titulo.trim()) {
      avisar('alerta', 'Dê um título à tarefa.');
      return;
    }
    setSalvando(true);
    const { data, error } = await criarClienteNavegador()
      .from('tarefas')
      .insert({ ...rascunho, titulo: rascunho.titulo.trim(), ordem: ordemInicial, criado_por: meuId, criado_por_nome: meuNome })
      .select('id')
      .single();
    setSalvando(false);
    if (error || !data) {
      avisar('erro', `Não foi possível criar: ${error?.message ?? 'erro desconhecido'}`);
      return;
    }
    avisar(
      'sucesso',
      rascunho.vencimento ? 'Tarefa criada. Ela já está no calendário dos responsáveis.' : 'Tarefa criada.',
    );
    aoCriar((data as { id: string }).id);
  }

  async function comentar() {
    const texto = novoComentario.trim();
    if (!texto || !tarefa) return;
    setNovoComentario('');
    const { error } = await criarClienteNavegador()
      .from('tarefa_comentarios')
      .insert({ tarefa_id: tarefa.id, texto, autor_id: meuId, autor_nome: meuNome });
    if (error) {
      avisar('erro', `Não foi possível comentar: ${error.message}`);
      setNovoComentario(texto);
    } else {
      void carregar();
      aoMudar();
    }
  }

  async function anexar(novos: AnexoArquivo[]) {
    if (!tarefa) return;
    const { error } = await criarClienteNavegador()
      .from('tarefa_anexos')
      .insert(novos.map((n) => ({ tarefa_id: tarefa.id, nome: n.nome, caminho: n.caminho, tipo: n.tipo, tamanho: n.tamanho, enviado_por: meuId, enviado_por_nome: meuNome })));
    if (error) avisar('erro', `Não foi possível registrar o anexo: ${error.message}`);
    void carregar();
    aoMudar();
  }

  async function removerAnexo(anexo: AnexoArquivo) {
    const supabase = criarClienteNavegador();
    const { error } = await supabase.from('tarefa_anexos').delete().eq('caminho', anexo.caminho);
    if (error) {
      avisar('erro', 'Só quem enviou o arquivo (ou um gestor de tarefas) pode removê-lo.');
      return;
    }
    await apagarArquivo(supabase, anexo.caminho);
    void carregar();
    aoMudar();
  }

  async function apagarTarefa() {
    if (!tarefa) return;
    const { error } = await criarClienteNavegador().from('tarefas').delete().eq('id', tarefa.id);
    if (error) {
      avisar('erro', `Não foi possível excluir: ${error.message}`);
      return;
    }
    avisar('sucesso', 'Tarefa excluída. O evento saiu do calendário.');
    aoFechar();
  }

  function mudarChecklist(lista: ItemChecklistTarefa[]) {
    void mudar({ checklist: lista });
  }

  const feitos = rascunho.checklist.filter((i) => i.feito).length;
  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id);

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        largura="xl"
        titulo={existente ? 'Tarefa' : rascunho.tipo === 'lembrete' ? 'Novo lembrete' : 'Nova tarefa'}
        descricao={
          tarefa
            ? `Criada por ${tarefa.criado_por_nome ?? '—'} ${tempoRelativo(tarefa.created_at)}${tarefa.concluida_em ? ` · concluída ${tempoRelativo(tarefa.concluida_em)}` : ''}`
            : 'Com prazo e responsável, ela entra no calendário e avisa quem precisa.'
        }
        rodape={
          existente ? (
            <>
              {(tarefa?.criado_por === meuId || (gerencia && !tarefa?.privada)) && (
                <Botao variante="fantasma" className="mr-auto text-erro hover:bg-erro-suave hover:text-erro" onClick={() => setExcluir(true)}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Botao>
              )}
              <Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>
            </>
          ) : (
            <>
              <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
              <Botao onClick={() => void criar()} carregando={salvando}>Criar {rascunho.tipo === 'lembrete' ? 'lembrete' : 'tarefa'}</Botao>
            </>
          )
        }
      >
        {carregando ? (
          <Carregando />
        ) : naoEncontrada ? (
          <p className="py-10 text-center text-sm text-texto-suave">Esta tarefa não existe mais ou você não tem acesso a ela.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-5">
              {!edita && (
                <p className="flex items-center gap-2 rounded-lg bg-superficie px-3 py-2 text-xs text-texto-suave">
                  <Lock className="h-3.5 w-3.5" /> Você pode acompanhar e comentar; só os responsáveis, quem criou ou um gestor alteram a tarefa.
                </p>
              )}
              <Campo
                rotulo="Título"
                value={rascunho.titulo}
                maxLength={200}
                autoFocus={!existente}
                disabled={!edita}
                placeholder="Ex.: Enviar documentos do alvará para a prefeitura"
                onChange={(e) => setRascunho((r) => ({ ...r, titulo: e.target.value }))}
                onBlur={() => tarefa && rascunho.titulo.trim() && rascunho.titulo !== tarefa.titulo && void mudar({ titulo: rascunho.titulo.trim() })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !existente) void criar(); }}
              />
              <AreaTexto
                rotulo="Descrição"
                rows={4}
                value={rascunho.descricao}
                disabled={!edita}
                placeholder="Contexto, links, o que precisa ser entregue…"
                onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
                onBlur={() => tarefa && rascunho.descricao !== tarefa.descricao && void mudar({ descricao: rascunho.descricao })}
              />

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
                    <CheckSquare className="h-4 w-4 text-marca-600" /> Subtarefas
                    {rascunho.checklist.length > 0 && <span className="text-xs font-normal text-texto-suave">{feitos} de {rascunho.checklist.length}</span>}
                  </h3>
                </div>
                {rascunho.checklist.length > 0 && (
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sucesso transition-all" style={{ width: `${(feitos / rascunho.checklist.length) * 100}%` }} />
                  </div>
                )}
                <ul className="space-y-1">
                  {rascunho.checklist.map((item) => (
                    <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-superficie">
                      <input
                        type="checkbox"
                        checked={item.feito}
                        disabled={!edita}
                        onChange={() => mudarChecklist(rascunho.checklist.map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i)))}
                        className="h-4 w-4 rounded border-borda-forte accent-[var(--color-marca-600)]"
                        aria-label={item.texto}
                      />
                      <span className={cn('flex-1 text-sm', item.feito && 'text-texto-fraco line-through')}>{item.texto}</span>
                      {edita && (
                        <button
                          onClick={() => mudarChecklist(rascunho.checklist.filter((i) => i.id !== item.id))}
                          className="rounded p-1 text-texto-fraco opacity-0 hover:text-erro group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Remover ${item.texto}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {edita && (
                  <form
                    className="mt-1.5 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const texto = novoItem.trim();
                      if (!texto) return;
                      mudarChecklist([...rascunho.checklist, { id: novoId(), texto, feito: false }]);
                      setNovoItem('');
                    }}
                  >
                    <Campo value={novoItem} onChange={(e) => setNovoItem(e.target.value)} placeholder="Adicionar subtarefa…" maxLength={200} aria-label="Nova subtarefa" className="h-9" />
                    <Botao type="submit" variante="secundario" tamanho="sm" className="h-9 shrink-0"><Plus className="h-4 w-4" /> Adicionar</Botao>
                  </form>
                )}
              </section>

              {tarefa && (
                <>
                  <section>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
                        <Paperclip className="h-4 w-4 text-marca-600" /> Anexos
                        {anexos.length > 0 && <span className="text-xs font-normal text-texto-suave">{anexos.length}</span>}
                      </h3>
                      <BotaoAnexar pasta="tarefas" donoId={tarefa.id} aoEnviar={anexar} />
                    </div>
                    {anexos.length === 0 ? (
                      <p className="text-xs text-texto-fraco">Nenhum arquivo. Aceita imagens, PDF, Office, ZIP, áudio e vídeo de até 25 MB.</p>
                    ) : (
                      <ListaAnexos anexos={anexos} aoRemover={(a) => void removerAnexo(a)} />
                    )}
                  </section>

                  <section>
                    <div className="mb-3 flex gap-1 border-b border-borda" role="tablist">
                      {([['comentarios', MessageSquare, `Comentários${comentarios.length ? ` (${comentarios.length})` : ''}`], ['historico', History, 'Histórico']] as const).map(([v, Icone, rotulo]) => (
                        <button
                          key={v}
                          role="tab"
                          aria-selected={aba === v}
                          onClick={() => setAba(v)}
                          className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium', aba === v ? 'border-marca-600 text-marca-800' : 'border-transparent text-texto-suave hover:text-texto')}
                        >
                          <Icone className="h-4 w-4" /> {rotulo}
                        </button>
                      ))}
                    </div>

                    {aba === 'comentarios' ? (
                      <div className="space-y-3">
                        {comentarios.map((c) => (
                          <div key={c.id} className="flex gap-2.5">
                            <AvatarPessoa pessoa={nomeDe(c.autor_id) ?? (c.autor_id ? { id: c.autor_id, nome: c.autor_nome ?? '?' } : null)} tamanho="md" className="ring-0" />
                            <div className="min-w-0 flex-1 rounded-lg bg-superficie px-3 py-2">
                              <p className="text-xs text-texto-suave">
                                <strong className="font-semibold text-texto">{c.autor_nome ?? 'Alguém'}</strong> · {tempoRelativo(c.created_at)}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-texto">{c.texto}</p>
                            </div>
                          </div>
                        ))}
                        {comentarios.length === 0 && <p className="text-xs text-texto-fraco">Nenhum comentário ainda.</p>}
                        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void comentar(); }}>
                          <AreaTexto
                            rows={2}
                            value={novoComentario}
                            onChange={(e) => setNovoComentario(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void comentar(); }}
                            placeholder="Escreva um comentário… (Ctrl+Enter envia)"
                            aria-label="Novo comentário"
                            maxLength={4000}
                          />
                          <Botao type="submit" tamanho="icone" disabled={!novoComentario.trim()} aria-label="Enviar comentário"><Send className="h-4 w-4" /></Botao>
                        </form>
                      </div>
                    ) : (
                      <ol className="space-y-2.5 border-l-2 border-borda pl-4">
                        {historico.map((h) => (
                          <li key={h.id} className="relative text-sm">
                            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-marca-400 ring-4 ring-white" aria-hidden />
                            <p className="text-texto">
                              <strong className="font-medium">{h.autor_nome ?? 'Sistema'}</strong> {textoHistorico(h)}
                            </p>
                            <p className="text-xs text-texto-fraco">{new Date(h.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                          </li>
                        ))}
                        {historico.length === 0 && <li className="text-xs text-texto-fraco">Sem alterações registradas.</li>}
                      </ol>
                    )}
                  </section>
                </>
              )}
            </div>

            <aside className="space-y-4 lg:border-l lg:border-borda lg:pl-6">
              <div className="grid grid-cols-2 gap-3">
                <Selecao rotulo="Situação" value={rascunho.status} disabled={!edita} onChange={(e) => void mudar({ status: e.target.value as StatusTarefa })}>
                  {COLUNAS_TAREFA.map((c) => (
                    <option key={c.status} value={c.status}>{c.rotulo}</option>
                  ))}
                </Selecao>
                <Selecao rotulo="Prioridade" value={rascunho.prioridade} disabled={!edita} onChange={(e) => void mudar({ prioridade: e.target.value as Tarefa['prioridade'] })}>
                  {PRIORIDADES.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </Selecao>
              </div>

              <SeletorPessoas
                rotulo="Responsáveis"
                pessoas={pessoas}
                selecionadas={rascunho.responsaveis}
                desabilitado={!edita}
                vazio="Sem responsável"
                aoMudar={(ids) => void mudar({ responsaveis: ids })}
              />

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Campo
                  rotulo="Prazo"
                  type="date"
                  value={rascunho.vencimento ?? ''}
                  disabled={!edita}
                  onChange={(e) => void mudar({ vencimento: e.target.value || null, ...(e.target.value ? {} : { hora: null }) })}
                />
                <Campo
                  rotulo="Hora"
                  type="time"
                  value={rascunho.hora?.slice(0, 5) ?? ''}
                  disabled={!edita || !rascunho.vencimento}
                  onChange={(e) => void mudar({ hora: e.target.value || null })}
                />
              </div>
              {rascunho.vencimento && !tarefaEncerrada(rascunho) && (
                <p className="-mt-2 flex items-center gap-1.5 text-xs text-texto-fraco">
                  <CalendarDays className="h-3.5 w-3.5" /> Aparece no calendário {rascunho.responsaveis.length ? 'dos responsáveis' : 'de quem criou'}.
                </p>
              )}

              <CampoOpcoes
                grupo="tarefa_categoria"
                rotulo="Categoria"
                valor={rascunho.categoria}
                podeGerenciar={podeOpcoes}
                desabilitado={!edita}
                aoMudar={(v) => void mudar({ categoria: v })}
              />

              <Campo
                rotulo="Cliente / empresa relacionada"
                value={rascunho.empresa ?? ''}
                disabled={!edita}
                maxLength={200}
                placeholder="Opcional"
                onChange={(e) => setRascunho((r) => ({ ...r, empresa: e.target.value || null }))}
                onBlur={() => tarefa && (rascunho.empresa ?? null) !== (tarefa.empresa ?? null) && void mudar({ empresa: rascunho.empresa?.trim() || null })}
              />

              <div className="grid grid-cols-2 gap-3">
                <Selecao rotulo="Tipo" value={rascunho.tipo} disabled={!edita} onChange={(e) => void mudar({ tipo: e.target.value as Tarefa['tipo'] })}>
                  <option value="tarefa">Tarefa</option>
                  <option value="lembrete">Lembrete</option>
                </Selecao>
                <label className="flex cursor-pointer items-end gap-2 pb-2.5 text-sm text-texto">
                  <input
                    type="checkbox"
                    checked={rascunho.privada}
                    disabled={!edita || (existente && tarefa?.criado_por !== meuId)}
                    onChange={(e) => void mudar({ privada: e.target.checked })}
                    className="h-4 w-4 rounded border-borda-forte accent-[var(--color-marca-600)]"
                  />
                  <span title="Só você e os responsáveis veem">Privada</span>
                </label>
              </div>

              {tarefa && (
                <div className="flex flex-wrap gap-1.5 border-t border-borda pt-3">
                  <Selo tom="neutro">Atualizada {tempoRelativo(tarefa.updated_at)}</Selo>
                </div>
              )}
            </aside>
          </div>
        )}
      </Modal>

      <ModalConfirmacao
        aberto={excluir}
        aoFechar={() => setExcluir(false)}
        aoConfirmar={() => void apagarTarefa()}
        titulo="Excluir esta tarefa?"
        mensagem="A tarefa, os comentários e os anexos são removidos, e o evento sai do calendário. Para apenas encerrar, mova para Concluído ou Cancelado."
        rotuloConfirmar="Excluir tarefa"
      />
    </>
  );
}

function textoHistorico(h: HistoricoTarefa): string {
  switch (h.acao) {
    case 'criou':
      return `criou a tarefa em "${h.para ?? ''}"`;
    case 'moveu':
      return `moveu de "${h.de ?? ''}" para "${h.para ?? ''}"`;
    case 'responsáveis':
      return `alterou os responsáveis: ${h.de || 'ninguém'} → ${h.para || 'ninguém'}`;
    case 'prazo':
      return `alterou o prazo: ${h.de || 'sem prazo'} → ${h.para || 'sem prazo'}`;
    case 'prioridade':
      return `alterou a prioridade: ${h.de ?? ''} → ${h.para ?? ''}`;
    case 'título':
      return `renomeou: "${h.de ?? ''}" → "${h.para ?? ''}"`;
    case 'descrição':
      return 'editou a descrição';
    case 'anexou':
      return `anexou "${h.para ?? ''}"`;
    case 'comentou':
      return 'comentou';
    default:
      return `${h.acao}${h.para ? `: ${h.para}` : ''}`;
  }
}
