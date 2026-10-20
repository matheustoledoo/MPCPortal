'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  Handshake,
  Info,
  MessagesSquare,
  UserCheck,
  X,
} from 'lucide-react';

import { Popover } from '@/components/ui/Popover';
import { Botao, cn } from '@/components/ui';
import {
  acaoDeOrigem,
  concluirOrigem,
  marcarNotificacoes,
  tempoRelativo,
} from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CategoriaNotificacao, ContagemNotificacoes, Notificacao } from '@/types/banco';

export const ICONE_CATEGORIA: Record<CategoriaNotificacao, typeof Bell> = {
  prazo: Clock,
  processo: ClipboardList,
  atribuicao: UserCheck,
  calendario: CalendarDays,
  forum: MessagesSquare,
  mencao: AtSign,
  integracao: Handshake,
  sistema: Info,
};

export const COR_PRIORIDADE: Record<string, string> = {
  urgente: 'bg-erro-suave text-erro ring-red-200',
  alta: 'bg-alerta-suave text-alerta ring-amber-200',
  normal: 'bg-marca-50 text-marca-700 ring-marca-200',
  baixa: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Ouvido pela página de notificações para se atualizar junto com o sininho. */
export const EVENTO_NOTIFICACOES = 'portalmpc:notificacoes';

/**
 * O sininho do topo. Ao abrir o portal ele pede ao banco para recalcular os
 * prazos da pessoa (`sincronizar_minhas_notificacoes`) e depois escuta em
 * tempo real: notificação nova aparece sem recarregar a página.
 */
export function SinoNotificacoes({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const ancora = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'nao_lidas' | 'todas'>('nao_lidas');
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [contagem, setContagem] = useState<ContagemNotificacoes | null>(null);
  const [tremer, setTremer] = useState(false);
  const ultimaContagem = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    const [{ data: c }, { data: itens }] = await Promise.all([
      supabase.rpc('contar_notificacoes'),
      supabase
        .from('notificacoes')
        .select('*')
        .is('arquivada_em', null)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    if (c) {
      const nova = c as ContagemNotificacoes;
      if (ultimaContagem.current !== null && nova.nao_lidas > ultimaContagem.current) {
        setTremer(true);
        setTimeout(() => setTremer(false), 1200);
      }
      ultimaContagem.current = nova.nao_lidas;
      setContagem(nova);
    }
    setLista((itens ?? []) as Notificacao[]);
    window.dispatchEvent(new Event(EVENTO_NOTIFICACOES));
  }, [supabase]);

  const sincronizar = useCallback(async () => {
    await supabase.rpc('sincronizar_minhas_notificacoes');
    await carregar();
  }, [supabase, carregar]);

  useEffect(() => {
    void sincronizar();

    const canal = supabase
      .channel(`notificacoes:${usuarioId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuarioId}` },
        () => void carregar(),
      )
      .subscribe();

    // Prazo muda com o relógio: reconfere a cada 10 minutos e ao voltar à aba.
    const intervalo = setInterval(() => void sincronizar(), 10 * 60_000);
    const aoVoltar = () => document.visibilityState === 'visible' && void sincronizar();
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener(EVENTO_NOTIFICACOES + ':recarregar', carregar);

    return () => {
      void supabase.removeChannel(canal);
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener(EVENTO_NOTIFICACOES + ':recarregar', carregar);
    };
  }, [supabase, usuarioId, carregar, sincronizar]);

  const naoLidas = contagem?.nao_lidas ?? 0;
  const urgentes = contagem?.urgentes ?? 0;
  const exibidas = aba === 'nao_lidas' ? lista.filter((n) => !n.lida_em) : lista;

  async function agir(n: Notificacao, acao: 'lida' | 'arquivar' | 'concluir') {
    // Otimista: some/atualiza já, o banco confirma em seguida.
    setLista((atual) =>
      acao === 'arquivar'
        ? atual.filter((x) => x.id !== n.id)
        : atual.map((x) =>
            x.id === n.id
              ? { ...x, lida_em: x.lida_em ?? new Date().toISOString(), concluida_em: acao === 'concluir' ? new Date().toISOString() : x.concluida_em }
              : x,
          ),
    );
    try {
      if (acao === 'concluir') await concluirOrigem(supabase, n, nome, usuarioId);
      else await marcarNotificacoes(supabase, [n.id], acao);
    } finally {
      void carregar();
    }
  }

  function abrir(n: Notificacao) {
    if (!n.lida_em) void agir(n, 'lida');
    setAberto(false);
    if (n.link) router.push(n.link);
  }

  return (
    <>
      <button
        ref={ancora}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie hover:text-texto',
          aberto && 'bg-marca-50 text-marca-700',
        )}
        aria-label={naoLidas ? `Notificações: ${naoLidas} não lida(s)` : 'Notificações'}
        title="Notificações"
      >
        {naoLidas > 0 ? (
          <BellRing className={cn('h-5 w-5', tremer && 'animate-[tremer_0.6s_ease-in-out_2]')} />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {naoLidas > 0 && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-superficie-elevada',
              urgentes > 0 ? 'bg-erro' : 'bg-marca-600',
            )}
          >
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      <Popover ancora={ancora} aberto={aberto} aoFechar={() => setAberto(false)} largura={400} alinhamento="fim" espaco={8}>
        <div className="flex items-center justify-between gap-2 border-b border-borda px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-texto">Notificações</p>
            <p className="text-[11px] text-texto-suave">
              {naoLidas ? `${naoLidas} não lida(s)` : 'Tudo em dia'}
              {urgentes ? ` · ${urgentes} urgente(s)` : ''}
            </p>
          </div>
          {naoLidas > 0 && (
            <button
              type="button"
              onClick={async () => {
                await marcarNotificacoes(supabase, [], 'todas_lidas');
                void carregar();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="flex gap-1 border-b border-borda px-3 pt-2">
          {(['nao_lidas', 'todas'] as const).map((chave) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={cn(
                'rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
                aba === chave ? 'border-marca-600 text-marca-800' : 'border-transparent text-texto-suave hover:text-texto',
              )}
            >
              {chave === 'nao_lidas' ? `Não lidas${naoLidas ? ` (${naoLidas})` : ''}` : 'Recentes'}
            </button>
          ))}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-borda overflow-y-auto">
          {exibidas.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sucesso-suave text-sucesso">
                <Check className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-texto">Nada pendente por aqui</p>
              <p className="text-xs text-texto-suave">Prazos, designações e o Fórum aparecem aqui na hora.</p>
            </li>
          )}
          {exibidas.slice(0, 20).map((n) => (
            <ItemNotificacao key={n.id} n={n} aoAbrir={() => abrir(n)} aoAgir={(acao) => void agir(n, acao)} />
          ))}
        </ul>

        <div className="border-t border-borda bg-superficie p-2">
          <Link
            href="/notificacoes"
            onClick={() => setAberto(false)}
            className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-marca-700 transition-colors hover:bg-white"
          >
            Abrir a central de notificações
          </Link>
        </div>
      </Popover>
    </>
  );
}

export function ItemNotificacao({
  n,
  aoAbrir,
  aoAgir,
  compacto = true,
}: {
  n: Notificacao;
  aoAbrir: () => void;
  aoAgir: (acao: 'lida' | 'arquivar' | 'concluir') => void;
  compacto?: boolean;
}) {
  const Icone = ICONE_CATEGORIA[n.categoria] ?? Info;
  const podeConcluir = !n.concluida_em && (acaoDeOrigem(n) !== null || n.categoria === 'prazo');
  return (
    <li className={cn('group relative flex gap-3 px-4 py-3 transition-colors hover:bg-superficie', !n.lida_em && 'bg-marca-50/40')}>
      {!n.lida_em && <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-marca-600" aria-hidden />}
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', COR_PRIORIDADE[n.prioridade])}>
        <Icone className="h-4 w-4" />
      </span>
      <button type="button" onClick={aoAbrir} className="min-w-0 flex-1 text-left">
        <p className={cn('text-sm leading-snug text-texto', !n.lida_em && 'font-semibold', n.concluida_em && 'line-through opacity-60')}>
          {n.titulo}
        </p>
        {n.mensagem && <p className={cn('mt-0.5 text-xs leading-relaxed text-texto-suave', compacto && 'line-clamp-2')}>{n.mensagem}</p>}
        <p className="mt-1 text-[11px] text-texto-fraco">{tempoRelativo(n.created_at)}</p>
      </button>
      <div className="flex shrink-0 flex-col gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        {podeConcluir && (
          <Botao
            variante="fantasma"
            tamanho="icone"
            className="h-7 w-7 text-sucesso hover:bg-sucesso-suave"
            onClick={() => aoAgir('concluir')}
            aria-label="Concluir"
            title={acaoDeOrigem(n) === 'calendario' ? 'Marcar a obrigação como concluída' : acaoDeOrigem(n) === 'atribuicao' ? 'Concluir o ciclo da atribuição' : 'Marcar como resolvida'}
          >
            <Check className="h-4 w-4" />
          </Botao>
        )}
        <Botao
          variante="fantasma"
          tamanho="icone"
          className="h-7 w-7"
          onClick={() => aoAgir('arquivar')}
          aria-label="Fechar notificação"
          title="Fechar (arquivar)"
        >
          <X className="h-4 w-4" />
        </Botao>
      </div>
    </li>
  );
}
