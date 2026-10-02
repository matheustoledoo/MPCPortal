import { redirect } from 'next/navigation';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { ListaAuditoria } from '@/app/(portal)/auditoria/ListaAuditoria';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Auditoria' };

export default async function PaginaAuditoria() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaAuditoria)) redirect('/sem-acesso');

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Toda criação, edição, exclusão, importação e exportação registrada pelo banco de dados."
      />
      <div className="p-5 sm:p-7">
        <ListaAuditoria />
      </div>
    </>
  );
}
