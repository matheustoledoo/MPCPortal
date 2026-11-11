import { redirect } from 'next/navigation';

import { CentralConhecimento } from '@/app/(portal)/conhecimento/CentralConhecimento';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { CAMPOS_RESUMO, type ResumoArtigo } from '@/lib/conhecimento';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { CategoriaConhecimento } from '@/types/banco';

export const metadata = { title: 'Aprendizagem e procedimentos' };

/** Central de conhecimento da equipe: tutoriais, procedimentos e arquivos. */
export default async function PaginaConhecimento() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaConhecimento)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const [{ data: categorias }, { data: artigos }, { data: favoritos }] = await Promise.all([
    supabase.from('conhecimento_categorias').select('id, nome, descricao, pai_id, departamento, ordem').order('ordem').order('nome'),
    supabase.from('conhecimento_artigos').select(CAMPOS_RESUMO).order('updated_at', { ascending: false }),
    supabase.from('conhecimento_favoritos').select('artigo_id').eq('usuario_id', perfil.id),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Aprendizagem e procedimentos"
        descricao="A base de conhecimento do escritório: como executar cada atividade, com passo a passo, imagens, vídeos e arquivos de apoio."
      />
      <div className="p-5 sm:p-7">
        <CentralConhecimento
          meuId={perfil.id}
          podeEditar={pode(perfil, PERMISSOES.editarConhecimento)}
          podeExcluir={pode(perfil, PERMISSOES.excluirConhecimento)}
          categoriasIniciais={(categorias ?? []) as CategoriaConhecimento[]}
          artigos={(artigos ?? []) as unknown as ResumoArtigo[]}
          favoritosIniciais={((favoritos ?? []) as { artigo_id: string }[]).map((f) => f.artigo_id)}
        />
      </div>
    </>
  );
}
