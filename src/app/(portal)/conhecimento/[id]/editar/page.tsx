import { notFound, redirect } from 'next/navigation';

import { EditorArtigo } from '@/app/(portal)/conhecimento/EditorArtigo';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { ArtigoConhecimento, CategoriaConhecimento } from '@/types/banco';

export const metadata = { title: 'Editar conteúdo' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaEditarArtigo({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaConhecimento) || !pode(perfil, PERMISSOES.editarConhecimento)) redirect('/sem-acesso');

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await criarClienteServidor();
  const [{ data: artigo }, { data: categorias }] = await Promise.all([
    supabase.from('conhecimento_artigos').select('*').eq('id', id).maybeSingle(),
    supabase.from('conhecimento_categorias').select('id, nome, descricao, pai_id, departamento, ordem').order('ordem').order('nome'),
  ]);
  if (!artigo) notFound();

  return <EditorArtigo artigo={artigo as unknown as ArtigoConhecimento} categorias={(categorias ?? []) as CategoriaConhecimento[]} />;
}
