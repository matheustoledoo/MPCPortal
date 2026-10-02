import { redirect } from 'next/navigation';

import { Lock } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { TabelaPlanilha } from '@/components/planilha/TabelaPlanilha';
import { Selo } from '@/components/ui';
import { responsaveisPorColuna } from '@/lib/atribuicoes';
import { ehAdmin, rotuloPeriodicidade } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';

export const metadata = { title: 'Planilha ADM' };

/**
 * Página exclusiva de administradores.
 * O acesso direto pela URL é bloqueado aqui E pela RLS: mesmo que a página
 * renderizasse, o banco não devolveria uma única linha administrativa.
 */
export default async function PaginaAdministrativo() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!ehAdmin(perfil)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const responsaveis = await responsaveisPorColuna(supabase, perfil.id, rotuloPeriodicidade);

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
        podeVerAdministrativo
        podeEditar
        podeExcluir
        responsaveisPorColuna={responsaveis}
        contexto="administrativo"
      />
    </>
  );
}
