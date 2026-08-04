import { redirect } from 'next/navigation';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { FormularioPerfil } from '@/app/(portal)/perfil/FormularioPerfil';
import { CabecalhoCartao, Cartao, Selo } from '@/components/ui';
import { rotuloArea, rotuloRole } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Meu perfil' };

export default async function PaginaPerfil() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');

  return (
    <>
      <CabecalhoPagina titulo="Meu perfil" descricao="Seus dados de acesso ao PortalMPC." />

      <div className="grid max-w-4xl gap-4 p-5 sm:p-7 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao titulo="Dados pessoais" descricao="Nome e telefone podem ser editados por você." />
          <div className="p-5">
            <FormularioPerfil perfil={perfil} />
          </div>
        </Cartao>

        <div className="space-y-4">
          <Cartao>
            <CabecalhoCartao
              titulo="Acesso"
              descricao="Área e função são definidas pelo administrador."
            />
            <dl className="divide-y divide-borda">
              <Item rotulo="E-mail" valor={perfil.email} />
              <Item rotulo="Área" valor={<Selo tom="marca">{rotuloArea(perfil.area)}</Selo>} />
              <Item rotulo="Função" valor={<Selo>{rotuloRole(perfil.role)}</Selo>} />
              <Item
                rotulo="Situação"
                valor={
                  <Selo tom={perfil.ativo ? 'sucesso' : 'erro'}>
                    {perfil.ativo ? 'Ativo' : 'Inativo'}
                  </Selo>
                }
              />
              <Item
                rotulo="Último acesso"
                valor={
                  perfil.ultimo_acesso
                    ? new Date(perfil.ultimo_acesso).toLocaleString('pt-BR')
                    : 'primeiro acesso'
                }
              />
            </dl>
          </Cartao>

          <Cartao className="p-5">
            <h3 className="text-sm font-semibold text-texto">Alterar senha</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
              Para trocar a senha, saia do portal e use a opção{' '}
              <a href="/recuperar-senha" className="font-medium text-marca-700 hover:underline">
                esqueci minha senha
              </a>
              . O link chega no seu e-mail corporativo.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd className="text-sm font-medium text-texto">{valor}</dd>
    </div>
  );
}
