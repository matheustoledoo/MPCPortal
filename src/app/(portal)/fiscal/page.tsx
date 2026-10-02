import { redirect } from 'next/navigation';

import { AreaEmConstrucao } from '@/components/layout/AreaEmConstrucao';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Fiscal' };

export default async function PaginaFiscal() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaFiscal)) redirect('/sem-acesso');

  return (
    <AreaEmConstrucao
      area="Fiscal"
      descricao="Apuração de tributos, obrigações acessórias e notas fiscais."
      previstos={[
        'Controle de apurações mensais por empresa e regime tributário',
        'Calendário de obrigações acessórias com alertas de prazo',
        'Importação de notas fiscais e conferência de faturamento',
        'Emissão e acompanhamento de guias',
      ]}
    />
  );
}
