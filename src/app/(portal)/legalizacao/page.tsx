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
  podeCriarEmpresas,
  podeEditarLegalizacao,
  podeExcluirLegalizacao,
  podeLerLegalizacao,
  rotuloPeriodicidade,
} from '@/lib/permissoes';
import { carregarConfiguracaoPlanilha, parametrosDaPlanilha } from '@/lib/planilha/servidor';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Planilha Legalização' };

export default async function PaginaLegalizacao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!podeLerLegalizacao(perfil)) redirect('/sem-acesso');

  const parametros = parametrosDaPlanilha(await searchParams);
  const supabase = await criarClienteServidor();
  const [responsaveis, configuracao] = await Promise.all([
    responsaveisPorColuna(supabase, perfil.id, rotuloPeriodicidade),
    carregarConfiguracaoPlanilha(supabase, 'legalizacao', ['legalizacao_empresas']),
  ]);

  const minhasColunas = perfil.colunasEditaveis;
  const rotuloDe = (campo: string) => COLUNAS_GERAIS.find((c) => c.campo === campo)?.rotulo ?? campo;

  return (
    <>
      <CabecalhoPagina
        titulo="Planilha Legalização"
        descricao="Base geral consolidada. Duplo clique numa célula para editar; a setinha de cada coluna filtra e ordena como no Excel."
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
        contexto="legalizacao"
        podeVerAdministrativo={false}
        podeEditar={podeEditarLegalizacao(perfil)}
        podeCriar={podeCriarEmpresas(perfil)}
        podeExcluir={podeExcluirLegalizacao(perfil)}
        podeExportar={pode(perfil, PERMISSOES.exportarLegalizacao)}
        podeImportar={pode(perfil, PERMISSOES.importarLegalizacao)}
        podePersonalizarColunas={pode(perfil, PERMISSOES.personalizarColunas)}
        atalhos={{
          processos: pode(perfil, PERMISSOES.telaProcessos),
          integracao: pode(perfil, PERMISSOES.telaIntegracao),
          calendario: pode(perfil, PERMISSOES.telaCalendario),
        }}
        colunasEditaveis={minhasColunas}
        responsaveisPorColuna={responsaveis}
        definicoesIniciais={configuracao.definicoes}
        preferenciasIniciais={configuracao.preferencias}
        parametros={parametros}
      />
    </>
  );
}
