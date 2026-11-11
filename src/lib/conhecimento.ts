/**
 * Aprendizagem e procedimentos — o que a tela precisa saber sobre os
 * conteúdos. Versão, contadores e texto de busca são mantidos por gatilho
 * (migration 0030): a tela nunca os escreve.
 */

import type { ArtigoConhecimento, CategoriaConhecimento } from '@/types/banco';

export const TIPOS_CONTEUDO: { valor: ArtigoConhecimento['tipo']; rotulo: string; descricao: string }[] = [
  { valor: 'procedimento', rotulo: 'Procedimento', descricao: 'Passo a passo com checklist para executar uma atividade.' },
  { valor: 'tutorial', rotulo: 'Tutorial', descricao: 'Explicação com textos, imagens, vídeos e links.' },
  { valor: 'arquivo', rotulo: 'Arquivo', descricao: 'Documento de referência: PDF, planilha, modelo.' },
];

export const rotuloTipo = (t: ArtigoConhecimento['tipo']) => TIPOS_CONTEUDO.find((x) => x.valor === t)?.rotulo ?? t;

export const CAMPOS_RESUMO =
  'id, titulo, resumo, tipo, categoria_id, departamento, atividade, palavras_chave, publicado, destaque, versao, visualizacoes, uteis, nao_uteis, texto_busca, criado_por, criado_por_nome, atualizado_por_nome, created_at, updated_at';

export type ResumoArtigo = Pick<
  ArtigoConhecimento,
  'id' | 'titulo' | 'resumo' | 'tipo' | 'categoria_id' | 'departamento' | 'atividade' | 'palavras_chave' | 'publicado' | 'destaque' | 'versao' | 'visualizacoes' | 'uteis' | 'nao_uteis' | 'criado_por' | 'criado_por_nome' | 'atualizado_por_nome' | 'created_at' | 'updated_at'
> & { texto_busca: string };

/** Igual a `texto_normalizado()` do banco: minúsculas e sem acento. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Todas as palavras do termo precisam aparecer (em qualquer ordem). */
export function combina(artigo: { texto_busca: string }, termo: string): boolean {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  return palavras.every((p) => artigo.texto_busca.includes(p));
}

export function caminhoCategoria(id: string | null, categorias: CategoriaConhecimento[]): string {
  const c = categorias.find((x) => x.id === id);
  if (!c) return 'Sem categoria';
  const pai = categorias.find((x) => x.id === c.pai_id);
  return pai ? `${pai.nome} › ${c.nome}` : c.nome;
}

/** Categoria escolhida + as subcategorias dela. */
export function idsDaCategoria(id: string, categorias: CategoriaConhecimento[]): string[] {
  return [id, ...categorias.filter((c) => c.pai_id === id).map((c) => c.id)];
}

/** Transforma link do YouTube/Vimeo em URL de incorporação; outros voltam `null`. */
export function urlDeIncorporacao(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') ?? (u.pathname.startsWith('/shorts/') ? u.pathname.split('/')[2] : null);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return /^\d+$/.test(id ?? '') ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Só http(s): impede `javascript:` e afins em links cadastrados. */
export function linkSeguro(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const novoId = () => Math.random().toString(36).slice(2, 10);
