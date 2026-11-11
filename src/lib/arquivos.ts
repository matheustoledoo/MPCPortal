/**
 * Arquivos do portal (bucket privado `arquivos`, migration 0031).
 *
 * O caminho diz a quem o arquivo pertence e o banco decide o acesso por ele:
 *   chat/<conversa>/…          só os participantes da conversa
 *   tarefas/<tarefa>/…         quem enxerga a tarefa
 *   conhecimento/<artigo>/…    leitura: tela.conhecimento · escrita: editores
 *   empresas/<empresa>/…       leitura/escrita da Legalização
 *
 * Nada aqui é público: toda leitura passa por URL assinada de curta duração.
 * A validação de tipo e tamanho é repetida pelo Storage (lista de MIME e
 * limite do bucket) — o que está aqui só evita a viagem perdida.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AnexoArquivo } from '@/types/banco';

export const BUCKET_ARQUIVOS = 'arquivos';
export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  xml: 'application/xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};

export const EXTENSOES_ACEITAS = Object.keys(TIPOS);
export const ACEITA_INPUT = EXTENSOES_ACEITAS.map((e) => `.${e}`).join(',');

export type PastaArquivo = 'chat' | 'tarefas' | 'conhecimento' | 'empresas';

function extensao(nome: string): string {
  const p = nome.lastIndexOf('.');
  return p >= 0 ? nome.slice(p + 1).toLowerCase() : '';
}

/** Motivo da recusa, ou `null` se o arquivo pode subir. */
export function validarArquivo(arquivo: File): string | null {
  const ext = extensao(arquivo.name);
  if (!TIPOS[ext]) {
    return `"${arquivo.name}": tipo de arquivo não permitido. Aceitos: ${EXTENSOES_ACEITAS.join(', ')}.`;
  }
  if (arquivo.size === 0) return `"${arquivo.name}" está vazio.`;
  if (arquivo.size > TAMANHO_MAXIMO) return `"${arquivo.name}" passa de 25 MB.`;
  return null;
}

function nomeSeguro(nome: string): string {
  const ext = extensao(nome);
  const base = nome
    .slice(0, nome.length - (ext ? ext.length + 1 : 0))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'arquivo'}.${ext}`;
}

/** Envia um arquivo para `<pasta>/<donoId>/…` e devolve o registro do anexo. */
export async function enviarArquivo(
  supabase: SupabaseClient,
  pasta: PastaArquivo,
  donoId: string,
  arquivo: File,
): Promise<AnexoArquivo> {
  const recusa = validarArquivo(arquivo);
  if (recusa) throw new Error(recusa);
  const tipo = TIPOS[extensao(arquivo.name)];
  const caminho = `${pasta}/${donoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nomeSeguro(arquivo.name)}`;
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo, {
    contentType: tipo,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    const semPermissao = /row-level security|not authorized|403/i.test(error.message);
    throw new Error(
      semPermissao
        ? `Você não tem permissão para enviar arquivos aqui.`
        : `Não foi possível enviar "${arquivo.name}": ${error.message}`,
    );
  }
  return { caminho, nome: arquivo.name.slice(0, 180), tipo, tamanho: arquivo.size };
}

const cache = new Map<string, { url: string; expira: number }>();

/** URLs assinadas (1 h), em lote e com cache. */
export async function urlsDeArquivos(supabase: SupabaseClient, caminhos: string[]): Promise<Record<string, string>> {
  const agora = Date.now();
  const resultado: Record<string, string> = {};
  const faltam: string[] = [];
  for (const c of new Set(caminhos.filter(Boolean))) {
    const item = cache.get(c);
    if (item && item.expira > agora + 60_000) resultado[c] = item.url;
    else faltam.push(c);
  }
  if (faltam.length) {
    const { data } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrls(faltam, 3600);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) {
        cache.set(d.path, { url: d.signedUrl, expira: agora + 3_500_000 });
        resultado[d.path] = d.signedUrl;
      }
    }
  }
  return resultado;
}

/** Baixa com o nome original (a URL assinada sozinha baixaria com o nome técnico). */
export async function baixarArquivo(supabase: SupabaseClient, anexo: Pick<AnexoArquivo, 'caminho' | 'nome'>) {
  const { data, error } = await supabase.storage
    .from(BUCKET_ARQUIVOS)
    .createSignedUrl(anexo.caminho, 120, { download: anexo.nome });
  if (error || !data?.signedUrl) throw new Error('Não foi possível gerar o link de download.');
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function apagarArquivo(supabase: SupabaseClient, caminho: string) {
  await supabase.storage.from(BUCKET_ARQUIVOS).remove([caminho]);
}

export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export type FamiliaArquivo = 'imagem' | 'video' | 'audio' | 'pdf' | 'planilha' | 'texto' | 'outro';

export function familiaDoArquivo(anexo: Pick<AnexoArquivo, 'tipo' | 'nome'>): FamiliaArquivo {
  const tipo = anexo.tipo ?? TIPOS[extensao(anexo.nome)] ?? '';
  if (tipo.startsWith('image/')) return 'imagem';
  if (tipo.startsWith('video/')) return 'video';
  if (tipo.startsWith('audio/')) return 'audio';
  if (tipo === 'application/pdf') return 'pdf';
  if (/sheet|excel|csv/.test(tipo)) return 'planilha';
  if (/word|text|document|presentation|powerpoint/.test(tipo)) return 'texto';
  return 'outro';
}
