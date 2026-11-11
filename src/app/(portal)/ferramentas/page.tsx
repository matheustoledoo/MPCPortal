import { redirect } from 'next/navigation';

import { FerramentasApp } from '@/app/(portal)/ferramentas/FerramentasApp';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { CalculoSalvo, EventoCalendario, TabelaFerramenta } from '@/types/banco';

export const metadata = { title: 'Ferramentas' };

/**
 * Calculadoras da rotina contábil. As tabelas (alíquotas, faixas, limites)
 * vêm do banco com fonte legal e vigência; `?f=<id>` abre uma ferramenta.
 */
export default async function PaginaFerramentas({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaFerramentas)) redirect('/sem-acesso');

  const { f } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: tabelas }, { data: calculos }, { data: feriados }] = await Promise.all([
    supabase.from('ferramentas_tabelas').select('id, chave, vigencia_inicio, titulo, dados, fonte, fonte_url, observacao, conferido_em, updated_at').order('vigencia_inicio', { ascending: false }),
    supabase.from('ferramentas_calculos').select('id, ferramenta, titulo, entrada, resultado, created_at').order('created_at', { ascending: false }).limit(120),
    // Feriados cadastrados no Calendário entram na contagem de dias úteis.
    supabase.from('calendario_eventos').select('id, titulo, data, categoria, recorrencia').eq('categoria', 'Feriado'),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Ferramentas"
        descricao="Calculadoras da rotina contábil, com o passo a passo de cada resultado e a base legal em vigor."
      />
      <div className="p-5 sm:p-7">
        <FerramentasApp
          tabelas={(tabelas ?? []) as TabelaFerramenta[]}
          calculosIniciais={(calculos ?? []) as CalculoSalvo[]}
          feriados={(feriados ?? []) as unknown as EventoCalendario[]}
          abrir={f ?? null}
          podeEditarTabelas={ehAdmin(perfil)}
        />
      </div>
    </>
  );
}
