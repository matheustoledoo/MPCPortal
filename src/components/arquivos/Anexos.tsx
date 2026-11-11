'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';

import { Download, Eye, FileArchive, FileSpreadsheet, FileText, Film, ImageIcon, Music, Paperclip, Trash2, X } from 'lucide-react';

import { Botao, cn, useAvisos } from '@/components/ui';
import {
  ACEITA_INPUT,
  baixarArquivo,
  enviarArquivo,
  familiaDoArquivo,
  tamanhoLegivel,
  urlsDeArquivos,
  type PastaArquivo,
} from '@/lib/arquivos';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AnexoArquivo } from '@/types/banco';

const ICONES = {
  imagem: ImageIcon,
  video: Film,
  audio: Music,
  pdf: FileText,
  planilha: FileSpreadsheet,
  texto: FileText,
  outro: FileArchive,
};

/** Botão "Anexar": valida, envia e devolve os anexos prontos. */
export function BotaoAnexar({
  pasta,
  donoId,
  aoEnviar,
  rotulo = 'Anexar arquivo',
  variante = 'secundario',
  somenteIcone = false,
  desabilitado,
  aceitar = ACEITA_INPUT,
}: {
  pasta: PastaArquivo;
  donoId: string;
  aoEnviar: (anexos: AnexoArquivo[]) => void | Promise<void>;
  rotulo?: string;
  variante?: 'secundario' | 'fantasma' | 'sutil';
  somenteIcone?: boolean;
  desabilitado?: boolean;
  aceitar?: string;
}) {
  const { avisar } = useAvisos();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEscolher(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []).slice(0, 10);
    if (arquivos.length === 0) return;
    setEnviando(true);
    const supabase = criarClienteNavegador();
    const prontos: AnexoArquivo[] = [];
    for (const arquivo of arquivos) {
      try {
        prontos.push(await enviarArquivo(supabase, pasta, donoId, arquivo));
      } catch (e) {
        avisar('erro', (e as Error).message);
      }
    }
    try {
      if (prontos.length) await aoEnviar(prontos);
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={aceitar}
        className="hidden"
        onChange={(e) => void aoEscolher(e.target.files)}
      />
      <Botao
        type="button"
        variante={variante}
        tamanho={somenteIcone ? 'icone' : 'sm'}
        carregando={enviando}
        disabled={desabilitado}
        onClick={() => entrada.current?.click()}
        title={rotulo}
        aria-label={rotulo}
      >
        {!enviando && <Paperclip className="h-4 w-4" />}
        {!somenteIcone && (enviando ? 'Enviando…' : rotulo)}
      </Botao>
    </>
  );
}

/** Lista de anexos com miniatura, pré-visualização e download. */
export function ListaAnexos({
  anexos,
  aoRemover,
  compacto = false,
  className,
}: {
  anexos: AnexoArquivo[];
  aoRemover?: (anexo: AnexoArquivo) => void;
  compacto?: boolean;
  className?: string;
}) {
  const { avisar } = useAvisos();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [vendo, setVendo] = useState<AnexoArquivo | null>(null);
  const chave = anexos.map((a) => a.caminho).join('|');

  useEffect(() => {
    const visuais = chave
      .split('|')
      .filter(Boolean)
      .filter((c) => /\.(jpe?g|png|webp|gif|pdf|mp4|webm|mp3|ogg)$/i.test(c));
    if (visuais.length === 0) return;
    let ativo = true;
    void urlsDeArquivos(criarClienteNavegador(), visuais).then((r) => {
      if (ativo) setUrls((u) => ({ ...u, ...r }));
    });
    return () => {
      ativo = false;
    };
  }, [chave]);

  if (anexos.length === 0) return null;

  async function baixar(anexo: AnexoArquivo) {
    try {
      await baixarArquivo(criarClienteNavegador(), anexo);
    } catch (e) {
      avisar('erro', (e as Error).message);
    }
  }

  return (
    <>
      <ul className={cn('flex flex-wrap gap-2', className)}>
        {anexos.map((anexo) => {
          const familia = familiaDoArquivo(anexo);
          const Icone = ICONES[familia];
          const url = urls[anexo.caminho];
          const visualizavel = ['imagem', 'pdf', 'video', 'audio'].includes(familia);

          if (familia === 'imagem' && !compacto) {
            return (
              <li key={anexo.caminho} className="group relative">
                <button
                  type="button"
                  onClick={() => setVendo(anexo)}
                  className="block overflow-hidden rounded-lg border border-borda bg-superficie"
                  title={`Ver ${anexo.nome}`}
                >
                  {url ? (
                    <img src={url} alt={anexo.nome} className="h-36 max-w-[260px] object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-36 w-44 items-center justify-center text-texto-fraco">
                      <ImageIcon className="h-6 w-6" />
                    </span>
                  )}
                </button>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void baixar(anexo)}
                    className="rounded-md bg-slate-900/70 p-1.5 text-white hover:bg-slate-900"
                    aria-label={`Baixar ${anexo.nome}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {aoRemover && (
                    <button
                      type="button"
                      onClick={() => aoRemover(anexo)}
                      className="rounded-md bg-slate-900/70 p-1.5 text-white hover:bg-erro"
                      aria-label={`Remover ${anexo.nome}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          }

          return (
            <li
              key={anexo.caminho}
              className="flex max-w-full items-center gap-2.5 rounded-lg border border-borda bg-white px-2.5 py-2 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-marca-50 text-marca-700">
                <Icone className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block max-w-[220px] truncate text-xs font-medium text-texto" title={anexo.nome}>
                  {anexo.nome}
                </span>
                <span className="block text-[11px] text-texto-fraco">{tamanhoLegivel(anexo.tamanho)}</span>
              </span>
              <span className="ml-1 flex shrink-0 items-center gap-0.5">
                {visualizavel && (
                  <button
                    type="button"
                    onClick={() => setVendo(anexo)}
                    className="rounded p-1.5 text-texto-fraco hover:bg-superficie hover:text-texto"
                    aria-label={`Pré-visualizar ${anexo.nome}`}
                    title="Pré-visualizar"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void baixar(anexo)}
                  className="rounded p-1.5 text-texto-fraco hover:bg-superficie hover:text-texto"
                  aria-label={`Baixar ${anexo.nome}`}
                  title="Baixar"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {aoRemover && (
                  <button
                    type="button"
                    onClick={() => aoRemover(anexo)}
                    className="rounded p-1.5 text-texto-fraco hover:bg-erro-suave hover:text-erro"
                    aria-label={`Remover ${anexo.nome}`}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {vendo && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/85 p-4" role="dialog" aria-modal="true" aria-label={vendo.nome}>
          <div className="mb-3 flex items-center justify-between gap-3 text-white">
            <p className="min-w-0 truncate text-sm font-medium">{vendo.nome}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Botao variante="secundario" tamanho="sm" onClick={() => void baixar(vendo)}>
                <Download className="h-4 w-4" /> Baixar
              </Botao>
              <button
                type="button"
                onClick={() => setVendo(null)}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Fechar pré-visualização"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={() => setVendo(null)}>
            <PreVisualizacao anexo={vendo} url={urls[vendo.caminho]} />
          </div>
        </div>
      )}
    </>
  );
}

function PreVisualizacao({ anexo, url }: { anexo: AnexoArquivo; url?: string }) {
  const familia = familiaDoArquivo(anexo);
  if (!url) return <p className="text-sm text-white/70">Carregando…</p>;
  const parar = (e: React.MouseEvent) => e.stopPropagation();
  if (familia === 'imagem') return <img src={url} alt={anexo.nome} onClick={parar} className="max-h-full max-w-full rounded-lg object-contain" />;
  if (familia === 'video') return <video src={url} controls onClick={parar} className="max-h-full max-w-full rounded-lg" />;
  if (familia === 'audio') return <audio src={url} controls onClick={parar} />;
  if (familia === 'pdf') return <iframe src={url} title={anexo.nome} onClick={parar} className="h-full w-full max-w-5xl rounded-lg bg-white" />;
  return <p className="text-sm text-white/70">Este tipo de arquivo não tem pré-visualização. Use “Baixar”.</p>;
}
