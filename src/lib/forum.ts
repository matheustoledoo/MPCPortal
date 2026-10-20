/**
 * Fórum da Meta — utilidades compartilhadas pelas telas.
 *
 * Fotos ficam no bucket privado "portal": nada é público. Para mostrar, o
 * navegador pede URLs assinadas (válidas por uma hora) — e só consegue quem
 * está logado e ativo, pela política do Storage.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PostForum } from '@/types/banco';

export const LIMITE_TEXTO = 4000;
export const LIMITE_IMAGENS = 4;

/* -------------------------------------------------------------------------- */
/* Imagens                                                                     */
/* -------------------------------------------------------------------------- */

const cache = new Map<string, { url: string; expira: number }>();

/** URLs assinadas, em lote e com cache (a mesma foto aparece em vários lugares). */
export async function urlsAssinadas(supabase: SupabaseClient, caminhos: string[]): Promise<Record<string, string>> {
  const agora = Date.now();
  const resultado: Record<string, string> = {};
  const faltam: string[] = [];
  for (const c of new Set(caminhos.filter(Boolean))) {
    const item = cache.get(c);
    if (item && item.expira > agora + 60_000) resultado[c] = item.url;
    else faltam.push(c);
  }
  if (faltam.length) {
    const { data } = await supabase.storage.from('portal').createSignedUrls(faltam, 3600);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) {
        cache.set(d.path, { url: d.signedUrl, expira: agora + 3_500_000 });
        resultado[d.path] = d.signedUrl;
      }
    }
  }
  return resultado;
}

/** Todos os caminhos de imagem citados numa lista de posts (fotos e avatares). */
export function caminhosDosPosts(posts: PostForum[]): string[] {
  const caminhos: string[] = [];
  for (const p of posts) {
    caminhos.push(...p.imagens);
    if (p.autor?.avatar_path) caminhos.push(p.autor.avatar_path);
    if (p.citacao) {
      caminhos.push(...p.citacao.imagens);
      if (p.citacao.autor?.avatar_path) caminhos.push(p.citacao.autor.avatar_path);
    }
  }
  return caminhos;
}

/**
 * Reduz a foto antes de subir: lado maior de 1600 px, JPEG 85%. Foto de
 * celular sai de 5 MB para uns 300 KB, e o feed carrega rápido.
 */
export async function prepararImagem(arquivo: File, ladoMaximo = 1600): Promise<Blob> {
  if (arquivo.type === 'image/gif') return arquivo; // GIF animado fica como está
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return arquivo;
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
  return blob ?? arquivo;
}

/** Sobe uma imagem para a pasta da própria pessoa (a única em que ela pode gravar). */
export async function enviarImagem(
  supabase: SupabaseClient,
  usuarioId: string,
  pasta: 'forum' | 'avatares',
  arquivo: File,
): Promise<string> {
  const conteudo = await prepararImagem(arquivo, pasta === 'avatares' ? 512 : 1600);
  const extensao = conteudo.type === 'image/gif' ? 'gif' : conteudo.type === 'image/png' ? 'png' : 'jpg';
  const caminho = `${pasta}/${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const { error } = await supabase.storage.from('portal').upload(caminho, conteudo, {
    contentType: conteudo.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Não foi possível enviar a imagem: ${error.message}`);
  return caminho;
}

/* -------------------------------------------------------------------------- */
/* Texto                                                                       */
/* -------------------------------------------------------------------------- */

export type PedacoTexto =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'mencao'; valor: string }
  | { tipo: 'tag'; valor: string }
  | { tipo: 'link'; valor: string };

/** Quebra o texto em pedaços clicáveis: @menção, #assunto e links. */
export function quebrarTexto(texto: string): PedacoTexto[] {
  const padrao = /(https?:\/\/[^\s]+)|(@[a-z0-9._]{3,30})|(#[A-Za-z0-9_À-ÿ]{2,40})/gi;
  const pedacos: PedacoTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(padrao)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) pedacos.push({ tipo: 'texto', valor: texto.slice(ultimo, inicio) });
    if (m[1]) pedacos.push({ tipo: 'link', valor: m[1].replace(/[.,;:!?)]+$/, '') });
    else if (m[2]) pedacos.push({ tipo: 'mencao', valor: m[2].slice(1).toLowerCase() });
    else if (m[3]) pedacos.push({ tipo: 'tag', valor: m[3].slice(1).toLowerCase() });
    ultimo = inicio + m[0].length;
    // O ponto final colado no link volta a ser texto.
    if (m[1]) {
      const sobra = m[1].slice(m[1].replace(/[.,;:!?)]+$/, '').length);
      if (sobra) pedacos.push({ tipo: 'texto', valor: sobra });
    }
  }
  if (ultimo < texto.length) pedacos.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return pedacos;
}

/** "agora", "5 min", "3 h", "12 out" — como nas redes sociais. */
export function quando(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const s = Math.round((agora.getTime() - data.getTime()) / 1000);
  if (s < 50) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d`;
  return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: data.getFullYear() === agora.getFullYear() ? undefined : 'numeric' }).replace('.', '');
}

/** Cor estável por pessoa, para o avatar sem foto e a capa padrão. */
const CORES = ['#9b1c24', '#2f62c9', '#2e8a57', '#b7791f', '#7b4fc4', '#0e7490', '#c2417a', '#4b5563'];
export function corDaPessoa(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

export const CORES_CAPA = CORES;

export function iniciais(nome: string | null | undefined): string {
  return String(nome ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
