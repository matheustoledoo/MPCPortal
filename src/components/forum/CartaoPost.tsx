'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Repeat2,
  Trash2,
  X,
} from 'lucide-react';

import { Avatar, TextoPost, useForum } from '@/components/forum/comum';
import { Compositor } from '@/components/forum/Compositor';
import { Popover } from '@/components/ui/Popover';
import { Botao, Modal, ModalConfirmacao, cn, useAvisos } from '@/components/ui';
import { quando } from '@/lib/forum';
import { rotuloArea } from '@/lib/permissoes';
import type { PostForum } from '@/types/banco';

/**
 * Um post do Fórum — do jeito das redes sociais: autor, texto com @menções e
 * #assuntos, fotos, enquete, citação e a barra de ações.
 */
export function CartaoPost({
  post,
  aoMudar,
  aoExcluir,
  destaque = false,
  linhaAbaixo = false,
  semBorda = false,
}: {
  post: PostForum;
  aoMudar: (post: PostForum) => void;
  aoExcluir: (id: string) => void;
  /** O post principal de uma conversa: texto maior, data completa. */
  destaque?: boolean;
  /** Fio ligando ao post de baixo (respostas em sequência). */
  linhaAbaixo?: boolean;
  semBorda?: boolean;
}) {
  const { eu, supabase, urls } = useForum();
  const { avisar } = useAvisos();
  const router = useRouter();
  const [respondendo, setRespondendo] = useState(false);
  const [citando, setCitando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editando, setEditando] = useState(false);
  const [textoEdicao, setTextoEdicao] = useState(post.texto);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [foto, setFoto] = useState<number | null>(null);
  const [pulso, setPulso] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  const meu = post.autor?.id === eu.id;
  const podeModerar = eu.moderador;

  async function recarregar() {
    const { data } = await supabase.rpc('forum_listar', { p_modo: 'post', p_post: post.id, p_limite: 1 });
    const atualizado = (data as PostForum[] | null)?.[0];
    if (atualizado) aoMudar(atualizado);
  }

  async function curtir() {
    const curti = !post.curti;
    setPulso(curti);
    aoMudar({ ...post, curti, curtidas: post.curtidas + (curti ? 1 : -1) });
    const { error } = curti
      ? await supabase.from('forum_curtidas').insert({ post_id: post.id })
      : await supabase.from('forum_curtidas').delete().eq('post_id', post.id).eq('usuario_id', eu.id);
    if (error && error.code !== '23505') {
      aoMudar(post);
      avisar('erro', error.message);
    }
  }

  async function salvar() {
    const salvei = !post.salvei;
    aoMudar({ ...post, salvei });
    const { error } = salvei
      ? await supabase.from('forum_salvos').insert({ post_id: post.id })
      : await supabase.from('forum_salvos').delete().eq('post_id', post.id).eq('usuario_id', eu.id);
    if (error && error.code !== '23505') {
      aoMudar(post);
      avisar('erro', error.message);
    } else avisar('sucesso', salvei ? 'Post salvo — está na aba "Salvos".' : 'Removido dos salvos.');
  }

  async function votar(opcao: number) {
    const { error } = await supabase.from('forum_votos').insert({ post_id: post.id, opcao });
    if (error) {
      avisar('erro', error.message);
      return;
    }
    await recarregar();
  }

  async function salvarEdicao() {
    const { error } = await supabase.from('forum_posts').update({ texto: textoEdicao.trim() }).eq('id', post.id);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    setEditando(false);
    await recarregar();
  }

  async function fixar() {
    const { error } = await supabase.from('forum_posts').update({ fixado: !post.fixado }).eq('id', post.id);
    if (error) avisar('erro', error.message);
    else {
      aoMudar({ ...post, fixado: !post.fixado });
      avisar('sucesso', post.fixado ? 'Post solto do topo.' : 'Post fixado no topo do feed.');
    }
  }

  async function excluir() {
    const { error } = await supabase.from('forum_posts').delete().eq('id', post.id);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    if (post.imagens.length) await supabase.storage.from('portal').remove(post.imagens);
    setConfirmarExclusao(false);
    aoExcluir(post.id);
    avisar('sucesso', 'Post excluído.');
  }

  async function compartilhar() {
    const url = `${window.location.origin}/forum/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      avisar('sucesso', 'Link do post copiado.');
    } catch {
      window.prompt('Copie o link do post:', url);
    }
  }

  const abrirConversa = (e: React.MouseEvent) => {
    if (destaque || editando) return;
    const alvo = e.target as HTMLElement;
    if (alvo.closest('a,button,input,textarea,label')) return;
    if (window.getSelection()?.toString()) return;
    router.push(`/forum/post/${post.raiz_id ?? post.id}${post.raiz_id ? `#p-${post.id}` : ''}`);
  };

  const totalVotos = (post.votos ?? []).reduce((s, n) => s + n, 0);
  const enqueteEncerrada = Boolean(post.enquete?.encerra_em && new Date(post.enquete.encerra_em) < new Date());
  const mostraResultado = post.meu_voto !== null || enqueteEncerrada || meu;

  return (
    <article
      id={`p-${post.id}`}
      onClick={abrirConversa}
      className={cn('relative flex gap-3 px-4 pt-3 transition-colors', !destaque && 'cursor-pointer hover:bg-superficie/70', !semBorda && 'border-b border-borda', linhaAbaixo ? 'pb-0' : 'pb-3')}
    >
      <div className="flex flex-col items-center">
        <Link href={`/forum/perfil/${post.autor?.id}`} onClick={(e) => e.stopPropagation()}>
          <Avatar pessoa={post.autor} tamanho="md" />
        </Link>
        {linhaAbaixo && <span className="mt-1 w-0.5 flex-1 bg-borda-forte" aria-hidden />}
      </div>

      <div className="min-w-0 flex-1 pb-1">
        {post.fixado && (
          <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-marca-700">
            <Pin className="h-3 w-3" /> Fixado pela moderação
          </p>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm">
            <Link href={`/forum/perfil/${post.autor?.id}`} className="truncate font-semibold text-texto hover:underline" onClick={(e) => e.stopPropagation()}>
              {post.autor?.nome}
            </Link>
            <span className="truncate text-texto-fraco">@{post.autor?.apelido}</span>
            {post.autor?.cargo && <span className="hidden truncate text-xs text-texto-fraco sm:inline">· {post.autor.cargo}</span>}
            <span className="text-texto-fraco">·</span>
            <time className="text-texto-fraco" dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('pt-BR')}>
              {quando(post.created_at)}
            </time>
            {post.editado_em && <span className="text-xs text-texto-fraco">(editado)</span>}
          </div>
          {(meu || podeModerar) && (
            <>
              <button
                ref={botaoMenu}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu((v) => !v);
                }}
                className="-mr-2 -mt-1 rounded-full p-1.5 text-texto-fraco hover:bg-marca-50 hover:text-marca-700"
                aria-label="Mais opções"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <Popover ancora={botaoMenu} aberto={menu} aoFechar={() => setMenu(false)} largura={200} alinhamento="fim">
                <div className="py-1 text-sm" onClick={(e) => e.stopPropagation()}>
                  {meu && (
                    <button onClick={() => { setMenu(false); setEditando(true); setTextoEdicao(post.texto); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-superficie">
                      <Pencil className="h-4 w-4" /> Editar
                    </button>
                  )}
                  {podeModerar && !post.pai_id && (
                    <button onClick={() => { setMenu(false); void fixar(); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-superficie">
                      {post.fixado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {post.fixado ? 'Soltar do topo' : 'Fixar no topo'}
                    </button>
                  )}
                  <button onClick={() => { setMenu(false); setConfirmarExclusao(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-erro hover:bg-erro-suave">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </div>
              </Popover>
            </>
          )}
        </div>

        {post.respondendo_a && !destaque && (
          <p className="text-xs text-texto-fraco">
            Respondendo a{' '}
            <Link href={`/forum/perfil/${post.respondendo_a.id}`} className="text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
              @{post.respondendo_a.apelido}
            </Link>
          </p>
        )}

        <div className="mt-0.5">
          {editando ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <textarea value={textoEdicao} onChange={(e) => setTextoEdicao(e.target.value)} rows={4} className="w-full rounded-lg border border-borda-forte p-2 text-[15px]" autoFocus />
              <div className="flex justify-end gap-2">
                <Botao variante="secundario" tamanho="sm" onClick={() => setEditando(false)}>
                  Cancelar
                </Botao>
                <Botao tamanho="sm" onClick={() => void salvarEdicao()} disabled={!textoEdicao.trim() && post.imagens.length === 0}>
                  Salvar
                </Botao>
              </div>
            </div>
          ) : (
            post.texto && <TextoPost texto={post.texto} grande={destaque} />
          )}
        </div>

        {post.imagens.length > 0 && (
          <div className={cn('mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-borda', post.imagens.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} style={{ maxHeight: 420 }}>
            {post.imagens.map((caminho, i) => (
              <button
                key={caminho}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFoto(i);
                }}
                className={cn('relative block overflow-hidden bg-superficie', post.imagens.length === 3 && i === 0 && 'row-span-2')}
                aria-label="Ampliar foto"
              >
                {urls[caminho] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[caminho]}
                    alt=""
                    loading="lazy"
                    className={cn('h-full w-full object-cover transition-transform hover:scale-[1.02]', post.imagens.length === 1 ? 'max-h-[420px]' : 'aspect-square')}
                  />
                ) : (
                  <span className="block aspect-video animate-pulse bg-slate-100" />
                )}
              </button>
            ))}
          </div>
        )}

        {post.enquete && (
          <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {post.enquete.opcoes.map((opcao, i) => {
              const votos = post.votos?.[i] ?? 0;
              const pct = totalVotos ? Math.round((votos / totalVotos) * 100) : 0;
              const vencedora = mostraResultado && votos > 0 && votos === Math.max(...(post.votos ?? [0]));
              return mostraResultado ? (
                <div key={i} className="relative overflow-hidden rounded-lg border border-borda px-3 py-2 text-sm">
                  <div className={cn('absolute inset-y-0 left-0', vencedora ? 'bg-marca-100' : 'bg-slate-100')} style={{ width: `${pct}%` }} />
                  <div className="relative flex items-center justify-between gap-2">
                    <span className={cn('flex items-center gap-1.5', vencedora && 'font-semibold')}>
                      {opcao}
                      {post.meu_voto === i && <Check className="h-3.5 w-3.5 text-marca-700" />}
                    </span>
                    <span className="tabular-nums text-texto-suave">{pct}%</span>
                  </div>
                </div>
              ) : (
                <button
                  key={i}
                  onClick={() => void votar(i)}
                  className="w-full rounded-full border border-marca-300 px-3 py-2 text-sm font-medium text-marca-700 transition-colors hover:bg-marca-50"
                >
                  {opcao}
                </button>
              );
            })}
            <p className="text-xs text-texto-fraco">
              {totalVotos} voto{totalVotos === 1 ? '' : 's'} ·{' '}
              {enqueteEncerrada
                ? 'encerrada'
                : post.enquete.encerra_em
                  ? `encerra ${new Date(post.enquete.encerra_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                  : 'aberta'}
            </p>
          </div>
        )}

        {post.citacao && (
          <Link
            href={`/forum/post/${post.citacao.id}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 block rounded-2xl border border-borda p-3 transition-colors hover:bg-superficie"
          >
            <div className="flex items-center gap-1.5 text-sm">
              <Avatar pessoa={post.citacao.autor} tamanho="xs" />
              <span className="font-semibold text-texto">{post.citacao.autor?.nome}</span>
              <span className="text-texto-fraco">@{post.citacao.autor?.apelido} · {quando(post.citacao.created_at)}</span>
            </div>
            {post.citacao.texto && <p className="mt-1 line-clamp-4 text-sm text-texto">{post.citacao.texto}</p>}
            {post.citacao.imagens[0] && urls[post.citacao.imagens[0]] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[post.citacao.imagens[0]]} alt="" className="mt-2 max-h-48 w-full rounded-xl object-cover" />
            )}
          </Link>
        )}
        {post.citacao_id && !post.citacao && (
          <p className="mt-2 rounded-2xl border border-dashed border-borda p-3 text-xs text-texto-fraco">Este post foi apagado.</p>
        )}

        {destaque && (
          <p className="mt-3 border-b border-borda pb-3 text-sm text-texto-fraco">
            {new Date(post.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', year: 'numeric' })}
            {post.autor?.area && ` · ${rotuloArea(post.autor.area)}`}
          </p>
        )}

        <div className={cn('mt-1.5 flex max-w-md items-center justify-between text-texto-fraco', destaque && 'max-w-none justify-around py-1')} onClick={(e) => e.stopPropagation()}>
          <Acao icone={MessageCircle} valor={post.respostas} rotulo="Responder" cor="hover:text-info hover:bg-info-suave" onClick={() => setRespondendo(true)} />
          <Acao icone={Repeat2} valor={post.citacoes} rotulo="Compartilhar com comentário" cor="hover:text-sucesso hover:bg-sucesso-suave" onClick={() => setCitando(true)} />
          <Acao
            icone={Heart}
            valor={post.curtidas}
            rotulo={post.curti ? 'Descurtir' : 'Curtir'}
            ativo={post.curti}
            cor="hover:text-marca-600 hover:bg-marca-50"
            corAtiva="text-marca-600"
            preencher
            pulso={pulso}
            onClick={() => void curtir()}
          />
          <Acao icone={Bookmark} rotulo={post.salvei ? 'Tirar dos salvos' : 'Salvar'} ativo={post.salvei} cor="hover:text-alerta hover:bg-alerta-suave" corAtiva="text-alerta" preencher onClick={() => void salvar()} />
          <Acao icone={Link2} rotulo="Copiar link" cor="hover:text-texto hover:bg-superficie" onClick={() => void compartilhar()} />
        </div>
      </div>

      {/* Modais ficam dentro do <article> no React: o clique neles não pode
          "vazar" e abrir a conversa. */}
      <div onClick={(e) => e.stopPropagation()} className="contents">
      <Modal aberto={respondendo} aoFechar={() => setRespondendo(false)} titulo={`Responder a ${post.autor?.nome ?? ''}`} largura="md">
        <div className="mb-3 flex gap-3 border-b border-borda pb-3" onClick={(e) => e.stopPropagation()}>
          <Avatar pessoa={post.autor} tamanho="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {post.autor?.nome} <span className="font-normal text-texto-fraco">@{post.autor?.apelido}</span>
            </p>
            <p className="line-clamp-4 text-sm text-texto-suave">{post.texto || '📷 Foto'}</p>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Compositor
            compacto
            autoFocus
            paiId={post.id}
            placeholder="Escreva sua resposta"
            aoPublicar={() => {
              setRespondendo(false);
              aoMudar({ ...post, respostas: post.respostas + 1 });
              avisar('sucesso', 'Resposta publicada.');
              router.push(`/forum/post/${post.raiz_id ?? post.id}`);
            }}
          />
        </div>
      </Modal>

      <Modal aberto={citando} aoFechar={() => setCitando(false)} titulo="Compartilhar com um comentário" largura="md">
        <div onClick={(e) => e.stopPropagation()}>
          <Compositor
            compacto
            autoFocus
            citacao={post}
            placeholder="Adicione um comentário"
            aoPublicar={() => {
              setCitando(false);
              aoMudar({ ...post, citacoes: post.citacoes + 1 });
              avisar('sucesso', 'Compartilhado no seu perfil.');
            }}
          />
        </div>
      </Modal>

      <ModalConfirmacao
        aberto={confirmarExclusao}
        aoFechar={() => setConfirmarExclusao(false)}
        aoConfirmar={() => void excluir()}
        titulo="Excluir post"
        rotuloConfirmar="Excluir"
        mensagem={meu ? 'O post e as respostas dele saem do Fórum. Não dá para desfazer.' : 'Você está removendo o post de outra pessoa como moderação. Não dá para desfazer.'}
      />

      {foto !== null && <Galeria caminhos={post.imagens} inicial={foto} aoFechar={() => setFoto(null)} />}
      </div>
    </article>
  );
}

function Acao({
  icone: Icone,
  valor,
  rotulo,
  cor,
  corAtiva,
  ativo,
  preencher,
  pulso,
  onClick,
}: {
  icone: typeof Heart;
  valor?: number;
  rotulo: string;
  cor: string;
  corAtiva?: string;
  ativo?: boolean;
  preencher?: boolean;
  pulso?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn('group flex items-center gap-1 rounded-full px-1.5 py-1 text-xs transition-colors', ativo && corAtiva)} aria-label={rotulo} title={rotulo}>
      <span className={cn('rounded-full p-1.5 transition-colors', cor)}>
        <Icone className={cn('h-4 w-4', ativo && preencher && 'fill-current', ativo && pulso && 'animar-curtida')} />
      </span>
      {valor !== undefined && valor > 0 && <span className="tabular-nums">{valor}</span>}
    </button>
  );
}

function Galeria({ caminhos, inicial, aoFechar }: { caminhos: string[]; inicial: number; aoFechar: () => void }) {
  const { urls } = useForum();
  const [i, setI] = useState(inicial);
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
      if (e.key === 'ArrowRight') setI((x) => Math.min(caminhos.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [caminhos.length, aoFechar]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" onClick={(e) => { e.stopPropagation(); aoFechar(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[caminhos[i]]} alt="" className="max-h-[92vh] max-w-[92vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button onClick={aoFechar} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Fechar">
        <X className="h-5 w-5" />
      </button>
      {i > 0 && (
        <button onClick={(e) => { e.stopPropagation(); setI(i - 1); }} className="absolute left-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Foto anterior">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {i < caminhos.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); setI(i + 1); }} className="absolute right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Próxima foto">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
