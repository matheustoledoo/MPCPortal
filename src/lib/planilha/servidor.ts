import type { SupabaseClient } from '@supabase/supabase-js';

import type { ParametrosIniciais, PreferenciasPlanilha } from '@/components/planilha/TabelaPlanilha';
import { filtrosDaUrl } from '@/lib/planilha/filtros';
import type { PlanilhaColuna, TabelaPlanilha } from '@/types/banco';

/**
 * O que a página da planilha busca no servidor antes de desenhar: as colunas
 * da equipe e as preferências da pessoa — assim a tabela já abre do jeito
 * certo, sem piscar.
 */
export async function carregarConfiguracaoPlanilha(
  supabase: SupabaseClient,
  contexto: 'legalizacao' | 'administrativo',
  tabelas: TabelaPlanilha[],
): Promise<{ definicoes: PlanilhaColuna[]; preferencias: PreferenciasPlanilha | null }> {
  const [{ data: definicoes }, { data: preferencia }] = await Promise.all([
    supabase.from('planilha_colunas').select('*').in('tabela', tabelas).order('ordem'),
    supabase.from('usuario_preferencias').select('valor').eq('chave', `planilha:${contexto}`).maybeSingle(),
  ]);
  return {
    definicoes: (definicoes ?? []) as PlanilhaColuna[],
    preferencias: (preferencia?.valor as PreferenciasPlanilha | undefined) ?? null,
  };
}

/** `?busca=…&empresa=…&vencimentos=1&f.cidade=Jundiaí` → estado inicial da tabela. */
export function parametrosDaPlanilha(busca: Record<string, string | string[] | undefined>): ParametrosIniciais {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return {
    busca: um(busca.busca) ?? '',
    empresa: um(busca.empresa),
    vencimentos: um(busca.vencimentos) === '1',
    filtros: filtrosDaUrl(busca),
  };
}
