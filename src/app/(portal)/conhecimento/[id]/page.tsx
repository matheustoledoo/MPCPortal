import { notFound, redirect } from 'next/navigation';

import { VisualizadorArtigo } from '@/app/(portal)/conhecimento/[id]/VisualizadorArtigo';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { ArtigoConhecimento, CategoriaConhecimento } from '@/types/banco';

export const metadata = { title: 'Conteúdo' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaArtigo({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaConhecimento)) redirect('/sem-acesso');

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await criarClienteServidor();
  const [{ data: artigo }, { data: categorias }, { data: favorito }, { data: avaliacao }, { data: progresso }] = await Promise.all([
    supabase.from('conhecimento_artigos').select('*').eq('id', id).maybeSingle(),
    supabase.from('conhecimento_categorias').select('id, nome, descricao, pai_id, departamento, ordem'),
    supabase.from('conhecimento_favoritos').select('artigo_id').eq('artigo_id', id).eq('usuario_id', perfil.id).maybeSingle(),
    supabase.from('conhecimento_avaliacoes').select('util, comentario').eq('artigo_id', id).eq('usuario_id', perfil.id).maybeSingle(),
    supabase.from('conhecimento_progresso').select('passos_feitos').eq('artigo_id', id).eq('usuario_id', perfil.id).maybeSingle(),
  ]);
  if (!artigo) notFound();

  return (
    <VisualizadorArtigo
      meuId={perfil.id}
      podeEditar={pode(perfil, PERMISSOES.editarConhecimento)}
      podeExcluir={pode(perfil, PERMISSOES.excluirConhecimento)}
      artigo={artigo as unknown as ArtigoConhecimento}
      categorias={(categorias ?? []) as CategoriaConhecimento[]}
      favoritoInicial={Boolean(favorito)}
      avaliacaoInicial={(avaliacao as { util: boolean; comentario: string | null } | null) ?? null}
      passosFeitosIniciais={((progresso as { passos_feitos: string[] } | null)?.passos_feitos ?? [])}
    />
  );
}
