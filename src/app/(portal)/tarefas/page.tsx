import { redirect } from 'next/navigation';

import { QuadroTarefas } from '@/app/(portal)/tarefas/QuadroTarefas';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import { CAMPOS_TAREFA } from '@/lib/tarefas';
import type { PessoaEquipe, Tarefa } from '@/types/banco';

export const metadata = { title: 'Tarefas e lembretes' };

/**
 * Quadro de tarefas (Kanban). A RLS entrega só o que a pessoa pode ver:
 * as tarefas dela, as que ela criou e as não privadas da equipe.
 * `?tarefa=<id>` abre o cartão — é o link usado pelo calendário e pelas
 * notificações.
 */
export default async function PaginaTarefas({ searchParams }: { searchParams: Promise<{ tarefa?: string; nova?: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaTarefas)) redirect('/sem-acesso');

  const { tarefa, nova } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: tarefas }, { data: pessoas }] = await Promise.all([
    supabase.from('tarefas').select(CAMPOS_TAREFA).order('ordem'),
    supabase.from('profiles').select('id, nome, area').eq('ativo', true).order('nome'),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Tarefas e lembretes"
        descricao="Organize o trabalho em colunas, arraste os cartões conforme avançam e acompanhe prazos. Tudo que tem data aparece no calendário de quem é responsável."
      />
      <div className="p-5 sm:p-7">
        <QuadroTarefas
          meuId={perfil.id}
          meuNome={perfil.nome}
          gerencia={pode(perfil, PERMISSOES.gerenciarTarefas)}
          podeOpcoes={pode(perfil, PERMISSOES.gerenciarOpcoes)}
          tarefasIniciais={(tarefas ?? []) as unknown as Tarefa[]}
          pessoas={(pessoas ?? []) as PessoaEquipe[]}
          abrirId={tarefa ?? null}
          abrirNova={nova === '1'}
        />
      </div>
    </>
  );
}
