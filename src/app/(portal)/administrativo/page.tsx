import { redirect } from 'next/navigation';

import { Lock } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { TabelaPlanilha } from '@/components/planilha/TabelaPlanilha';
import { Selo } from '@/components/ui';
import { responsaveisPorColuna } from '@/lib/atribuicoes';
import { ehAdmin, rotuloPeriodicidade } from '@/lib/permissoes';
import { carregarConfiguracaoPlanilha, parametrosDaPlanilha } from '@/lib/planilha/servidor';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Planilha ADM' };

/**
 * Página exclusiva de administradores.
 * O acesso direto pela URL é bloqueado aqui E pela RLS: mesmo que a página
 * renderizasse, o banco não devolveria uma única linha administrativa.
 *
 * Tem tudo o que a Planilha Legalização tem — filtros por coluna, ordenação,
 * importação, fórmulas, colunas novas — e as colunas da equipe podem ser
 * guardadas no bloco confidencial.
 */
export default async function PaginaAdministrativo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!ehAdmin(perfil)) redirect('/sem-acesso');

  const parametros = parametrosDaPlanilha(await searchParams);
  const supabase = await criarClienteServidor();
  const [responsaveis, configuracao] = await Promise.all([
    responsaveisPorColuna(supabase, perfil.id, rotuloPeriodicidade),
    carregarConfiguracaoPlanilha(supabase, 'administrativo', [
      'legalizacao_empresas',
      'legalizacao_dados_administrativos',
    ]),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Planilha ADM"
        descricao="Dados gerais somados ao bloco financeiro e contratual do Adm.xlsx."
        acoes={
          <Selo tom="alerta">
            <Lock className="h-3 w-3" />
            Confidencial — somente administradores
          </Selo>
        }
      />

      <div className="sem-impressao border-b border-amber-200 bg-alerta-suave px-5 py-2.5 text-xs leading-relaxed text-alerta sm:px-7">
        As colunas marcadas com <strong>ADM</strong> vêm da tabela
        <code className="mx-1 rounded bg-white/60 px-1 py-0.5 font-mono">legalizacao_dados_administrativos</code>
        e nunca são enviadas a usuários das demais áreas. Cada alteração fica registrada na auditoria
        com o seu nome.
      </div>

      <TabelaPlanilha
        contexto="administrativo"
        podeVerAdministrativo
        podeEditar
        podeCriar
        podeExcluir
        podeImportar
        podePersonalizarColunas
        responsaveisPorColuna={responsaveis}
        definicoesIniciais={configuracao.definicoes}
        preferenciasIniciais={configuracao.preferencias}
        parametros={parametros}
      />
    </>
  );
}
