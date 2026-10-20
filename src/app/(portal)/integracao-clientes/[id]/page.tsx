import { notFound, redirect } from 'next/navigation';

import { RoteiroIntegracao } from '@/app/(portal)/integracao-clientes/[id]/RoteiroIntegracao';
import { DEPARTAMENTO_DA_AREA } from '@/lib/calendario';
import { deptosDaPessoa, ehDepartamentoIntegracao } from '@/lib/integracao';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Departamento, Integracao, IntegracaoDepartamento, ResumoIntegracao } from '@/types/banco';

export const metadata = { title: 'Integração de Clientes' };

/**
 * Um cliente, o roteiro de cada departamento. A RLS entrega só os roteiros
 * que a pessoa pode ver (o do próprio departamento, ou todos com acesso
 * geral); dos outros vem apenas a situação, por `integracoes_resumo()`.
 */
export default async function PaginaRoteiro({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dept?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaIntegracao)) redirect('/sem-acesso');

  const { id } = await params;
  const { dept } = await searchParams;
  const supabase = await criarClienteServidor();

  const [{ data: integracao }, { data: linhas }, { data: resumo }] = await Promise.all([
    supabase.from('integracoes').select('*').eq('id', id).maybeSingle(),
    supabase.from('integracao_departamentos').select('*').eq('integracao_id', id),
    supabase.rpc('integracoes_resumo'),
  ]);
  if (!integracao) notFound();

  const integ = integracao as Integracao;
  const { data: evento } = integ.evento_id
    ? await supabase.from('calendario_eventos').select('id, titulo, data').eq('id', integ.evento_id).maybeSingle()
    : { data: null };

  const todos = pode(perfil, PERMISSOES.calendarioTodos);
  const gerencia = pode(perfil, PERMISSOES.gerenciarCalendario);
  const meuDepartamento: Departamento = DEPARTAMENTO_DA_AREA[perfil.area ?? ''] ?? 'Matriz';
  const deptos = deptosDaPessoa(meuDepartamento, todos);
  const inicial =
    ehDepartamentoIntegracao(dept) && deptos.includes(dept)
      ? dept
      : ehDepartamentoIntegracao(meuDepartamento) && deptos.includes(meuDepartamento)
        ? meuDepartamento
        : (deptos[0] ?? null);

  return (
    <div className="p-5 sm:p-7">
      <RoteiroIntegracao
        integracao={integ}
        linhasIniciais={(linhas ?? []) as IntegracaoDepartamento[]}
        resumoInicial={((resumo ?? []) as ResumoIntegracao[]).filter((r) => r.integracao_id === id)}
        evento={(evento as { id: string; titulo: string; data: string } | null) ?? null}
        deptos={deptos}
        deptInicial={inicial}
        meuId={perfil.id}
        meuNome={perfil.nome}
        podeReabrirTodos={todos}
        podeReabrirMeu={gerencia ? meuDepartamento : null}
        podeExcluir={todos || pode(perfil, PERMISSOES.excluirIntegracao)}
      />
    </div>
  );
}
