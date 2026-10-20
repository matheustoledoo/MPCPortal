import { redirect } from 'next/navigation';

import type { EuNoForum } from '@/components/forum/comum';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';

/** Quem abre o Fórum, já conferido: precisa da tela "Fórum da Meta". */
export async function abrirForum(): Promise<{ eu: EuNoForum; supabase: Awaited<ReturnType<typeof criarClienteServidor>> }> {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaForum)) redirect('/sem-acesso');
  const supabase = await criarClienteServidor();
  return {
    supabase,
    eu: {
      id: perfil.id,
      nome: perfil.nome,
      apelido: perfil.apelido ?? null,
      avatar_path: perfil.avatar_path ?? null,
      moderador: pode(perfil, PERMISSOES.moderarForum),
    },
  };
}
