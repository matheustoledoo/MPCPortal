import { redirect } from 'next/navigation';

import { Info } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { TabelaPlanilha } from '@/components/planilha/TabelaPlanilha';
import { Selo } from '@/components/ui';
import { responsaveisPorColuna } from '@/lib/atribuicoes';
import { COLUNAS_GERAIS } from '@/lib/colunas';
import {
  PERMISSOES,
  pode,
  podeEditarLegalizacao,
  podeExcluirLegalizacao,
  podeLerLegalizacao,
  rotuloPeriodicidade,
} from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Planilha Legalização' };

export default async function PaginaLegalizacao() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!podeLerLegalizacao(perfil)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const responsaveis = await responsaveisPorColuna(supabase, perfil.id, rotuloPeriodicidade);

  const minhasColunas = perfil.colunasEditaveis;
  const rotuloDe = (campo: string) =>
    COLUNAS_GERAIS.find((c) => c.campo === campo)?.rotulo ?? campo;

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

      {minhasColunas.length > 0 && (
        <div className="sem-impressao border-b border-borda bg-marca-50/60 px-5 py-2.5 text-xs leading-relaxed text-marca-800 sm:px-7">
          Sua atribuição cobre {minhasColunas.length} coluna(s):{' '}
          <strong>{minhasColunas.map(rotuloDe).join(', ')}</strong>. As demais aparecem para
          consulta, mas ficam bloqueadas para edição.
        </div>
      )}

      <TabelaPlanilha
        podeVerAdministrativo={false}
        podeEditar={podeEditarLegalizacao(perfil)}
        podeExcluir={podeExcluirLegalizacao(perfil)}
        podeExportar={pode(perfil, PERMISSOES.exportarLegalizacao)}
        colunasEditaveis={minhasColunas}
        responsaveisPorColuna={responsaveis}
        contexto="legalizacao"
      />
    </>
  );
}
