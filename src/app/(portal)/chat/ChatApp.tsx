'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ArrowDown,
  ArrowLeft,
  Check,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { BotaoAnexar, ListaAnexos } from '@/components/arquivos/Anexos';
import { AvatarPessoa, SeletorPessoas } from '@/components/equipe/Pessoas';
import { Botao, Campo, Carregando, Modal, ModalConfirmacao, Popover, cn, useAvisos } from '@/components/ui';
import { apagarArquivo, tamanhoLegivel } from '@/lib/arquivos';
import { rotuloArea } from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AnexoArquivo, ConversaChat, MensagemChat, PessoaEquipe } from '@/types/banco';

const PAGINA = 50;

interface ResultadoBusca {
  id: string;
  conversa_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  texto: string;
  created_at: string;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function diaLegivel(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}

function quandoCurto(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return hora(iso);
  if (hoje.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ChatApp({
  meuId,
  souAdmin,
  conversasIniciais,
  pessoas,
  abrirConversa,
  abrirCom,
}: {
  meuId: string;
  souAdmin: boolean;
  conversasIniciais: ConversaChat[];
  pessoas: PessoaEquipe[];
  abrirConversa: string | null;
  abrirCom: string | null;
}) {
  const { avisar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [ativaId, setAtivaId] = useState<string | null>(abrirConversa);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<AnexoArquivo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [nova, setNova] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [editando, setEditando] = useState<MensagemChat | null>(null);
  const [apagar, setApagar] = useState<MensagemChat | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const [longeDoFim, setLongeDoFim] = useState(false);
  const ativaRef = useRef<string | null>(ativaId);
  ativaRef.current = ativaId;
  const historicoRef = useRef(false);
  historicoRef.current = historico;

  const ativa = conversas.find((c) => c.id === ativaId) ?? null;

  const nomeDaConversa = useCallback(
    (c: ConversaChat) => (c.tipo === 'grupo' ? (c.nome ?? 'Grupo') : (c.participantes.find((p) => p.id !== meuId)?.nome ?? 'Conversa')),
    [meuId],
  );
  const outro = (c: ConversaChat) => c.participantes.find((p) => p.id !== meuId);
  const nomeDe = useCallback(
    (id: string | null) => ativa?.participantes.find((p) => p.id === id)?.nome ?? pessoas.find((p) => p.id === id)?.nome ?? 'Alguém',
    [ativa, pessoas],
  );

  const carregarConversas = useCallback(async () => {
    const { data } = await criarClienteNavegador().rpc('chat_minhas_conversas');
    if (data) setConversas(data as ConversaChat[]);
  }, []);

  const rolarAoFim = useCallback((suave = false) => {
    requestAnimationFrame(() => fim.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' }));
  }, []);

  const marcarLida = useCallback(async (id: string) => {
    setConversas((lista) => lista.map((c) => (c.id === id ? { ...c, nao_lidas: 0 } : c)));
    await criarClienteNavegador().rpc('chat_marcar_lida', { p_conversa: id });
  }, []);

  /** As mensagens mais recentes; ou, vindo da busca, a janela em volta de uma mensagem antiga. */
  const abrir = useCallback(
    async (id: string, emTornoDe?: { id: string; created_at: string }) => {
      setAtivaId(id);
      setCarregando(true);
      setMensagens([]);
      setEditando(null);
      setPendentes([]);
      setDestaque(emTornoDe?.id ?? null);
      const supabase = criarClienteNavegador();
      if (emTornoDe) {
        const [{ data: antes }, { data: depois }] = await Promise.all([
          supabase.from('chat_mensagens').select('*').eq('conversa_id', id).lt('created_at', emTornoDe.created_at).order('created_at', { ascending: false }).limit(20),
          supabase.from('chat_mensagens').select('*').eq('conversa_id', id).gte('created_at', emTornoDe.created_at).order('created_at').limit(PAGINA),
        ]);
        if (ativaRef.current !== id) return;
        setMensagens([...((antes ?? []) as MensagemChat[]).reverse(), ...((depois ?? []) as MensagemChat[])]);
        setTemMais((antes ?? []).length === 20);
        setHistorico((depois ?? []).length === PAGINA);
        setCarregando(false);
        requestAnimationFrame(() => document.getElementById(`msg-${emTornoDe.id}`)?.scrollIntoView({ block: 'center' }));
      } else {
        const { data, error } = await supabase.from('chat_mensagens').select('*').eq('conversa_id', id).order('created_at', { ascending: false }).limit(PAGINA);
        if (ativaRef.current !== id) return;
        if (error) avisar('erro', `Não foi possível carregar as mensagens: ${error.message}`);
        setMensagens(((data ?? []) as MensagemChat[]).reverse());
        setTemMais((data ?? []).length === PAGINA);
        setHistorico(false);
        setCarregando(false);
        rolarAoFim();
      }
      void marcarLida(id);
    },
    [avisar, marcarLida, rolarAoFim],
  );

  async function carregarAnteriores() {
    if (!ativaId || mensagens.length === 0) return;
    const altura = rolagem.current?.scrollHeight ?? 0;
    const { data } = await criarClienteNavegador()
      .from('chat_mensagens')
      .select('*')
      .eq('conversa_id', ativaId)
      .lt('created_at', mensagens[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGINA);
    const anteriores = ((data ?? []) as MensagemChat[]).reverse();
    setTemMais(anteriores.length === PAGINA);
    setMensagens((lista) => [...anteriores, ...lista]);
    // Mantém a pessoa olhando para a mesma mensagem depois de inserir as antigas acima.
    requestAnimationFrame(() => {
      if (rolagem.current) rolagem.current.scrollTop = rolagem.current.scrollHeight - altura;
    });
  }

  // Abertura inicial por link.
  const iniciou = useRef(false);
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    if (abrirConversa) void abrir(abrirConversa);
    else if (abrirCom) {
      void criarClienteNavegador()
        .rpc('chat_abrir_direta', { p_usuario: abrirCom })
        .then(async ({ data, error }) => {
          if (error || !data) return avisar('erro', error?.message ?? 'Não foi possível abrir a conversa.');
          await carregarConversas();
          void abrir(data as string);
        });
    }
  }, [abrirConversa, abrirCom, abrir, avisar, carregarConversas]);

  // Tempo real: a RLS já limita os eventos às conversas de que participo.
  useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`chat:${meuId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' }, (carga) => {
        const m = carga.new as MensagemChat;
        if (m.conversa_id === ativaRef.current && !historicoRef.current) {
          setMensagens((lista) => (lista.some((x) => x.id === m.id) ? lista : [...lista, m]));
          const perto = rolagem.current ? rolagem.current.scrollHeight - rolagem.current.scrollTop - rolagem.current.clientHeight < 240 : true;
          if (perto || m.autor_id === meuId) rolarAoFim(true);
          if (document.visibilityState === 'visible') void marcarLida(m.conversa_id);
        }
        void carregarConversas();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_mensagens' }, (carga) => {
        const m = carga.new as MensagemChat;
        setMensagens((lista) => lista.map((x) => (x.id === m.id ? m : x)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participantes' }, () => void carregarConversas())
      .subscribe();
    // Rede instável ou tempo real indisponível: a lista se atualiza mesmo assim.
    const reserva = setInterval(() => void carregarConversas(), 30_000);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && ativaRef.current) void marcarLida(ativaRef.current);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(reserva);
      document.removeEventListener('visibilitychange', aoVoltar);
      void supabase.removeChannel(canal);
    };
  }, [meuId, carregarConversas, marcarLida, rolarAoFim]);

  // Busca em mensagens e nomes de arquivo (no banco, só nas minhas conversas).
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setResultados(null);
      return;
    }
    const t = setTimeout(() => {
      void criarClienteNavegador()
        .rpc('chat_buscar', { p_termo: termo, p_conversa: null })
        .then(({ data }) => setResultados((data ?? []) as ResultadoBusca[]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!ativaId || (!conteudo && pendentes.length === 0) || enviando) return;
    setEnviando(true);
    const supabase = criarClienteNavegador();
    if (editando) {
      const { error } = await supabase.from('chat_mensagens').update({ texto: conteudo }).eq('id', editando.id);
      setEnviando(false);
      if (error) return avisar('erro', `Não foi possível editar: ${error.message}`);
      setMensagens((lista) => lista.map((m) => (m.id === editando.id ? { ...m, texto: conteudo, editada_em: new Date().toISOString() } : m)));
      setEditando(null);
      setTexto('');
      return;
    }
    const { data, error } = await supabase
      .from('chat_mensagens')
      .insert({ conversa_id: ativaId, autor_id: meuId, texto: conteudo, anexos: pendentes })
      .select('*')
      .single();
    setEnviando(false);
    if (error || !data) return avisar('erro', `Mensagem não enviada: ${error?.message ?? 'erro desconhecido'}`);
    setTexto('');
    setPendentes([]);
    if (historico) void abrir(ativaId);
    else {
      setMensagens((lista) => (lista.some((x) => x.id === (data as MensagemChat).id) ? lista : [...lista, data as MensagemChat]));
      rolarAoFim(true);
    }
    void carregarConversas();
  }

  async function apagarMensagem() {
    if (!apagar) return;
    const supabase = criarClienteNavegador();
    const { error } = await supabase.from('chat_mensagens').update({ excluida_em: new Date().toISOString() }).eq('id', apagar.id);
    if (error) {
      avisar('erro', `Não foi possível apagar: ${error.message}`);
      return;
    }
    for (const a of apagar.anexos) await apagarArquivo(supabase, a.caminho);
    setMensagens((lista) => lista.map((m) => (m.id === apagar.id ? { ...m, texto: '', anexos: [], excluida_em: new Date().toISOString() } : m)));
    setApagar(null);
  }

  const termo = busca.trim().toLowerCase();
  const conversasFiltradas = useMemo(
    () => (termo ? conversas.filter((c) => nomeDaConversa(c).toLowerCase().includes(termo)) : conversas),
    [conversas, termo, nomeDaConversa],
  );
  const totalNaoLidas = conversas.reduce((s, c) => s + (c.id === ativaId ? 0 : c.nao_lidas), 0);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 bg-superficie-elevada">
      {/* Lista de conversas */}
      <aside className={cn('flex w-full shrink-0 flex-col border-r border-borda md:w-80 lg:w-[340px]', ativaId && 'hidden md:flex')}>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h1 className="text-lg font-semibold tracking-tight text-texto">
            Mensagens {totalNaoLidas > 0 && <span className="ml-1 rounded-full bg-erro px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">{totalNaoLidas}</span>}
          </h1>
          <Botao tamanho="sm" onClick={() => setNova(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Nova
          </Botao>
        </div>
        <div className="px-4 pb-3">
          <Campo value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversas, mensagens e arquivos" iconeInicial={<Search className="h-4 w-4" />} aria-label="Buscar no chat" className="h-9" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversasFiltradas.length === 0 && !resultados?.length && (
            <div className="px-6 py-12 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-texto-fraco" />
              <p className="mt-3 text-sm font-medium text-texto">{termo ? 'Nada encontrado' : 'Nenhuma conversa ainda'}</p>
              {!termo && <p className="mt-1 text-xs text-texto-suave">Clique em “Nova” para falar com um colega ou abrir o grupo do seu departamento.</p>}
            </div>
          )}
          <ul>
            {conversasFiltradas.map((c) => {
              const o = outro(c);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => void abrir(c.id)}
                    className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-superficie', c.id === ativaId && 'bg-marca-50 hover:bg-marca-50')}
                    aria-current={c.id === ativaId ? 'true' : undefined}
                  >
                    {c.tipo === 'grupo' ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-marca-800"><Users className="h-4.5 w-4.5" /></span>
                    ) : (
                      <AvatarPessoa pessoa={o ?? null} tamanho="lg" className="ring-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm text-texto', c.nao_lidas > 0 && c.id !== ativaId ? 'font-semibold' : 'font-medium')}>{nomeDaConversa(c)}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-texto-fraco">{c.ultima_mensagem_resumo ? quandoCurto(c.ultima_mensagem_em) : ''}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('truncate text-xs', c.nao_lidas > 0 && c.id !== ativaId ? 'font-medium text-texto' : 'text-texto-suave')}>
                          {c.ultima_mensagem_resumo
                            ? `${c.ultima_mensagem_autor === meuId ? 'Você: ' : c.tipo === 'grupo' ? `${(c.participantes.find((p) => p.id === c.ultima_mensagem_autor)?.nome ?? '').split(' ')[0]}: ` : ''}${c.ultima_mensagem_resumo}`
                            : 'Sem mensagens ainda'}
                        </span>
                        {c.nao_lidas > 0 && c.id !== ativaId && (
                          <span className="shrink-0 rounded-full bg-marca-700 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white" aria-label={`${c.nao_lidas} não lidas`}>{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {resultados && (
            <div className="border-t border-borda">
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">Mensagens e arquivos {resultados.length > 0 && `(${resultados.length})`}</p>
              {resultados.length === 0 && <p className="px-4 pb-4 text-xs text-texto-suave">Nenhuma mensagem com “{busca.trim()}”.</p>}
              <ul>
                {resultados.map((r) => {
                  const c = conversas.find((x) => x.id === r.conversa_id);
                  return (
                    <li key={r.id}>
                      <button onClick={() => void abrir(r.conversa_id, r)} className="block w-full px-4 py-2 text-left hover:bg-superficie">
                        <span className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-texto">{c ? nomeDaConversa(c) : 'Conversa'}</span>
                          <span className="shrink-0 tabular-nums text-texto-fraco">{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                        </span>
                        <span className="line-clamp-2 text-xs text-texto-suave"><span className="font-medium">{r.autor_id === meuId ? 'Você' : (r.autor_nome ?? '').split(' ')[0]}:</span> {r.texto || '📎 arquivo'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </aside>

      {/* Conversa */}
      <section className={cn('min-w-0 flex-1 flex-col bg-superficie', ativaId ? 'flex' : 'hidden md:flex')}>
        {!ativa ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-marca-50 text-marca-600"><MessageCircle className="h-7 w-7" /></span>
            <div>
              <p className="text-sm font-semibold text-texto">{ativaId ? 'Abrindo conversa…' : 'Escolha uma conversa'}</p>
              <p className="mt-1 max-w-sm text-sm text-texto-suave">As mensagens e os arquivos ficam guardados: você pode voltar e consultar o histórico completo a qualquer momento.</p>
            </div>
            <Botao variante="secundario" onClick={() => setNova(true)}><MessageSquarePlus className="h-4 w-4" /> Nova conversa</Botao>
          </div>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie-elevada px-3 sm:px-5">
              <button onClick={() => setAtivaId(null)} className="rounded-lg p-2 text-texto-suave hover:bg-superficie md:hidden" aria-label="Voltar para a lista"><ArrowLeft className="h-5 w-5" /></button>
              {ativa.tipo === 'grupo' ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-100 text-marca-800"><Users className="h-4 w-4" /></span>
              ) : (
                <AvatarPessoa pessoa={outro(ativa) ?? null} tamanho="lg" className="h-9 w-9 ring-0" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-texto">{nomeDaConversa(ativa)}</h2>
                <p className="truncate text-xs text-texto-suave">
                  {ativa.tipo === 'grupo'
                    ? `${ativa.participantes.length} participante(s)${ativa.departamento ? ' · grupo do departamento' : ''}`
                    : [outro(ativa)?.cargo, rotuloArea(outro(ativa)?.area)].filter((x) => x && x !== '—').join(' · ') || 'Conversa direta'}
                </p>
              </div>
              {ativa.tipo === 'grupo' && (
                <Botao variante="fantasma" tamanho="sm" onClick={() => setDetalhes(true)}><Users className="h-4 w-4" /> <span className="hidden sm:inline">Participantes</span></Botao>
              )}
            </header>

            <div ref={rolagem} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" onScroll={(e) => { const el = e.currentTarget; setLongeDoFim(el.scrollHeight - el.scrollTop - el.clientHeight > 400); }}>
              {carregando ? (
                <Carregando texto="Carregando mensagens…" />
              ) : (
                <>
                  {temMais && (
                    <div className="mb-4 text-center"><Botao variante="secundario" tamanho="sm" onClick={() => void carregarAnteriores()}>Carregar mensagens anteriores</Botao></div>
                  )}
                  {!temMais && mensagens.length > 0 && <p className="mb-4 text-center text-[11px] text-texto-fraco">Início da conversa</p>}
                  {mensagens.length === 0 && <p className="py-16 text-center text-sm text-texto-suave">Nenhuma mensagem ainda. Diga olá 👋</p>}
                  <ol className="space-y-0.5">
                    {mensagens.map((m, i) => {
                      const anterior = mensagens[i - 1];
                      const novoDia = !anterior || new Date(anterior.created_at).toDateString() !== new Date(m.created_at).toDateString();
                      const agrupa = !novoDia && anterior?.autor_id === m.autor_id && Date.parse(m.created_at) - Date.parse(anterior.created_at) < 5 * 60_000;
                      const minha = m.autor_id === meuId;
                      return (
                        <li key={m.id} id={`msg-${m.id}`}>
                          {novoDia && (
                            <div className="my-4 flex items-center gap-3 text-[11px] font-medium text-texto-fraco">
                              <span className="h-px flex-1 bg-borda" /> <span className="first-letter:uppercase">{diaLegivel(m.created_at)}</span> <span className="h-px flex-1 bg-borda" />
                            </div>
                          )}
                          <Mensagem
                            mensagem={m}
                            minha={minha}
                            agrupada={agrupa}
                            autor={{ id: m.autor_id ?? '', nome: nomeDe(m.autor_id) }}
                            emDestaque={destaque === m.id}
                            aoEditar={() => { setEditando(m); setTexto(m.texto); }}
                            aoApagar={() => setApagar(m)}
                          />
                        </li>
                      );
                    })}
                  </ol>
                  {historico && (
                    <div className="mt-4 text-center"><Botao variante="secundario" tamanho="sm" onClick={() => void abrir(ativa.id)}><ArrowDown className="h-4 w-4" /> Ir para as mensagens mais recentes</Botao></div>
                  )}
                  <div ref={fim} />
                </>
              )}
            </div>
            {longeDoFim && !historico && (
              <div className="pointer-events-none relative">
                <button onClick={() => rolarAoFim(true)} className="pointer-events-auto absolute -top-12 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-borda bg-white text-texto-suave shadow-md hover:text-texto" aria-label="Ir para o fim da conversa"><ArrowDown className="h-4 w-4" /></button>
              </div>
            )}

            <footer className="shrink-0 border-t border-borda bg-superficie-elevada px-3 py-3 sm:px-5">
              {editando && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-info-suave px-3 py-1.5 text-xs text-info">
                  <span className="flex items-center gap-1.5 font-medium"><Pencil className="h-3.5 w-3.5" /> Editando mensagem</span>
                  <button onClick={() => { setEditando(null); setTexto(''); }} aria-label="Cancelar edição"><X className="h-4 w-4" /></button>
                </div>
              )}
              {pendentes.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {pendentes.map((a) => (
                    <li key={a.caminho} className="flex items-center gap-1.5 rounded-full bg-superficie py-1 pl-2.5 pr-1.5 text-xs text-texto ring-1 ring-borda">
                      <span className="max-w-[180px] truncate">{a.nome}</span>
                      <span className="text-texto-fraco">{tamanhoLegivel(a.tamanho)}</span>
                      <button
                        onClick={() => { setPendentes((l) => l.filter((x) => x.caminho !== a.caminho)); void apagarArquivo(criarClienteNavegador(), a.caminho); }}
                        className="rounded-full p-0.5 text-texto-fraco hover:bg-erro-suave hover:text-erro"
                        aria-label={`Remover ${a.nome}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-end gap-2">
                {!editando && (
                  <BotaoAnexar pasta="chat" donoId={ativa.id} somenteIcone variante="fantasma" rotulo="Anexar imagem ou arquivo" aoEnviar={(novos) => setPendentes((l) => [...l, ...novos].slice(0, 10))} />
                )}
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void enviar();
                    }
                    if (e.key === 'Escape' && editando) { setEditando(null); setTexto(''); }
                  }}
                  rows={Math.min(6, Math.max(1, texto.split('\n').length))}
                  maxLength={8000}
                  placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter quebra a linha)"
                  aria-label="Mensagem"
                  className="min-h-10 flex-1 resize-none rounded-lg border border-borda-forte bg-white px-3 py-2 text-sm leading-relaxed text-texto placeholder:text-texto-fraco hover:border-marca-300 focus:border-marca-500 focus:outline-none"
                />
                <Botao tamanho="icone" className="h-10 w-10" onClick={() => void enviar()} carregando={enviando} disabled={!texto.trim() && pendentes.length === 0} aria-label={editando ? 'Salvar edição' : 'Enviar mensagem'}>
                  {!enviando && (editando ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />)}
                </Botao>
              </div>
            </footer>
          </>
        )}
      </section>

      {nova && (
        <NovaConversa
          pessoas={pessoas}
          aoFechar={() => setNova(false)}
          aoAbrir={async (id) => {
            setNova(false);
            await carregarConversas();
            void abrir(id);
          }}
        />
      )}

      {detalhes && ativa && (
        <DetalhesGrupo
          conversa={ativa}
          meuId={meuId}
          souAdmin={souAdmin}
          pessoas={pessoas}
          aoFechar={() => setDetalhes(false)}
          aoMudar={() => void carregarConversas()}
          aoSair={() => { setDetalhes(false); setAtivaId(null); void carregarConversas(); }}
        />
      )}

      <ModalConfirmacao
        aberto={Boolean(apagar)}
        aoFechar={() => setApagar(null)}
        aoConfirmar={() => void apagarMensagem()}
        titulo="Apagar esta mensagem?"
        mensagem="O texto e os arquivos somem para todos os participantes. Fica apenas o aviso de que uma mensagem foi apagada."
        rotuloConfirmar="Apagar"
      />
    </div>
  );
}

function Mensagem({
  mensagem: m,
  minha,
  agrupada,
  autor,
  emDestaque,
  aoEditar,
  aoApagar,
}: {
  mensagem: MensagemChat;
  minha: boolean;
  agrupada: boolean;
  autor: { id: string; nome: string };
  emDestaque: boolean;
  aoEditar: () => void;
  aoApagar: () => void;
}) {
  const ancora = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const apagada = Boolean(m.excluida_em);

  return (
    <div className={cn('group flex gap-2.5', minha && 'flex-row-reverse', agrupada ? 'mt-0.5' : 'mt-3')}>
      <div className="w-8 shrink-0">{!agrupada && !minha && <AvatarPessoa pessoa={autor} tamanho="md" className="ring-0" />}</div>
      <div className={cn('flex min-w-0 max-w-[min(78%,640px)] flex-col', minha ? 'items-end' : 'items-start')}>
        {!agrupada && (
          <p className="mb-0.5 px-1 text-[11px] text-texto-fraco">
            {!minha && <span className="font-semibold text-texto-suave">{autor.nome} · </span>}
            <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString('pt-BR')}>{hora(m.created_at)}</time>
          </p>
        )}
        <div className={cn('flex items-center gap-1', minha && 'flex-row-reverse')}>
          <div
            className={cn(
              'min-w-0 rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-shadow',
              apagada
                ? 'border border-dashed border-borda-forte bg-transparent italic text-texto-fraco'
                : minha
                  ? 'rounded-tr-md bg-marca-700 text-white'
                  : 'rounded-tl-md border border-borda bg-white text-texto',
              emDestaque && 'ring-2 ring-alerta ring-offset-2',
            )}
            title={agrupada ? new Date(m.created_at).toLocaleString('pt-BR') : undefined}
          >
            {apagada ? (
              'Mensagem apagada'
            ) : (
              <>
                {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                {m.anexos.length > 0 && <ListaAnexos anexos={m.anexos} className={cn(m.texto && 'mt-2')} />}
                {m.editada_em && <span className={cn('ml-1 text-[10px]', minha ? 'text-white/70' : 'text-texto-fraco')}>(editada)</span>}
              </>
            )}
          </div>
          {minha && !apagada && (
            <>
              <button ref={ancora} onClick={() => setMenu((v) => !v)} className="rounded p-1 text-texto-fraco opacity-0 hover:bg-white hover:text-texto focus:opacity-100 group-hover:opacity-100" aria-label="Opções da mensagem"><MoreVertical className="h-4 w-4" /></button>
              <Popover ancora={ancora} aberto={menu} aoFechar={() => setMenu(false)} largura={150} alinhamento="fim">
                <div className="py-1">
                  {m.texto && <button onClick={() => { setMenu(false); aoEditar(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-superficie"><Pencil className="h-3.5 w-3.5" /> Editar</button>}
                  <button onClick={() => { setMenu(false); aoApagar(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-erro hover:bg-erro-suave"><Trash2 className="h-3.5 w-3.5" /> Apagar</button>
                </div>
              </Popover>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NovaConversa({ pessoas, aoFechar, aoAbrir }: { pessoas: PessoaEquipe[]; aoFechar: () => void; aoAbrir: (id: string) => void | Promise<void> }) {
  const { avisar } = useAvisos();
  const [modo, setModo] = useState<'pessoa' | 'grupo'>('pessoa');
  const [busca, setBusca] = useState('');
  const [nome, setNome] = useState('');
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const filtradas = pessoas.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  async function chamar(funcao: string, parametros: Record<string, unknown>) {
    setOcupado(true);
    const { data, error } = await criarClienteNavegador().rpc(funcao, parametros);
    setOcupado(false);
    if (error || !data) return avisar('erro', error?.message ?? 'Não foi possível abrir a conversa.');
    await aoAbrir(data as string);
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Nova conversa"
      largura="md"
      rodape={
        modo === 'grupo' ? (
          <>
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao carregando={ocupado} disabled={!nome.trim() || escolhidas.length === 0} onClick={() => void chamar('chat_criar_grupo', { p_nome: nome.trim(), p_participantes: escolhidas })}>Criar grupo</Botao>
          </>
        ) : undefined
      }
    >
      <div className="mb-4 flex rounded-lg bg-superficie p-0.5 ring-1 ring-borda" role="tablist">
        {([['pessoa', 'Conversa individual'], ['grupo', 'Grupo']] as const).map(([v, rotulo]) => (
          <button key={v} role="tab" aria-selected={modo === v} onClick={() => setModo(v)} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium', modo === v ? 'bg-white text-marca-800 shadow-sm' : 'text-texto-suave')}>{rotulo}</button>
        ))}
      </div>

      {modo === 'pessoa' ? (
        <>
          <Campo autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colega…" iconeInicial={<Search className="h-4 w-4" />} aria-label="Buscar colega" />
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {filtradas.map((p) => (
              <li key={p.id}>
                <button disabled={ocupado} onClick={() => void chamar('chat_abrir_direta', { p_usuario: p.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-superficie disabled:opacity-60">
                  <AvatarPessoa pessoa={p} tamanho="md" className="ring-0" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-texto">{p.nome}</span><span className="block text-xs text-texto-fraco">{rotuloArea(p.area)}</span></span>
                </button>
              </li>
            ))}
            {filtradas.length === 0 && <li className="px-2 py-6 text-center text-sm text-texto-fraco">Ninguém encontrado.</li>}
          </ul>
        </>
      ) : (
        <div className="space-y-4">
          <button disabled={ocupado} onClick={() => void chamar('chat_grupo_departamento', {})} className="flex w-full items-center gap-3 rounded-xl border border-marca-100 bg-marca-50 px-3 py-3 text-left hover:border-marca-300 disabled:opacity-60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-marca-700"><Users className="h-4 w-4" /></span>
            <span><span className="block text-sm font-semibold text-marca-800">Abrir o grupo do meu departamento</span><span className="block text-xs text-texto-suave">Reúne automaticamente todos os colegas ativos do seu time.</span></span>
          </button>
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-texto-fraco"><span className="h-px flex-1 bg-borda" />ou crie um grupo<span className="h-px flex-1 bg-borda" /></div>
          <Campo rotulo="Nome do grupo" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fechamento mensal" />
          <SeletorPessoas rotulo="Participantes" pessoas={pessoas} selecionadas={escolhidas} aoMudar={setEscolhidas} vazio="Escolha quem participa" />
        </div>
      )}
    </Modal>
  );
}

function DetalhesGrupo({
  conversa,
  meuId,
  souAdmin,
  pessoas,
  aoFechar,
  aoMudar,
  aoSair,
}: {
  conversa: ConversaChat;
  meuId: string;
  souAdmin: boolean;
  pessoas: PessoaEquipe[];
  aoFechar: () => void;
  aoMudar: () => void;
  aoSair: () => void;
}) {
  const { avisar } = useAvisos();
  const administra = souAdmin || conversa.meu_papel === 'admin' || conversa.criado_por === meuId;
  const [nome, setNome] = useState(conversa.nome ?? '');
  const [adicionando, setAdicionando] = useState<string[]>([]);
  const fora = pessoas.filter((p) => !conversa.participantes.some((x) => x.id === p.id));

  async function gerenciar(usuario: string, acao: 'adicionar' | 'remover') {
    const { error } = await criarClienteNavegador().rpc('chat_gerenciar_participante', { p_conversa: conversa.id, p_usuario: usuario, p_acao: acao });
    if (error) return avisar('erro', error.message);
    if (usuario === meuId && acao === 'remover') return aoSair();
    aoMudar();
  }

  async function renomear() {
    if (!nome.trim() || nome.trim() === conversa.nome) return;
    const { error } = await criarClienteNavegador().rpc('chat_renomear', { p_conversa: conversa.id, p_nome: nome.trim() });
    if (error) return avisar('erro', error.message);
    avisar('sucesso', 'Grupo renomeado.');
    aoMudar();
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Participantes do grupo" largura="md" rodape={<Botao onClick={aoFechar}>Fechar</Botao>}>
      {!conversa.departamento && (
        <form className="mb-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void renomear(); }}>
          <Campo rotulo="Nome do grupo" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          <Botao type="submit" variante="secundario" className="h-10 shrink-0" disabled={!nome.trim() || nome.trim() === conversa.nome}>Renomear</Botao>
        </form>
      )}
      <ul className="divide-y divide-borda rounded-lg border border-borda">
        {conversa.participantes.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <AvatarPessoa pessoa={p} tamanho="md" className="ring-0" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-texto">{p.nome}{p.id === meuId && ' (você)'}</span><span className="block text-xs text-texto-fraco">{p.papel === 'admin' ? 'Administra o grupo' : rotuloArea(p.area)}</span></span>
            {p.id === meuId ? (
              <Botao variante="fantasma" tamanho="sm" className="text-erro hover:bg-erro-suave hover:text-erro" onClick={() => void gerenciar(p.id, 'remover')}><LogOut className="h-3.5 w-3.5" /> Sair</Botao>
            ) : administra ? (
              <button onClick={() => void gerenciar(p.id, 'remover')} className="rounded p-1.5 text-texto-fraco hover:bg-erro-suave hover:text-erro" aria-label={`Remover ${p.nome}`} title="Remover do grupo"><X className="h-4 w-4" /></button>
            ) : null}
          </li>
        ))}
      </ul>
      {administra && fora.length > 0 && (
        <div className="mt-4 space-y-2">
          <SeletorPessoas rotulo="Adicionar pessoas" pessoas={fora} selecionadas={adicionando} aoMudar={setAdicionando} vazio="Escolha quem entra" />
          <Botao
            variante="secundario"
            tamanho="sm"
            disabled={adicionando.length === 0}
            onClick={async () => {
              for (const id of adicionando) await gerenciar(id, 'adicionar');
              setAdicionando([]);
            }}
          >
            <UserPlus className="h-4 w-4" /> Adicionar ao grupo
          </Botao>
        </div>
      )}
      <p className="mt-4 text-xs text-texto-fraco">Quem sai deixa de receber as mensagens novas; o histórico continua guardado para os demais participantes.</p>
    </Modal>
  );
}
