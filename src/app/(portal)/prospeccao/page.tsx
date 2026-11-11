import { redirect } from 'next/navigation';

import { ProspeccaoApp } from '@/app/(portal)/prospeccao/ProspeccaoApp';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { CAMPOS_LEAD } from '@/lib/prospeccao';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { EtapaProspeccao, Lead, PessoaEquipe } from '@/types/banco';

export const metadata = { title: 'Prospecção' };

/**
 * CRM Metaplano: funil de prospecção de novos clientes.
 * `?lead=<id>` abre a ficha — é o link usado pelo calendário e pelas
 * notificações das ações agendadas.
 */
export default async function PaginaProspeccao({ searchParams }: { searchParams: Promise<{ lead?: string; aba?: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaProspeccao)) redirect('/sem-acesso');

  const { lead, aba } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: etapas }, { data: leads }, { data: pessoas }] = await Promise.all([
    supabase.from('prospeccao_etapas').select('*').order('ordem'),
    supabase.from('prospeccao_leads').select(CAMPOS_LEAD).order('ordem'),
    supabase.from('profiles').select('id, nome, area').eq('ativo', true).order('nome'),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Prospecção"
        descricao="CRM Metaplano — acompanhe cada oportunidade do primeiro contato à conversão, com histórico, próxima ação e indicadores comerciais."
      />
      <div className="p-5 sm:p-7">
        <ProspeccaoApp
          meuId={perfil.id}
          permissoes={{
            editar: pode(perfil, PERMISSOES.editarProspeccao),
            excluir: pode(perfil, PERMISSOES.excluirProspeccao),
            etapas: ehAdmin(perfil),
            opcoes: pode(perfil, PERMISSOES.gerenciarOpcoes),
            integracao: pode(perfil, PERMISSOES.telaIntegracao),
          }}
          etapasIniciais={(etapas ?? []) as EtapaProspeccao[]}
          leadsIniciais={(leads ?? []) as unknown as Lead[]}
          pessoas={(pessoas ?? []) as PessoaEquipe[]}
          abrirId={lead ?? null}
          abaInicial={aba === 'painel' || aba === 'lista' ? aba : 'funil'}
        />
      </div>
    </>
  );
}
