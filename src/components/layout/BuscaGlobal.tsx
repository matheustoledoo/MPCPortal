'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ClipboardList,
  CornerDownLeft,
  Loader2,
  MapPin,
  MessagesSquare,
  Search,
  User,
} from 'lucide-react';

import { cn } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';

interface ItemBusca {
  id: string | number;
  titulo: string;
  detalhe?: string;
  uf?: string;
  data?: string;
}

type ResultadoBusca = Partial<Record<'empresas' | 'processos' | 'posts' | 'pessoas' | 'cidades' | 'agenda', ItemBusca[]>>;

interface Opcao {
  chave: string;
  grupo: string;
  titulo: string;
  detalhe?: string;
  href: string;
  icone: typeof Search;
}

const GRUPOS: {
  chave: keyof ResultadoBusca;
  rotulo: string;
  icone: typeof Search;
  href: (i: ItemBusca) => string;
  /** Rota que precisa poder abrir para o atalho fazer sentido. */
  rota: string;
}[] = [
  { chave: 'empresas', rotulo: 'Empresas', icone: Building2, href: (i) => `/legalizacao?empresa=${i.id}`, rota: '/legalizacao' },
  { chave: 'processos', rotulo: 'Controle Legalização', icone: ClipboardList, href: (i) => `/controle-legalizacao?processo=${i.id}`, rota: '/controle-legalizacao' },
  { chave: 'agenda', rotulo: 'Calendário', icone: CalendarDays, href: (i) => `/calendario?data=${i.data ?? ''}`, rota: '/calendario' },
  { chave: 'posts', rotulo: 'Fórum da Meta', icone: MessagesSquare, href: (i) => `/forum/post/${i.id}`, rota: '/forum' },
  { chave: 'pessoas', rotulo: 'Pessoas', icone: User, href: (i) => `/forum/perfil/${i.id}`, rota: '/forum' },
  { chave: 'cidades', rotulo: 'Cidades', icone: MapPin, href: (i) => `/referencias?municipio=${i.id}`, rota: '/referencias' },
];

/**
 * Busca do portal inteiro — Ctrl+K (ou ⌘K) de qualquer tela. Cada bloco do
 * resultado respeita a RLS de quem pesquisa (`busca_global`).
 */
export function BuscaGlobal({ telas }: { telas: { rotulo: string; href: string }[] }) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultado, setResultado] = useState<ResultadoBusca>({});
  const [carregando, setCarregando] = useState(false);
  const [destacado, setDestacado] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberto((v) => !v);
      }
    }
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  useEffect(() => {
    if (aberto) {
      setTimeout(() => entrada.current?.focus(), 20);
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    setTermo('');
    setResultado({});
  }, [aberto]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setResultado({});
      return;
    }
    setCarregando(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('busca_global', { p_termo: t });
      setResultado((data ?? {}) as ResultadoBusca);
      setCarregando(false);
      setDestacado(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [termo, supabase]);

  const podeAbrir = (rota: string) => telas.some((t) => t.href === rota);

  const opcoes = useMemo((): Opcao[] => {
    const t = termo.trim().toLowerCase();
    const atalhos: Opcao[] = telas
      .filter((tela) => !t || tela.rotulo.toLowerCase().includes(t))
      .slice(0, t ? 4 : 8)
      .map((tela) => ({ chave: `tela:${tela.href}`, grupo: 'Ir para', titulo: tela.rotulo, href: tela.href, icone: ArrowRight }));
    const encontrados = GRUPOS.filter((g) => podeAbrir(g.rota)).flatMap((g) =>
      (resultado[g.chave] ?? []).map((item) => ({
        chave: `${g.chave}:${item.id}`,
        grupo: g.rotulo,
        titulo: item.titulo,
        detalhe: item.detalhe,
        href: g.href(item),
        icone: g.icone,
      })),
    );
    return t ? [...encontrados, ...atalhos] : atalhos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, resultado, telas]);

  function escolher(opcao: Opcao | undefined) {
    if (!opcao) return;
    setAberto(false);
    router.push(opcao.href);
  }

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${destacado}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [destacado]);

  const gatilho = (
    <button
      type="button"
      onClick={() => setAberto(true)}
      className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-borda bg-superficie px-3 text-sm text-texto-fraco transition-colors hover:border-marca-300 hover:text-texto-suave"
      aria-label="Buscar no portal (Ctrl+K)"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden flex-1 truncate text-left sm:inline">Buscar empresas, processos, pessoas, cidades…</span>
      <kbd className="ml-auto hidden rounded border border-borda bg-white px-1.5 font-sans text-[10px] font-semibold text-texto-suave md:inline">
        Ctrl K
      </kbd>
    </button>
  );

  let grupoAnterior = '';

  return (
    <>
      {gatilho}
      {aberto &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setAberto(false)} aria-hidden />
            <div role="dialog" aria-modal="true" aria-label="Buscar no portal" className="animar-surgir relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-superficie-elevada shadow-2xl">
              <div className="flex items-center gap-3 border-b border-borda px-4">
                {carregando ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-marca-600" />
                ) : (
                  <Search className="h-5 w-5 shrink-0 text-texto-fraco" />
                )}
                <input
                  ref={entrada}
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAberto(false);
                    else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setDestacado((i) => Math.min(opcoes.length - 1, i + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setDestacado((i) => Math.max(0, i - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      escolher(opcoes[destacado]);
                    }
                  }}
                  placeholder="Razão social, CNPJ, protocolo, @pessoa, cidade, compromisso…"
                  className="h-14 w-full bg-transparent text-base text-texto outline-none placeholder:text-texto-fraco"
                  aria-label="Termo da busca"
                />
                <kbd className="shrink-0 rounded border border-borda px-1.5 text-[10px] font-semibold text-texto-fraco">Esc</kbd>
              </div>

              <ul ref={lista} className="min-h-0 flex-1 overflow-y-auto p-2">
                {termo.trim().length >= 2 && !carregando && opcoes.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-texto-suave">Nada encontrado para “{termo.trim()}”.</li>
                )}
                {opcoes.map((opcao, indice) => {
                  const cabecalho = opcao.grupo !== grupoAnterior ? opcao.grupo : null;
                  grupoAnterior = opcao.grupo;
                  const Icone = opcao.icone;
                  return (
                    <li key={opcao.chave}>
                      {cabecalho && (
                        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">{cabecalho}</p>
                      )}
                      <button
                        type="button"
                        data-indice={indice}
                        onClick={() => escolher(opcao)}
                        onMouseEnter={() => setDestacado(indice)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          indice === destacado ? 'bg-marca-50' : 'hover:bg-superficie',
                        )}
                      >
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', indice === destacado ? 'bg-marca-100 text-marca-700' : 'bg-superficie text-texto-fraco')}>
                          <Icone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-texto">{opcao.titulo}</span>
                          {opcao.detalhe && <span className="block truncate text-xs text-texto-suave">{opcao.detalhe}</span>}
                        </span>
                        {indice === destacado && <CornerDownLeft className="h-4 w-4 shrink-0 text-texto-fraco" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-4 border-t border-borda bg-superficie px-4 py-2 text-[11px] text-texto-fraco">
                <span>↑↓ navegar</span>
                <span>Enter abrir</span>
                <span>Esc fechar</span>
                <span className="ml-auto">A busca só mostra o que você tem permissão para ver.</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
