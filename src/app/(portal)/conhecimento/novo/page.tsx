import { redirect } from 'next/navigation';

import { EditorArtigo } from '@/app/(portal)/conhecimento/EditorArtigo';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { CategoriaConhecimento } from '@/types/banco';

export const metadata = { title: 'Novo conteúdo' };

export default async function PaginaNovoArtigo() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaConhecimento) || !pode(perfil, PERMISSOES.editarConhecimento)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const { data: categorias } = await supabase.from('conhecimento_categorias').select('id, nome, descricao, pai_id, departamento, ordem').order('ordem').order('nome');

  return <EditorArtigo artigo={null} categorias={(categorias ?? []) as CategoriaConhecimento[]} />;
}
