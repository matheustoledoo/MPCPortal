'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ArrowUp, Loader2 } from 'lucide-react';

import { CartaoPost } from '@/components/forum/CartaoPost';
import { useForum } from '@/components/forum/comum';
import { caminhosDosPosts } from '@/lib/forum';
import type { PostForum } from '@/types/banco';

export type ModoLista = 'todos' | 'seguindo' | 'em_alta' | 'salvos' | 'perfil' | 'respostas' | 'curtidas' | 'midia' | 'tag' | 'busca';

const LOTE = 20;

/**
 * Uma lista de posts de `forum_listar`, com rolagem infinita. No feed geral
 * e no "Seguindo", posts novos de outras pessoas aparecem como um aviso no
 * topo (sem empurrar o que a pessoa está lendo).
 */
export function ListaPosts({
  modo,
  autor,
  tag,
  busca,
  vazio,
  topo,
  versao = 0,
}: {
  modo: ModoLista;
  autor?: string;
  tag?: string;
  busca?: string;
  vazio: ReactNode;
  /** Algo para ficar acima da lista (o compositor, no feed). */
  topo?: ReactNode;
  /** Mudar este número recarrega a lista (ex.: depois de publicar). */
  versao?: number;
}) {
  const { supabase, carregarUrls, eu } = useForum();
  const [posts, setPosts] = useState<PostForum[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [fim, setFim] = useState(false);
  const [novos, setNovos] = useState(0);
  const sentinela = useRef<HTMLDivElement>(null);
  const carregandoMais = useRef(false);

  const buscar = useCallback(
    async (antes: string | null) => {
      const { data, error } = await supabase.rpc('forum_listar', {
        p_modo: modo,
        p_limite: LOTE,
        p_antes: antes,
        p_autor: autor ?? null,
        p_tag: tag ?? null,
        p_busca: busca ?? null,
      });
      if (error) throw new Error(error.message);
      const lista = (data ?? []) as PostForum[];
      void carregarUrls(caminhosDosPosts(lista));
      return lista;
    },
    [supabase, modo, autor, tag, busca, carregarUrls],
  );

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setFim(false);
    setNovos(0);
    buscar(null)
      .then((lista) => {
        if (!ativo) return;
        setPosts(lista);
        // "Em alta" ordena por engajamento: não dá para paginar por data.
        setFim(lista.length < LOTE || modo === 'em_alta');
      })
      .catch(() => ativo && setPosts([]))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [buscar, versao, modo]);

  const carregarMais = useCallback(async () => {
    if (carregandoMais.current || fim || posts.length === 0) return;
    carregandoMais.current = true;
    try {
      // Fixados vêm no topo da primeira página; o cursor é o post mais antigo.
      const maisAntigo = posts.reduce((m, p) => (p.created_at < m ? p.created_at : m), posts[0].created_at);
      const lista = await buscar(maisAntigo);
      setPosts((atuais) => [...atuais, ...lista.filter((p) => !atuais.some((a) => a.id === p.id))]);
      if (lista.length < LOTE) setFim(true);
    } finally {
      carregandoMais.current = false;
    }
  }, [buscar, fim, posts]);

  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo) return;
    const observador = new IntersectionObserver((entradas) => entradas[0]?.isIntersecting && void carregarMais(), { rootMargin: '600px' });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [carregarMais]);

  // Tempo real: posts novos de outras pessoas no feed.
  useEffect(() => {
    if (modo !== 'todos' && modo !== 'seguindo') return;
    const canal = supabase
      .channel(`forum:${modo}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_posts' }, (carga) => {
        const novo = carga.new as { pai_id: string | null; autor_id: string };
        if (!novo.pai_id && novo.autor_id !== eu.id) setNovos((n) => n + 1);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, modo, eu.id]);

  async function mostrarNovos() {
    const lista = await buscar(null);
    setPosts(lista);
    setNovos(0);
    setFim(lista.length < LOTE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div>
      {topo}
      {novos > 0 && (
        <div className="sticky top-16 z-10 flex justify-center py-2">
          <button onClick={() => void mostrarNovos()} className="animar-surgir inline-flex items-center gap-1.5 rounded-full bg-marca-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg hover:bg-marca-700">
            <ArrowUp className="h-4 w-4" /> {novos} post{novos > 1 ? 's' : ''} novo{novos > 1 ? 's' : ''}
          </button>
        </div>
      )}
      {carregando ? (
        <div className="space-y-4 p-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="px-6 py-14 text-center">{vazio}</div>
      ) : (
        <>
          {posts.map((post) => (
            <CartaoPost
              key={post.id}
              post={post}
              aoMudar={(novo) => setPosts((atuais) => atuais.map((p) => (p.id === novo.id ? novo : p)))}
              aoExcluir={(id) => setPosts((atuais) => atuais.filter((p) => p.id !== id))}
            />
          ))}
          <div ref={sentinela} className="flex justify-center py-6 text-sm text-texto-fraco">
            {fim ? (posts.length > 5 ? 'Você viu tudo por aqui. 👀' : null) : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        </>
      )}
    </div>
  );
}
