'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';

import { AlertTriangle, ExternalLink, Info, Star } from 'lucide-react';

import { cn } from '@/components/ui';
import { urlsDeArquivos } from '@/lib/arquivos';
import { linkSeguro, urlDeIncorporacao } from '@/lib/conhecimento';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { BlocoConteudo } from '@/types/banco';

const TONS = {
  info: { classe: 'border-blue-200 bg-info-suave text-info', icone: Info, rotulo: 'Dica' },
  atencao: { classe: 'border-amber-200 bg-alerta-suave text-alerta', icone: AlertTriangle, rotulo: 'Atenção' },
  importante: { classe: 'border-marca-200 bg-marca-50 text-marca-800', icone: Star, rotulo: 'Importante' },
};

/** URLs assinadas das mídias enviadas (o bucket é privado). */
export function useUrlsDeMidia(caminhos: (string | undefined)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = caminhos.filter(Boolean).join('|');
  useEffect(() => {
    if (!chave) return;
    let ativo = true;
    void urlsDeArquivos(criarClienteNavegador(), chave.split('|')).then((r) => {
      if (ativo) setUrls((u) => ({ ...u, ...r }));
    });
    return () => {
      ativo = false;
    };
  }, [chave]);
  return urls;
}

/** Renderiza o conteúdo de um tutorial. O texto é sempre texto puro — nada de HTML salvo no banco. */
export function BlocosConteudo({ blocos }: { blocos: BlocoConteudo[] }) {
  const urls = useUrlsDeMidia(blocos.map((b) => b.caminho));

  return (
    <div className="space-y-5">
      {blocos.map((b) => {
        if (b.tipo === 'titulo') return <h2 key={b.id} className="pt-2 text-lg font-semibold tracking-tight text-texto">{b.texto}</h2>;
        if (b.tipo === 'texto') return <p key={b.id} className="whitespace-pre-wrap text-[15px] leading-relaxed text-texto">{b.texto}</p>;
        if (b.tipo === 'destaque') {
          const tom = TONS[b.tom ?? 'info'];
          const Icone = tom.icone;
          return (
            <aside key={b.id} className={cn('flex gap-3 rounded-xl border px-4 py-3', tom.classe)}>
              <Icone className="mt-0.5 h-4.5 w-4.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">{tom.rotulo}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-texto">{b.texto}</p>
              </div>
            </aside>
          );
        }
        if (b.tipo === 'imagem') {
          const url = b.caminho ? urls[b.caminho] : undefined;
          return (
            <figure key={b.id}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={b.legenda ?? ''} className="max-h-[560px] rounded-xl border border-borda" loading="lazy" /></a>
              ) : (
                <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
              )}
              {b.legenda && <figcaption className="mt-1.5 text-xs text-texto-suave">{b.legenda}</figcaption>}
            </figure>
          );
        }
        if (b.tipo === 'video') {
          const enviado = b.caminho ? urls[b.caminho] : undefined;
          const incorporado = b.url ? urlDeIncorporacao(b.url) : null;
          const link = linkSeguro(b.url);
          return (
            <figure key={b.id}>
              {b.caminho ? (
                enviado ? <video src={enviado} controls preload="metadata" className="w-full rounded-xl border border-borda bg-black" /> : <div className="aspect-video animate-pulse rounded-xl bg-slate-100" />
              ) : incorporado ? (
                <iframe src={incorporado} title={b.legenda ?? 'Vídeo'} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="aspect-video w-full rounded-xl border border-borda" />
              ) : link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-borda-forte bg-white px-3 py-2 text-sm font-medium text-marca-700 hover:border-marca-300"><ExternalLink className="h-4 w-4" /> Assistir ao vídeo</a>
              ) : null}
              {b.legenda && <figcaption className="mt-1.5 text-xs text-texto-suave">{b.legenda}</figcaption>}
            </figure>
          );
        }
        if (b.tipo === 'link') {
          const link = linkSeguro(b.url);
          if (!link) return null;
          return (
            <a key={b.id} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-borda bg-white px-4 py-3 transition-colors hover:border-marca-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700"><ExternalLink className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-texto">{b.texto || link}</span><span className="block truncate text-xs text-texto-fraco">{new URL(link).hostname}</span></span>
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}
