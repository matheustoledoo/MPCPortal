import { redirect } from 'next/navigation';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { GerenciadorUsuarios } from '@/app/(portal)/usuarios/GerenciadorUsuarios';
import { ehAdmin } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Perfil } from '@/types/banco';

export const metadata = { title: 'Usuários' };

export default async function PaginaUsuarios() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!ehAdmin(perfil)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('profiles').select('*').order('nome');

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Controle de acesso por área e função. Alterações entram em vigor no próximo carregamento de página do usuário."
      />
      <div className="p-5 sm:p-7">
        <GerenciadorUsuarios usuariosIniciais={(data ?? []) as Perfil[]} meuId={perfil.id} />
      </div>
    </>
  );
}
