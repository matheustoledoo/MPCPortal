'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  KanbanSquare,
  List,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
} from 'lucide-react';

import { PainelTarefa } from '@/app/(portal)/tarefas/PainelTarefa';
import { PilhaDePessoas } from '@/components/equipe/Pessoas';
import { Botao, Campo, Cartao, EstadoVazio, Indicador, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { hojeIso } from '@/lib/atribuicoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import {
  CAMPOS_TAREFA,
  COLUNAS_TAREFA,
  PRIORIDADES,
  dataCurta,
  horaCurta,
  ordemEntre,
  podeEditarTarefa,
  prioridadeDe,
  situacaoDoPrazo,
  tarefaEncerrada,
} from '@/lib/tarefas';
import type { PessoaEquipe, StatusTarefa, Tarefa } from '@/types/banco';

type FiltroPrazo = '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';

export function QuadroTarefas({
  meuId,
  meuNome,
  gerencia,
  podeOpcoes,
  tarefasIniciais,
  pessoas,
  abrirId,
  abrirNova,
}: {
  meuId: string;
  meuNome: string;
  gerencia: boolean;
  podeOpcoes: boolean;
  tarefasIniciais: Tarefa[];
  pessoas: PessoaEquipe[];
  abrirId: string | null;
  abrirNova: boolean;
}) {
  const { avisar } = useAvisos();
  const router = useRouter();
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [contagens, setContagens] = useState<Record<string, { comentarios: number; anexos: number }>>({});
  const [visao, setVisao] = useState<'quadro' | 'lista'>('quadro');
  const [busca, setBusca] = useState('');
  const [pessoa, setPessoa] = useState<string>('');
  const [prioridade, setPrioridade] = useState('');
  const [categoria, setCategoria] = useState('');
  const [prazo, setPrazo] = useState<FiltroPrazo>('');
  const [aberta, setAberta] = useState<string | null>(abrirId);
  const [nova, setNova] = useState<StatusTarefa | null>(abrirNova ? 'a_fazer' : null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ status: StatusTarefa; indice: number } | null>(null);
  const hoje = hojeIso();

  const carregar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const [{ data }, { data: com }, { data: anx }] = await Promise.all([
      supabase.from('tarefas').select(CAMPOS_TAREFA).order('ordem'),
      supabase.from('tarefa_comentarios').select('tarefa_id'),
      supabase.from('tarefa_anexos').select('tarefa_id'),
    ]);
    if (data) setTarefas(data as unknown as Tarefa[]);
    const mapa: Record<string, { comentarios: number; anexos: number }> = {};
    for (const c of (com ?? []) as { tarefa_id: string }[]) (mapa[c.tarefa_id] ??= { comentarios: 0, anexos: 0 }).comentarios++;
    for (const a of (anx ?? []) as { tarefa_id: string }[]) (mapa[a.tarefa_id] ??= { comentarios: 0, anexos: 0 }).anexos++;
    setContagens(mapa);
  }, []);

  // Tempo real: outra pessoa moveu, criou ou comentou — o quadro acompanha.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void carregar();
    const supabase = criarClienteNavegador();
    const agendar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void carregar(), 400);
    };
    const canal = supabase
      .channel('tarefas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, agendar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tarefa_comentarios' }, agendar)
      .subscribe();
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  const categorias = useMemo(
    () => Array.from(new Set(tarefas.map((t) => t.categoria).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [tarefas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const limiteSemana = hojeIso(7);
    return tarefas.filter((t) => {
      if (termo && !`${t.titulo} ${t.descricao} ${t.empresa ?? ''} ${t.categoria ?? ''}`.toLowerCase().includes(termo)) return false;
      if (pessoa === 'sem' ? t.responsaveis.length > 0 : pessoa && !t.responsaveis.includes(pessoa)) return false;
      if (prioridade && t.prioridade !== prioridade) return false;
      if (categoria && t.categoria !== categoria) return false;
      if (prazo) {
        const s = situacaoDoPrazo(t, hoje);
        if (prazo === 'atrasadas' && s !== 'atrasada') return false;
        if (prazo === 'hoje' && s !== 'hoje') return false;
        if (prazo === 'semana' && !(t.vencimento && !tarefaEncerrada(t) && t.vencimento >= hoje && t.vencimento <= limiteSemana)) return false;
        if (prazo === 'sem' && (t.vencimento || tarefaEncerrada(t))) return false;
      }
      return true;
    });
  }, [tarefas, busca, pessoa, prioridade, categoria, prazo, hoje]);

  const porColuna = useMemo(() => {
    const mapa = new Map<StatusTarefa, Tarefa[]>();
    for (const c of COLUNAS_TAREFA) mapa.set(c.status, []);
    for (const t of filtradas) mapa.get(t.status)?.push(t);
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [filtradas]);

  const resumo = useMemo(() => {
    const minhas = tarefas.filter((t) => t.responsaveis.includes(meuId) && !tarefaEncerrada(t));
    const abertas = tarefas.filter((t) => !tarefaEncerrada(t));
    const limite = hojeIso(7);
    return {
      abertas: abertas.length,
      minhas: minhas.length,
      atrasadas: abertas.filter((t) => situacaoDoPrazo(t, hoje) === 'atrasada').length,
      hoje: abertas.filter((t) => t.vencimento === hoje).length,
      semana: abertas.filter((t) => t.vencimento && t.vencimento > hoje && t.vencimento <= limite).length,
    };
  }, [tarefas, meuId, hoje]);

  async function mover(id: string, status: StatusTarefa, indice: number) {
    const tarefa = tarefas.find((t) => t.id === id);
    if (!tarefa) return;
    if (!podeEditarTarefa(tarefa, meuId, gerencia)) {
      avisar('alerta', 'Só os responsáveis, quem criou ou um gestor de tarefas podem mover este cartão.');
      return;
    }
    const destino = (porColuna.get(status) ?? []).filter((t) => t.id !== id);
    const ordem = ordemEntre(destino[indice - 1]?.ordem, destino[indice]?.ordem);
    if (tarefa.status === status && tarefa.ordem === ordem) return;

    const anterior = tarefas;
    setTarefas((lista) => lista.map((t) => (t.id === id ? { ...t, status, ordem } : t)));
    const { error } = await criarClienteNavegador().from('tarefas').update({ status, ordem }).eq('id', id);
    if (error) {
      setTarefas(anterior);
      avisar('erro', `Não foi possível mover: ${error.message}`);
    }
  }

  function aoSoltar(status: StatusTarefa) {
    const id = arrastando;
    const indice = alvo?.status === status ? alvo.indice : (porColuna.get(status)?.length ?? 0);
    setArrastando(null);
    setAlvo(null);
    if (id) void mover(id, status, indice);
  }

  function fecharPainel() {
    setAberta(null);
    setNova(null);
    router.replace('/tarefas', { scroll: false });
    void carregar();
  }

  const temFiltro = Boolean(busca || pessoa || prioridade || categoria || prazo);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador rotulo="Em aberto" valor={resumo.abertas} icone={<KanbanSquare className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Comigo" valor={resumo.minhas} tom="info" icone={<CheckSquare className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Atrasadas" valor={resumo.atrasadas} tom={resumo.atrasadas ? 'erro' : 'neutro'} icone={<AlertTriangle className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Vencem hoje" valor={resumo.hoje} tom={resumo.hoje ? 'alerta' : 'neutro'} icone={<AlarmClock className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Próximos 7 dias" valor={resumo.semana} tom="neutro" icone={<CalendarClock className="h-4.5 w-4.5" />} />
      </div>

      <Cartao className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <Campo
            placeholder="Buscar por título, descrição, cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            iconeInicial={<Search className="h-4 w-4" />}
            aria-label="Buscar tarefas"
          />
        </div>
        <div className="w-44">
          <Selecao aria-label="Responsável" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            <option value={meuId}>Minhas tarefas</option>
            <option value="sem">Sem responsável</option>
            {pessoas.filter((p) => p.id !== meuId).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </Selecao>
        </div>
        <div className="w-36">
          <Selecao aria-label="Prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="">Prioridade</option>
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>{p.rotulo}</option>
            ))}
          </Selecao>
        </div>
        <div className="w-40">
          <Selecao aria-label="Prazo" value={prazo} onChange={(e) => setPrazo(e.target.value as FiltroPrazo)}>
            <option value="">Qualquer prazo</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="hoje">Vencem hoje</option>
            <option value="semana">Próximos 7 dias</option>
            <option value="sem">Sem prazo</option>
          </Selecao>
        </div>
        {categorias.length > 0 && (
          <div className="w-40">
            <Selecao aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Categoria</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Selecao>
          </div>
        )}
        {temFiltro && (
          <Botao variante="fantasma" tamanho="sm" onClick={() => { setBusca(''); setPessoa(''); setPrioridade(''); setCategoria(''); setPrazo(''); }}>
            Limpar filtros
          </Botao>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-borda-forte bg-white p-0.5" role="tablist" aria-label="Visualização">
            {([['quadro', KanbanSquare, 'Quadro'], ['lista', List, 'Lista']] as const).map(([v, Icone, rotulo]) => (
              <button
                key={v}
                role="tab"
                aria-selected={visao === v}
                onClick={() => setVisao(v)}
                className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium', visao === v ? 'bg-marca-50 text-marca-800' : 'text-texto-suave hover:text-texto')}
              >
                <Icone className="h-3.5 w-3.5" /> {rotulo}
              </button>
            ))}
          </div>
          <Botao onClick={() => setNova('a_fazer')}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Botao>
        </div>
      </Cartao>

      {tarefas.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<KanbanSquare className="h-6 w-6" />}
            titulo="Nenhuma tarefa por aqui ainda"
            descricao="Crie a primeira tarefa ou lembrete. Quando ela tiver prazo e responsável, aparece sozinha no calendário e avisa quem precisa."
            acao={<Botao onClick={() => setNova('a_fazer')}><Plus className="h-4 w-4" /> Nova tarefa</Botao>}
          />
        </Cartao>
      ) : visao === 'quadro' ? (
        <div className="-mx-5 overflow-x-auto px-5 pb-3 sm:-mx-7 sm:px-7">
          <div className="flex min-w-max gap-3">
            {COLUNAS_TAREFA.map((coluna) => {
              const lista = porColuna.get(coluna.status) ?? [];
              const recebendo = arrastando && alvo?.status === coluna.status;
              return (
                <section
                  key={coluna.status}
                  aria-label={coluna.rotulo}
                  onDragOver={(e) => {
                    if (!arrastando) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    // Posição: antes do primeiro cartão cujo meio está abaixo do cursor.
                    const cartoes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-cartao]')).filter((el) => el.dataset.cartao !== arrastando);
                    let indice = cartoes.length;
                    for (let i = 0; i < cartoes.length; i++) {
                      const r = cartoes[i].getBoundingClientRect();
                      if (e.clientY < r.top + r.height / 2) { indice = i; break; }
                    }
                    if (alvo?.status !== coluna.status || alvo.indice !== indice) setAlvo({ status: coluna.status, indice });
                  }}
                  onDrop={(e) => { e.preventDefault(); aoSoltar(coluna.status); }}
                  className={cn('flex w-[290px] shrink-0 flex-col rounded-xl border border-borda transition-colors', coluna.fundo, recebendo && 'border-marca-400 ring-2 ring-marca-100')}
                >
                  <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: coluna.cor }} aria-hidden />
                      {coluna.rotulo}
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-texto-suave ring-1 ring-borda">{lista.length}</span>
                    </h2>
                    <button
                      onClick={() => setNova(coluna.status)}
                      className="rounded-md p-1 text-texto-fraco hover:bg-white hover:text-marca-700"
                      aria-label={`Nova tarefa em ${coluna.rotulo}`}
                      title={`Nova tarefa em ${coluna.rotulo}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </header>
                  <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                    {lista.map((t, i) => (
                      <div key={t.id}>
                        {recebendo && alvo?.indice === i && arrastando !== t.id && <div className="mb-2 h-1 rounded-full bg-marca-400" aria-hidden />}
                        <CartaoTarefa
                          tarefa={t}
                          hoje={hoje}
                          pessoas={pessoas}
                          contagem={contagens[t.id]}
                          arrastavel={podeEditarTarefa(t, meuId, gerencia)}
                          esmaecido={arrastando === t.id}
                          aoAbrir={() => setAberta(t.id)}
                          aoArrastar={(inicio) => { setArrastando(inicio ? t.id : null); if (!inicio) setAlvo(null); }}
                        />
                      </div>
                    ))}
                    {recebendo && alvo?.indice === lista.filter((t) => t.id !== arrastando).length && lista.length > 0 && (
                      <div className="h-1 rounded-full bg-marca-400" aria-hidden />
                    )}
                    {lista.length === 0 && (
                      <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-xs text-texto-fraco">
                        {arrastando ? 'Solte aqui' : temFiltro ? 'Nada com estes filtros' : 'Nenhum cartão'}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
                <th className="px-4 py-2.5">Tarefa</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5">Prioridade</th>
                <th className="px-3 py-2.5">Prazo</th>
                <th className="px-3 py-2.5">Responsáveis</th>
              </tr>
            </thead>
            <tbody>
              {[...filtradas]
                .sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') || prioridadeDe(a.prioridade).peso - prioridadeDe(b.prioridade).peso)
                .map((t) => {
                  const s = situacaoDoPrazo(t, hoje);
                  return (
                    <tr key={t.id} onClick={() => setAberta(t.id)} className="cursor-pointer border-b border-borda last:border-0 hover:bg-superficie">
                      <td className="px-4 py-2.5">
                        <span className={cn('font-medium text-texto', tarefaEncerrada(t) && 'text-texto-fraco line-through')}>{t.titulo}</span>
                        {t.empresa && <span className="block text-xs text-texto-fraco">{t.empresa}</span>}
                      </td>
                      <td className="px-3 py-2.5"><Selo tom="neutro">{COLUNAS_TAREFA.find((c) => c.status === t.status)?.rotulo}</Selo></td>
                      <td className="px-3 py-2.5"><Selo tom={prioridadeDe(t.prioridade).tom}>{prioridadeDe(t.prioridade).rotulo}</Selo></td>
                      <td className={cn('px-3 py-2.5 tabular-nums', s === 'atrasada' && 'font-semibold text-erro', s === 'hoje' && 'font-semibold text-alerta')}>
                        {t.vencimento ? `${dataCurta(t.vencimento)} ${horaCurta(t.hora)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5"><PilhaDePessoas ids={t.responsaveis} pessoas={pessoas} maximo={4} /></td>
                    </tr>
                  );
                })}
              {filtradas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-texto-fraco">Nenhuma tarefa com estes filtros.</td></tr>
              )}
            </tbody>
          </table>
        </Cartao>
      )}

      {(aberta || nova) && (
        <PainelTarefa
          key={aberta ?? `nova-${nova}`}
          tarefaId={aberta}
          statusInicial={nova ?? 'a_fazer'}
          meuId={meuId}
          meuNome={meuNome}
          gerencia={gerencia}
          podeOpcoes={podeOpcoes}
          pessoas={pessoas}
          ordemInicial={ordemEntre(undefined, (porColuna.get(nova ?? 'a_fazer') ?? [])[0]?.ordem)}
          aoFechar={fecharPainel}
          aoCriar={(id) => { setNova(null); setAberta(id); void carregar(); }}
          aoMudar={() => void carregar()}
        />
      )}
    </div>
  );
}

function CartaoTarefa({
  tarefa: t,
  hoje,
  pessoas,
  contagem,
  arrastavel,
  esmaecido,
  aoAbrir,
  aoArrastar,
}: {
  tarefa: Tarefa;
  hoje: string;
  pessoas: PessoaEquipe[];
  contagem?: { comentarios: number; anexos: number };
  arrastavel: boolean;
  esmaecido: boolean;
  aoAbrir: () => void;
  aoArrastar: (inicio: boolean) => void;
}) {
  const s = situacaoDoPrazo(t, hoje);
  const p = prioridadeDe(t.prioridade);
  const feitos = t.checklist.filter((i) => i.feito).length;

  return (
    <article
      data-cartao={t.id}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.effectAllowed = 'move';
        aoArrastar(true);
      }}
      onDragEnd={() => aoArrastar(false)}
      onClick={aoAbrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAbrir(); } }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir tarefa ${t.titulo}`}
      className={cn(
        'group rounded-lg border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-marca-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-marca-500',
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        s === 'atrasada' ? 'border-red-200' : 'border-borda',
        esmaecido && 'opacity-40',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {t.prioridade !== 'normal' && <Selo tom={p.tom} className="text-[10px]">{p.rotulo}</Selo>}
        {t.tipo === 'lembrete' && <Selo tom="marca" className="text-[10px]"><AlarmClock className="h-3 w-3" /> Lembrete</Selo>}
        {t.categoria && <Selo tom="neutro" className="text-[10px]">{t.categoria}</Selo>}
        {t.privada && <span title="Privada: só você e os responsáveis veem"><Lock className="h-3 w-3 text-texto-fraco" /></span>}
      </div>
      <h3 className={cn('text-sm font-medium leading-snug text-texto', tarefaEncerrada(t) && 'text-texto-fraco line-through')}>{t.titulo}</h3>
      {t.empresa && <p className="mt-0.5 truncate text-xs text-texto-fraco">{t.empresa}</p>}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-texto-suave">
          {t.vencimento && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium tabular-nums',
                s === 'atrasada' && 'bg-erro-suave text-erro',
                s === 'hoje' && 'bg-alerta-suave text-alerta',
                s === 'proxima' && 'bg-info-suave text-info',
                s === 'encerrada' && 'text-texto-fraco',
              )}
              title={s === 'atrasada' ? 'Atrasada' : s === 'hoje' ? 'Vence hoje' : 'Prazo'}
            >
              {t.status === 'concluido' ? <CheckCircle2 className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {dataCurta(t.vencimento)} {horaCurta(t.hora)}
            </span>
          )}
          {t.checklist.length > 0 && (
            <span className={cn('inline-flex items-center gap-1', feitos === t.checklist.length && 'text-sucesso')}>
              <CheckSquare className="h-3 w-3" /> {feitos}/{t.checklist.length}
            </span>
          )}
          {contagem?.comentarios ? <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {contagem.comentarios}</span> : null}
          {contagem?.anexos ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> {contagem.anexos}</span> : null}
        </div>
        <PilhaDePessoas ids={t.responsaveis} pessoas={pessoas} />
      </div>
    </article>
  );
}
