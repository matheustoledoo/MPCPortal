'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import Link from 'next/link';

import { cn } from '@/components/ui';
import { corDaPessoa, iniciais, quebrarTexto, urlsAssinadas } from '@/lib/forum';
import { criarClienteNavegador } from '@/lib/supabase/client';

export interface EuNoForum {
  id: string;
  nome: string;
  apelido: string | null;
  avatar_path: string | null;
  moderador: boolean;
}

interface ValorContexto {
  eu: EuNoForum;
  supabase: ReturnType<typeof criarClienteNavegador>;
  urls: Record<string, string>;
  carregarUrls: (caminhos: string[]) => Promise<void>;
}

const Contexto = createContext<ValorContexto | null>(null);

/** Quem está usando o Fórum e as URLs assinadas das fotos já pedidas. */
export function ProvedorForum({ eu, children }: { eu: EuNoForum; children: ReactNode }) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pedidas = useRef(new Set<string>());

  const carregarUrls = useCallback(
    async (caminhos: string[]) => {
      const novos = caminhos.filter((c) => c && !pedidas.current.has(c));
      if (!novos.length) return;
      novos.forEach((c) => pedidas.current.add(c));
      const assinadas = await urlsAssinadas(supabase, novos);
      setUrls((atuais) => ({ ...atuais, ...assinadas }));
    },
    [supabase],
  );

  useEffect(() => {
    if (eu.avatar_path) void carregarUrls([eu.avatar_path]);
  }, [eu.avatar_path, carregarUrls]);

  const valor = useMemo(() => ({ eu, supabase, urls, carregarUrls }), [eu, supabase, urls, carregarUrls]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useForum() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useForum precisa estar dentro de <ProvedorForum>.');
  return c;
}

const TAMANHOS = { xs: 'h-6 w-6 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-20 w-20 text-2xl', xl: 'h-28 w-28 text-3xl' };

export function Avatar({
  pessoa,
  tamanho = 'md',
  className,
}: {
  pessoa: { id: string; nome: string; avatar_path?: string | null } | null | undefined;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const { urls } = useForum();
  const url = pessoa?.avatar_path ? urls[pessoa.avatar_path] : null;
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white', TAMANHOS[tamanho], className)}
      style={{ background: url ? undefined : corDaPessoa(pessoa?.id ?? '?') }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciais(pessoa?.nome)
      )}
    </span>
  );
}

/** Texto do post com @menções, #assuntos e links clicáveis. */
export function TextoPost({ texto, grande = false }: { texto: string; grande?: boolean }) {
  const pedacos = useMemo(() => quebrarTexto(texto), [texto]);
  return (
    <p className={cn('whitespace-pre-wrap break-words text-texto', grande ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-normal')}>
      {pedacos.map((p, i) => {
        switch (p.tipo) {
          case 'mencao':
            return (
              <Link key={i} href={`/forum/perfil/${encodeURIComponent('@' + p.valor)}`} className="font-medium text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                @{p.valor}
              </Link>
            );
          case 'tag':
            return (
              <Link key={i} href={`/forum?tag=${encodeURIComponent(p.valor)}`} className="font-medium text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                #{p.valor}
              </Link>
            );
          case 'link':
            return (
              <a key={i} href={p.valor} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-info hover:underline" onClick={(e) => e.stopPropagation()}>
                {p.valor.replace(/^https?:\/\//, '').slice(0, 60)}
                {p.valor.replace(/^https?:\/\//, '').length > 60 ? '…' : ''}
              </a>
            );
          default:
            return <span key={i}>{p.valor}</span>;
        }
      })}
    </p>
  );
}
