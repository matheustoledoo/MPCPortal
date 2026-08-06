import { redirect } from 'next/navigation';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PainelUsuarios } from '@/app/(portal)/usuarios/PainelUsuarios';
import { COLUNAS_GERAIS } from '@/lib/colunas';
import { podeGerenciarUsuarios } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { PermissaoCatalogo, Perfil } from '@/types/banco';

export const metadata = { title: 'Usuários' };

export default async function PaginaUsuarios() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!podeGerenciarUsuarios(perfil)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  const [{ data: usuarios }, { data: catalogo }, { data: concessoes }, { data: colunas }] =
    await Promise.all([
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('permissoes_catalogo').select('*').order('ordem'),
      supabase.from('usuario_permissoes').select('usuario_id, chave'),
      supabase.from('usuario_colunas').select('usuario_id, coluna').eq('tabela', 'legalizacao_empresas'),
    ]);

  // Agrupa por usuário para a tela não precisar refazer isso a cada render.
  const permissoesPorUsuario: Record<string, string[]> = {};
  for (const linha of concessoes ?? []) {
    (permissoesPorUsuario[linha.usuario_id as string] ??= []).push(linha.chave as string);
  }

  const colunasPorUsuario: Record<string, string[]> = {};
  for (const linha of colunas ?? []) {
    (colunasPorUsuario[linha.usuario_id as string] ??= []).push(linha.coluna as string);
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e permissões"
        descricao="Crie usuários, defina o time e marque exatamente o que cada um enxerga e altera."
      />
      <div className="p-5 sm:p-7">
        <PainelUsuarios
          meuPerfil={perfil}
          usuariosIniciais={(usuarios ?? []) as Perfil[]}
          catalogo={(catalogo ?? []) as PermissaoCatalogo[]}
          permissoesPorUsuario={permissoesPorUsuario}
          colunasPorUsuario={colunasPorUsuario}
          colunasDisponiveis={COLUNAS_GERAIS.filter((c) => c.editavel).map((c) => ({
            campo: c.campo,
            rotulo: c.rotulo,
          }))}
        />
      </div>
    </>
  );
}
