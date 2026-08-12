import { redirect } from 'next/navigation';

import { ClipboardList } from 'lucide-react';

import { PainelProcessos } from '@/app/(portal)/controle-geral/PainelProcessos';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Selo } from '@/components/ui';
import {
  PERMISSOES,
  pode,
  podeCriarProcessos,
  podeEditarProcessos,
  podeExcluirProcessos,
  podeGerenciarOpcoes,
} from '@/lib/permissoes';
import { GRUPOS_OPCOES, buscarProcessos } from '@/lib/processos';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { EstatisticasProcessos, Perfil } from '@/types/banco';

export const metadata = { title: 'Controle Geral' };

const ESTATISTICAS_VAZIAS: EstatisticasProcessos = {
  total: 0, abertos: 0, atrasados: 0, atencao: 0, sem_prazo: 0, concluidos_mes: 0,
  por_status: [], por_orgao: [], por_tipo: [], por_responsavel: [], vencimentos_por_mes: [],
};

export default async function PaginaControleGeral({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaProcessos)) redirect('/sem-acesso');

  const { empresa: empresaId } = await searchParams;
  const supabase = await criarClienteServidor();

  const [processos, { data: stats }, { data: opcoesBrutas }, { data: pessoas }, { data: empresa }] =
    await Promise.all([
      buscarProcessos(supabase, {
        recorte: 'abertos',
        empresaId,
        ordenarPor: 'prazo',
        ascendente: true,
      }).catch(() => []),
      supabase.rpc('processos_estatisticas'),
      supabase.from('legalizacao_opcoes').select('grupo, valor, ordem').eq('ativo', true).order('ordem'),
      supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
      empresaId
        ? supabase.from('legalizacao_empresas').select('id, razao_social').eq('id', empresaId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Agrupa as listas por campo aqui: a tela não precisa refazer isso a cada
  // render, e assim um grupo novo no banco aparece sem tocar em código.
  const opcoes: Record<string, string[]> = Object.fromEntries(GRUPOS_OPCOES.map((g) => [g, []]));
  for (const linha of opcoesBrutas ?? []) {
    const grupo = linha.grupo as string;
    (opcoes[grupo] ??= []).push(linha.valor as string);
  }

  const estatisticas = { ...ESTATISTICAS_VAZIAS, ...((stats ?? {}) as Partial<EstatisticasProcessos>) };
  const empresaFiltrada = empresa
    ? { id: (empresa as { id: string }).id, nome: (empresa as { razao_social: string }).razao_social }
    : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Controle Geral"
        descricao="Processos de legalização em andamento nos órgãos — a aba CONTROLE_GERAL da planilha, ligada à base de clientes."
        acoes={
          <Selo tom={estatisticas.atrasados > 0 ? 'erro' : 'marca'}>
            <ClipboardList className="h-3 w-3" />
            {estatisticas.abertos} em aberto
            {estatisticas.atrasados > 0 && ` · ${estatisticas.atrasados} atrasado(s)`}
          </Selo>
        }
      />

      <div className="p-5 sm:p-7">
        <PainelProcessos
          processosIniciais={processos}
          estatisticasIniciais={estatisticas}
          opcoesIniciais={opcoes}
          pessoas={(pessoas ?? []) as Pick<Perfil, 'id' | 'nome'>[]}
          podeCriar={podeCriarProcessos(perfil)}
          podeEditar={podeEditarProcessos(perfil)}
          podeExcluir={podeExcluirProcessos(perfil)}
          podeAdicionarOpcao={podeGerenciarOpcoes(perfil)}
          empresaFiltrada={empresaFiltrada}
        />
      </div>
    </>
  );
}
