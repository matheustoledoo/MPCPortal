import { redirect } from 'next/navigation';

import { BarraSuperior } from '@/components/layout/BarraSuperior';
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
  const supabase = await criarClienteServidor();

  // Prazo vencido vira número vermelho no menu: quem abre o portal vê a
  // pendência sem precisar entrar na tela para descobrir que ela existe.
  const [estatisticas, notificacoes] = await Promise.all([
    pode(perfil, PERMISSOES.telaProcessos) ? supabase.rpc('processos_estatisticas') : Promise.resolve({ data: null }),
    supabase.rpc('contar_notificacoes'),
  ]);
  const atrasados = Number((estatisticas.data as { atrasados?: number } | null)?.atrasados ?? 0);
  const naoLidas = Number((notificacoes.data as { nao_lidas?: number } | null)?.nao_lidas ?? 0);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MenuLateral perfil={perfil} avisos={{ '/controle-legalizacao': atrasados, '/notificacoes': naoLidas }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior perfil={perfil} />
        {children}
      </div>
    </div>
  );
}
