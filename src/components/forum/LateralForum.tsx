'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dices, Hash, Search, TrendingUp, UserPlus, Users } from 'lucide-react';

import { Avatar, useForum } from '@/components/forum/comum';
import { BotaoSeguir } from '@/components/forum/BotaoSeguir';
import { cn } from '@/components/ui';
import { rotuloArea } from '@/lib/permissoes';
import type { PessoaForum, PostForum } from '@/types/banco';

/** A coluna da direita: pesquisa, assuntos do momento e quem seguir. */
export function LateralForum({ buscaInicial = '' }: { buscaInicial?: string }) {
  const { supabase, carregarUrls } = useForum();
  const router = useRouter();
  const [busca, setBusca] = useState(buscaInicial);
  const [tendencias, setTendencias] = useState<{ tag: string; posts: number }[]>([]);
  const [pessoas, setPessoas] = useState<PessoaForum[]>([]);
  const [sorteando, setSorteando] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.rpc('forum_tendencias', { p_dias: 14 }),
        supabase.rpc('forum_pessoas', { p_limite: 6 }),
      ]);
      setTendencias((t ?? []) as { tag: string; posts: number }[]);
      const lista = (p ?? []) as PessoaForum[];
      setPessoas(lista);
      void carregarUrls(lista.map((x) => x.avatar_path ?? '').filter(Boolean));
    })();
  }, [supabase, carregarUrls]);

  /** "Me surpreenda": abre um post qualquer da história do Fórum. */
  async function surpreender() {
    setSorteando(true);
    const { data } = await supabase.rpc('forum_listar', { p_modo: 'todos', p_limite: 200 });
    const lista = (data ?? []) as PostForum[];
    setSorteando(false);
    if (lista.length) router.push(`/forum/post/${lista[Math.floor(Math.random() * lista.length)].id}`);
  }

  return (
    <aside className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const termo = busca.trim();
          router.push(termo ? `/forum?q=${encodeURIComponent(termo)}` : '/forum');
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar posts, #assuntos, pessoas…"
          className="h-11 w-full rounded-full border border-borda bg-superficie pl-10 pr-4 text-sm outline-none transition-colors focus:border-marca-400 focus:bg-white"
          aria-label="Buscar no Fórum"
        />
      </form>

      <section className="overflow-hidden rounded-2xl border border-borda bg-superficie-elevada">
        <h2 className="flex items-center gap-2 px-4 pt-3 text-base font-bold text-texto">
          <TrendingUp className="h-4 w-4 text-marca-600" /> Assuntos do momento
        </h2>
        {tendencias.length === 0 ? (
          <p className="px-4 py-3 text-sm text-texto-suave">Use #assunto nos posts e ele aparece aqui.</p>
        ) : (
          <ul className="py-1">
            {tendencias.map((t, i) => (
              <li key={t.tag}>
                <Link href={`/forum?tag=${encodeURIComponent(t.tag)}`} className="block px-4 py-2 transition-colors hover:bg-superficie">
                  <p className="text-[11px] text-texto-fraco">{i + 1} · Na Meta</p>
                  <p className="flex items-center gap-0.5 text-sm font-semibold text-texto">
                    <Hash className="h-3.5 w-3.5 text-texto-fraco" />
                    {t.tag}
                  </p>
                  <p className="text-[11px] text-texto-fraco">{t.posts} post{t.posts > 1 ? 's' : ''}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-borda bg-superficie-elevada">
        <h2 className="flex items-center gap-2 px-4 pt-3 text-base font-bold text-texto">
          <UserPlus className="h-4 w-4 text-marca-600" /> Quem seguir
        </h2>
        <ul className="py-1">
          {pessoas.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-superficie">
              <Link href={`/forum/perfil/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar pessoa={p} tamanho="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-texto">{p.nome}</span>
                  <span className="block truncate text-xs text-texto-suave">
                    @{p.apelido}
                    {p.area ? ` · ${rotuloArea(p.area)}` : ''}
                  </span>
                </span>
              </Link>
              <BotaoSeguir
                pessoaId={p.id}
                sigo={p.eu_sigo}
                aoMudar={(sigo) => setPessoas((lista) => lista.map((x) => (x.id === p.id ? { ...x, eu_sigo: sigo } : x)))}
                compacto
              />
            </li>
          ))}
        </ul>
        <Link href="/forum/pessoas" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-marca-700 hover:bg-superficie">
          <Users className="h-4 w-4" /> Ver toda a equipe
        </Link>
      </section>

      <button
        onClick={() => void surpreender()}
        disabled={sorteando}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-marca-300 px-4 py-3 text-sm font-medium text-marca-700 transition-colors hover:bg-marca-50',
          sorteando && 'opacity-60',
        )}
      >
        <Dices className={cn('h-4 w-4', sorteando && 'animate-spin')} /> Me surpreenda — abrir um post aleatório
      </button>

      <p className="px-2 text-[11px] leading-relaxed text-texto-fraco">
        O Fórum é interno: só a equipe da Meta Plano, logada no portal, vê os posts e as fotos.
      </p>
    </aside>
  );
}
