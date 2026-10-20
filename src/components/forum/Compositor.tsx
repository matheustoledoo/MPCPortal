'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { BarChart3, ImagePlus, Loader2, Smile, X } from 'lucide-react';

import { Avatar, useForum } from '@/components/forum/comum';
import { Popover } from '@/components/ui/Popover';
import { Botao, cn, useAvisos } from '@/components/ui';
import { LIMITE_IMAGENS, LIMITE_TEXTO, enviarImagem } from '@/lib/forum';
import type { PessoaForum, PostForum } from '@/types/banco';

const EMOJIS = ['👍', '👏', '🎉', '🙌', '😂', '😍', '🤔', '🙏', '🔥', '✅', '⚠️', '📌', '📄', '🏢', '☕', '❤️'];
const DURACOES = [
  { horas: 24, rotulo: '1 dia' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '1 semana' },
];

interface Foto {
  arquivo: File;
  previa: string;
}

/**
 * Escrever um post, uma resposta ou uma citação. Fotos (até 4), enquete,
 * @menção com sugestão de pessoas e Ctrl+Enter para publicar.
 */
export function Compositor({
  paiId = null,
  citacao = null,
  placeholder = 'O que está acontecendo na Meta?',
  aoPublicar,
  autoFocus = false,
  compacto = false,
}: {
  paiId?: string | null;
  citacao?: PostForum | null;
  placeholder?: string;
  aoPublicar?: (id: string) => void;
  autoFocus?: boolean;
  compacto?: boolean;
}) {
  const { eu, supabase } = useForum();
  const { avisar } = useAvisos();
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [enquete, setEnquete] = useState<{ opcoes: string[]; horas: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [focado, setFocado] = useState(autoFocus);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const botaoEmoji = useRef<HTMLButtonElement>(null);
  const caixaTexto = useRef<HTMLDivElement>(null);

  // Sugestão de @menção
  const [termoMencao, setTermoMencao] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<PessoaForum[]>([]);
  const [destaque, setDestaque] = useState(0);

  // Libera as prévias só ao sair: revogar a cada mudança apagaria as que continuam na tela.
  const fotosAtuais = useRef<Foto[]>([]);
  fotosAtuais.current = fotos;
  useEffect(() => () => fotosAtuais.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  useEffect(() => {
    if (termoMencao === null) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('forum_pessoas', { p_busca: termoMencao, p_limite: 6 });
      setSugestoes((data ?? []) as PessoaForum[]);
      setDestaque(0);
    }, 150);
    return () => clearTimeout(t);
  }, [termoMencao, supabase]);

  function aoDigitar(valor: string) {
    setTexto(valor);
    const cursor = campo.current?.selectionStart ?? valor.length;
    const antes = valor.slice(0, cursor);
    const m = /(?:^|\s)@([a-z0-9._]{0,30})$/i.exec(antes);
    setTermoMencao(m ? m[1] : null);
  }

  function inserirMencao(p: PessoaForum) {
    const cursor = campo.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/@([a-z0-9._]{0,30})$/i, `@${p.apelido} `);
    const novo = antes + texto.slice(cursor);
    setTexto(novo);
    setTermoMencao(null);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(antes.length, antes.length);
    });
  }

  function inserir(trecho: string) {
    const el = campo.current;
    const i = el?.selectionStart ?? texto.length;
    const f = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, i) + trecho + texto.slice(f));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(i + trecho.length, i + trecho.length);
    });
  }

  function adicionarFotos(lista: FileList | File[]) {
    const validas = [...lista].filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (validas.length < [...lista].length) avisar('alerta', 'Só dá para enviar fotos (JPG, PNG, WebP ou GIF).');
    const espaco = LIMITE_IMAGENS - fotos.length;
    if (validas.length > espaco) avisar('alerta', `No máximo ${LIMITE_IMAGENS} fotos por post.`);
    setFotos((atual) => [...atual, ...validas.slice(0, espaco).map((arquivo) => ({ arquivo, previa: URL.createObjectURL(arquivo) }))]);
    setEnquete(null);
  }

  const restante = LIMITE_TEXTO - texto.length;
  const enqueteValida = !enquete || enquete.opcoes.filter((o) => o.trim()).length >= 2;
  const podePublicar =
    !enviando && restante >= 0 && enqueteValida && (texto.trim().length > 0 || fotos.length > 0 || Boolean(citacao) || Boolean(enquete));

  async function publicar() {
    if (!podePublicar) return;
    setEnviando(true);
    try {
      const imagens: string[] = [];
      for (const f of fotos) imagens.push(await enviarImagem(supabase, eu.id, 'forum', f.arquivo));
      const registro: Record<string, unknown> = {
        texto: texto.trim(),
        imagens,
        pai_id: paiId,
        citacao_id: citacao?.id ?? null,
      };
      if (enquete && !paiId) {
        registro.enquete = {
          opcoes: enquete.opcoes.map((o) => o.trim()).filter(Boolean).slice(0, 4),
          encerra_em: new Date(Date.now() + enquete.horas * 3_600_000).toISOString(),
        };
      }
      const { data, error } = await supabase.from('forum_posts').insert(registro).select('id').single();
      if (error) throw new Error(error.message);
      setTexto('');
      fotos.forEach((f) => URL.revokeObjectURL(f.previa));
      setFotos([]);
      setEnquete(null);
      setFocado(false);
      aoPublicar?.((data as { id: string }).id);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível publicar.');
    } finally {
      setEnviando(false);
    }
  }

  const expandido = focado || texto.length > 0 || fotos.length > 0 || Boolean(enquete) || Boolean(citacao);
  const progresso = useMemo(() => Math.min(1, texto.length / LIMITE_TEXTO), [texto.length]);

  return (
    <div
      className={cn('flex gap-3', !compacto && 'p-4')}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) adicionarFotos(e.dataTransfer.files);
      }}
    >
      {!compacto && <Avatar pessoa={eu} tamanho="md" />}
      <div className="min-w-0 flex-1" ref={caixaTexto}>
        <textarea
          ref={campo}
          value={texto}
          autoFocus={autoFocus}
          onFocus={() => setFocado(true)}
          onChange={(e) => aoDigitar(e.target.value)}
          onPaste={(e) => {
            const imagens = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
            if (imagens.length) {
              e.preventDefault();
              adicionarFotos(imagens);
            }
          }}
          onKeyDown={(e) => {
            if (termoMencao !== null && sugestoes.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setDestaque((d) => Math.min(sugestoes.length - 1, d + 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setDestaque((d) => Math.max(0, d - 1));
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                inserirMencao(sugestoes[destaque]);
                return;
              }
              if (e.key === 'Escape') {
                setTermoMencao(null);
                return;
              }
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void publicar();
            }
          }}
          rows={expandido ? 3 : 1}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent py-2 text-[17px] leading-relaxed text-texto outline-none placeholder:text-texto-fraco"
          aria-label={placeholder}
        />

        <Popover ancora={caixaTexto} aberto={termoMencao !== null && sugestoes.length > 0} aoFechar={() => setTermoMencao(null)} largura={280}>
          <ul className="max-h-64 overflow-y-auto py-1">
            {sugestoes.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => inserirMencao(p)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left', i === destaque ? 'bg-marca-50' : 'hover:bg-superficie')}
                >
                  <Avatar pessoa={p} tamanho="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-texto">{p.nome}</span>
                    <span className="block truncate text-xs text-texto-suave">@{p.apelido}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>

        {fotos.length > 0 && (
          <div className={cn('mt-2 grid gap-2', fotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {fotos.map((f, i) => (
              <div key={f.previa} className="relative overflow-hidden rounded-xl border border-borda">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.previa} alt="" className={cn('w-full object-cover', fotos.length === 1 ? 'max-h-80' : 'h-40')} />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(f.previa);
                    setFotos((atual) => atual.filter((_, j) => j !== i));
                  }}
                  className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900"
                  aria-label="Remover foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {enquete && (
          <div className="mt-2 space-y-2 rounded-xl border border-borda p-3">
            {enquete.opcoes.map((op, i) => (
              <input
                key={i}
                value={op}
                onChange={(e) => setEnquete({ ...enquete, opcoes: enquete.opcoes.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={`Opção ${i + 1}${i >= 2 ? ' (opcional)' : ''}`}
                maxLength={60}
                className="h-9 w-full rounded-lg border border-borda-forte px-3 text-sm"
              />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {enquete.opcoes.length < 4 ? (
                <button type="button" onClick={() => setEnquete({ ...enquete, opcoes: [...enquete.opcoes, ''] })} className="text-xs font-medium text-marca-700 hover:underline">
                  + adicionar opção
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2 text-xs text-texto-suave">
                Duração
                <select value={enquete.horas} onChange={(e) => setEnquete({ ...enquete, horas: Number(e.target.value) })} className="h-8 rounded-lg border border-borda-forte px-2 text-xs">
                  {DURACOES.map((d) => (
                    <option key={d.horas} value={d.horas}>
                      {d.rotulo}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setEnquete(null)} className="font-medium text-erro hover:underline">
                  remover enquete
                </button>
              </div>
            </div>
          </div>
        )}

        {citacao && (
          <div className="mt-2 rounded-xl border border-borda p-3 text-sm">
            <p className="text-xs font-semibold text-texto">
              {citacao.autor?.nome} <span className="font-normal text-texto-fraco">@{citacao.autor?.apelido}</span>
            </p>
            <p className="mt-0.5 line-clamp-3 text-texto-suave">{citacao.texto || '📷 Foto'}</p>
          </div>
        )}

        {expandido && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-borda pt-2">
            <div className="flex items-center gap-0.5 text-marca-600">
              <input ref={seletor} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => e.target.files && adicionarFotos(e.target.files)} />
              <button
                type="button"
                onClick={() => seletor.current?.click()}
                disabled={fotos.length >= LIMITE_IMAGENS || Boolean(enquete)}
                className="rounded-full p-2 transition-colors hover:bg-marca-50 disabled:opacity-40"
                title="Fotos (até 4) — também dá para colar ou arrastar"
                aria-label="Adicionar fotos"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              {!paiId && (
                <button
                  type="button"
                  onClick={() => {
                    setEnquete(enquete ? null : { opcoes: ['', ''], horas: 24 });
                    setFotos([]);
                  }}
                  className={cn('rounded-full p-2 transition-colors hover:bg-marca-50', enquete && 'bg-marca-50')}
                  title="Enquete"
                  aria-label="Criar enquete"
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
              )}
              <button ref={botaoEmoji} type="button" onClick={() => setEmojis((v) => !v)} className="rounded-full p-2 transition-colors hover:bg-marca-50" title="Emoji" aria-label="Emoji">
                <Smile className="h-5 w-5" />
              </button>
              <Popover ancora={botaoEmoji} aberto={emojis} aoFechar={() => setEmojis(false)} largura={232}>
                <div className="grid grid-cols-8 gap-1 p-2">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        inserir(e);
                        setEmojis(false);
                      }}
                      className="rounded p-1 text-lg hover:bg-superficie"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>
            <div className="flex items-center gap-3">
              {texto.length > 0 && (
                <span className="flex items-center gap-1.5" title={`${restante} caracteres restantes`}>
                  <svg viewBox="0 0 20 20" className="h-5 w-5 -rotate-90">
                    <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-borda)" strokeWidth="2.5" />
                    <circle
                      cx="10"
                      cy="10"
                      r="8"
                      fill="none"
                      stroke={restante < 0 ? 'var(--color-erro)' : restante < 200 ? 'var(--color-alerta)' : 'var(--color-marca-600)'}
                      strokeWidth="2.5"
                      strokeDasharray={`${progresso * 50.3} 50.3`}
                    />
                  </svg>
                  {restante < 200 && <span className={cn('text-xs tabular-nums', restante < 0 ? 'text-erro' : 'text-texto-suave')}>{restante}</span>}
                </span>
              )}
              <Botao onClick={() => void publicar()} disabled={!podePublicar} className="rounded-full px-5">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {paiId ? 'Responder' : citacao ? 'Compartilhar' : 'Publicar'}
              </Botao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
