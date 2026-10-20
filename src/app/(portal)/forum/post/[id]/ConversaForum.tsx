'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { CartaoPost } from '@/components/forum/CartaoPost';
import { Compositor } from '@/components/forum/Compositor';
import { LateralForum } from '@/components/forum/LateralForum';
import { ProvedorForum, useForum, type EuNoForum } from '@/components/forum/comum';
import { caminhosDosPosts } from '@/lib/forum';
import type { PostForum } from '@/types/banco';

/** O post e a conversa inteira, com as respostas em fio. */
export function ConversaForum({ eu, raizId }: { eu: EuNoForum; raizId: string }) {
  return (
    <ProvedorForum eu={eu}>
      <div className="mx-auto grid max-w-6xl gap-6 px-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-5">
        <Conversa raizId={raizId} />
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <LateralForum />
          </div>
        </div>
      </div>
    </ProvedorForum>
  );
}

function Conversa({ raizId }: { raizId: string }) {
  const { supabase, carregarUrls } = useForum();
  const router = useRouter();
  const [posts, setPosts] = useState<PostForum[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('forum_listar', { p_modo: 'conversa', p_post: raizId, p_limite: 200 });
    const lista = (data ?? []) as PostForum[];
    setPosts(lista);
    void carregarUrls(caminhosDosPosts(lista));
    setCarregando(false);
  }, [supabase, raizId, carregarUrls]);

  useEffect(() => {
    void carregar();
    // Respostas novas de outras pessoas entram sozinhas.
    const canal = supabase
      .channel(`conversa:${raizId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_posts', filter: `raiz_id=eq.${raizId}` }, () => void carregar())
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregar, supabase, raizId]);

  // Rola até a resposta indicada no endereço (#p-<id>).
  useEffect(() => {
    if (carregando || !window.location.hash) return;
    const el = document.querySelector(window.location.hash);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('bg-marca-50');
      setTimeout(() => el.classList.remove('bg-marca-50'), 2500);
    }
  }, [carregando]);

  const raiz = posts.find((p) => p.id === raizId) ?? null;

  /** Respostas em profundidade: cada uma seguida das respostas a ela. */
  const fio = useMemo(() => {
    const filhos = new Map<string, PostForum[]>();
    for (const p of posts) {
      if (!p.pai_id) continue;
      filhos.set(p.pai_id, [...(filhos.get(p.pai_id) ?? []), p]);
    }
    const saida: { post: PostForum; nivel: number; temFilho: boolean }[] = [];
    const visitar = (id: string, nivel: number) => {
      for (const filho of filhos.get(id) ?? []) {
        const temFilho = (filhos.get(filho.id)?.length ?? 0) > 0;
        saida.push({ post: filho, nivel, temFilho });
        visitar(filho.id, nivel + 1);
      }
    };
    visitar(raizId, 0);
    return saida;
  }, [posts, raizId]);

  const mudar = (novo: PostForum) => setPosts((atuais) => atuais.map((p) => (p.id === novo.id ? novo : p)));

  return (
    <main className="min-w-0 border-borda bg-superficie-elevada sm:rounded-2xl sm:border">
      <div className="sticky top-14 z-10 flex items-center gap-4 border-b border-borda bg-superficie-elevada/95 px-4 py-3 backdrop-blur sm:rounded-t-2xl">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/forum'))} className="rounded-full p-2 hover:bg-superficie" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-texto">Post</h1>
      </div>

      {carregando ? (
        <div className="space-y-3 p-6" aria-hidden>
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      ) : !raiz ? (
        <div className="px-6 py-14 text-center">
          <p className="text-lg font-bold text-texto">Este post não existe mais</p>
          <p className="mt-1 text-sm text-texto-suave">Pode ter sido apagado por quem escreveu.</p>
          <Link href="/forum" className="mt-3 inline-block text-sm font-medium text-marca-700 hover:underline">
            Voltar ao Fórum
          </Link>
        </div>
      ) : (
        <>
          <CartaoPost post={raiz} destaque aoMudar={mudar} aoExcluir={() => router.push('/forum')} />
          <div className="border-b border-borda">
            <Compositor paiId={raiz.id} placeholder={`Responder a @${raiz.autor?.apelido ?? ''}`} aoPublicar={() => void carregar()} />
          </div>
          {fio.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-texto-suave">Nenhuma resposta ainda. Comece a conversa!</p>
          ) : (
            fio.map(({ post, nivel, temFilho }) => (
              <div key={post.id} style={{ paddingLeft: Math.min(nivel, 4) * 24 }} className="border-b border-borda last:border-b-0">
                <CartaoPost
                  post={post}
                  semBorda
                  linhaAbaixo={temFilho}
                  aoMudar={mudar}
                  aoExcluir={(id) => setPosts((atuais) => atuais.filter((p) => p.id !== id && p.pai_id !== id))}
                />
              </div>
            ))
          )}
        </>
      )}
    </main>
  );
}
