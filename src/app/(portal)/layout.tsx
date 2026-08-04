import { redirect } from 'next/navigation';

import { MenuLateral } from '@/components/layout/MenuLateral';
import { obterPerfilAtual } from '@/lib/supabase/server';

/**
 * Casca do portal. Garante que só entra aqui quem tem sessão e perfil ativo.
 * A checagem por rota fica em cada página (e, definitivamente, na RLS).
 */
export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const perfil = await obterPerfilAtual();

  if (!perfil) redirect('/login');
  if (!perfil.ativo) redirect('/sem-acesso');

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MenuLateral perfil={perfil} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
