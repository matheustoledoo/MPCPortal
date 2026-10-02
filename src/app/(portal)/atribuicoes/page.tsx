import { redirect } from 'next/navigation';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PainelAtribuicoes } from '@/app/(portal)/atribuicoes/PainelAtribuicoes';
import { Selo } from '@/components/ui';
import { COLUNAS_GERAIS } from '@/lib/colunas';
import { PERMISSOES, pode, podeGerenciarAtribuicoes } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { AtribuicaoComResponsavel, Perfil } from '@/types/banco';

export const metadata = { title: 'Atribuições' };

export default async function PaginaAtribuicoes() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaAtribuicoes)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  // Quem gerencia precisa da lista de gente para escolher o responsável;
  // quem só consulta não precisa — e a RLS de `profiles` decide o resto.
  const podeGerir = podeGerenciarAtribuicoes(perfil);

  const [{ data: atribuicoes, error }, { data: pessoas }] = await Promise.all([
    supabase
      .from('atribuicoes')
      .select(
        'id, titulo, descricao, responsavel_id, area, tabela, colunas, periodicidade, ' +
          'proximo_prazo, alerta_dias_antes, ativa, criado_por, created_at, updated_at, ' +
          'responsavel:profiles!atribuicoes_responsavel_id_fkey(id, nome, email, area)',
      )
      .order('ativa', { ascending: false })
      .order('proximo_prazo'),
    podeGerir
      ? supabase.from('profiles').select('id, nome, email, area, role, ativo').order('nome')
      : Promise.resolve({ data: [] }),
  ]);

  const lista = (atribuicoes ?? []) as unknown as AtribuicaoComResponsavel[];
  const ativas = lista.filter((a) => a.ativa);

  return (
    <>
      <CabecalhoPagina
        titulo="Atribuições"
        descricao="Quem é responsável por manter cada parte da base em dia — e até quando."
        acoes={
          <Selo tom="marca">
            {ativas.length} ativa{ativas.length === 1 ? '' : 's'}
          </Selo>
        }
      />
      <div className="p-5 sm:p-7">
        <PainelAtribuicoes
          meuPerfil={perfil}
          atribuicoesIniciais={lista}
          pessoas={(pessoas ?? []) as Pick<Perfil, 'id' | 'nome' | 'email' | 'area' | 'role' | 'ativo'>[]}
          colunasDisponiveis={COLUNAS_GERAIS.map((c) => ({ campo: c.campo, rotulo: c.rotulo }))}
          erroCarregamento={error?.message ?? null}
        />
      </div>
    </>
  );
}
