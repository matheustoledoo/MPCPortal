import { redirect } from 'next/navigation';

import { AreaEmConstrucao } from '@/components/layout/AreaEmConstrucao';
import { ehAdmin } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Contábil' };

export default async function PaginaContabil() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!ehAdmin(perfil) && perfil.area !== 'contabil') redirect('/sem-acesso');

  return (
    <AreaEmConstrucao
      area="Contábil"
      descricao="Escrituração, balancetes e encerramento de exercício."
      previstos={[
        'Controle de fechamento contábil mensal por empresa',
        'Conferência de balancetes e conciliações pendentes',
        'Acompanhamento de documentos recebidos dos clientes',
        'Geração de relatórios contábeis para os sócios',
      ]}
    />
  );
}
