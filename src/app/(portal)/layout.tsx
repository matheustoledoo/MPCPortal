import { redirect } from 'next/navigation';

import { MenuLateral } from '@/components/layout/MenuLateral';
import { ServidorIndisponivel } from '@/components/ServidorIndisponivel';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterResultadoPerfil } from '@/lib/supabase/server';

/**
 * Casca do portal. Garante que só entra aqui quem tem sessão e perfil ativo.
 * A checagem por rota fica em cada página (e, definitivamente, na RLS).
 */
export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const resultado = await obterResultadoPerfil();

  // "Não consegui verificar" ≠ "não está logado": mandar para o login aqui
  // criaria um laço com o middleware. Mostra-se o diagnóstico.
  if (resultado.estado === 'indisponivel') {
    return <ServidorIndisponivel detalhe={resultado.detalhe} />;
  }
  if (resultado.estado === 'sem-sessao') redirect('/login');
  if (resultado.estado === 'inativo') redirect('/sem-acesso');

  const { perfil } = resultado;

  // Prazo vencido vira número vermelho no menu: quem abre o portal vê a
  // pendência sem precisar entrar na tela para descobrir que ela existe.
  let atrasados = 0;
  if (pode(perfil, PERMISSOES.telaProcessos)) {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.rpc('processos_estatisticas');
    atrasados = Number((data as { atrasados?: number } | null)?.atrasados ?? 0);
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MenuLateral perfil={perfil} avisos={{ '/controle-geral': atrasados }} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
