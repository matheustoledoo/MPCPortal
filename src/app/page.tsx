import { redirect } from 'next/navigation';

import { ServidorIndisponivel } from '@/components/ServidorIndisponivel';
import { rotaInicial } from '@/lib/permissoes';
import { obterResultadoPerfil } from '@/lib/supabase/server';

/**
 * Porta de entrada: encaminha cada usuário para a área correta.
 * Admin → painel; Legalização → planilha; demais áreas → sua própria página.
 */
export default async function PaginaRaiz() {
  const resultado = await obterResultadoPerfil();

  if (resultado.estado === 'indisponivel') {
    return <ServidorIndisponivel detalhe={resultado.detalhe} />;
  }
  if (resultado.estado === 'sem-sessao') redirect('/login');
  if (resultado.estado === 'inativo') redirect('/sem-acesso');

  redirect(rotaInicial(resultado.perfil));
}
