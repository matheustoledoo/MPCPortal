import { redirect } from 'next/navigation';

import { rotaInicial } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

/**
 * Porta de entrada: encaminha cada usuário para a área correta.
 * Admin → painel; Legalização → planilha; demais áreas → sua própria página.
 */
export default async function PaginaRaiz() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  redirect(rotaInicial(perfil));
}
