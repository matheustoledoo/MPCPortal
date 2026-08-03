import { redirect } from 'next/navigation';

import { AreaEmConstrucao } from '@/components/layout/AreaEmConstrucao';
import { ehAdmin } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Departamento Pessoal' };

export default async function PaginaDepartamentoPessoal() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!ehAdmin(perfil) && perfil.area !== 'departamento_pessoal') redirect('/sem-acesso');

  return (
    <AreaEmConstrucao
      area="Departamento Pessoal"
      descricao="Folha de pagamento, admissões, férias e rescisões."
      previstos={[
        'Cadastro de colaboradores por empresa cliente',
        'Controle de admissões, férias, afastamentos e rescisões',
        'Calendário da folha e dos encargos mensais',
        'Conferência de eSocial e envio de documentos',
      ]}
    />
  );
}
