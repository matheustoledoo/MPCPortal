import { redirect } from 'next/navigation';

import { Info } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { TabelaPlanilha } from '@/components/planilha/TabelaPlanilha';
import { Selo } from '@/components/ui';
import { podeEditarLegalizacao, podeExcluirLegalizacao, podeLerLegalizacao } from '@/lib/permissoes';
import { obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Planilha Legalização' };

export default async function PaginaLegalizacao() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!podeLerLegalizacao(perfil)) redirect('/sem-acesso');

  return (
    <>
      <CabecalhoPagina
        titulo="Planilha Legalização"
        descricao="Base geral consolidada das duas planilhas de trabalho. Duplo clique numa célula para editar."
        acoes={
          <Selo tom="marca">
            <Info className="h-3 w-3" />
            Campos financeiros não fazem parte desta base
          </Selo>
        }
      />

      <TabelaPlanilha
        podeVerAdministrativo={false}
        podeEditar={podeEditarLegalizacao(perfil)}
        podeExcluir={podeExcluirLegalizacao(perfil)}
        contexto="legalizacao"
      />
    </>
  );
}
