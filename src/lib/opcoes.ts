'use client';

/**
 * Listas de opções reutilizáveis ("+ Adicionar outro").
 *
 * Todas as listas do portal — status, tributação, órgãos, origem do lead,
 * motivo de saída… — moram na mesma tabela (`legalizacao_opcoes`), separadas
 * por `grupo`. Uma opção criada num lugar aparece nos outros que usam o mesmo
 * grupo. As opções de fábrica (`padrao`) não podem ser excluídas; as
 * personalizadas só saem depois da checagem de dependências feita no banco
 * (`opcao_excluir`). Quem pode criar/excluir: permissão
 * `dados.opcoes.gerenciar`, verificada no banco.
 */

import { useCallback, useEffect, useState } from 'react';

import { criarClienteNavegador } from '@/lib/supabase/client';
import type { OpcaoLista } from '@/types/banco';

const cache = new Map<string, OpcaoLista[]>();
const pendentes = new Map<string, Promise<void>>();
const ouvintes = new Set<() => void>();

function avisar() {
  for (const f of ouvintes) f();
}

async function carregar(grupos: string[], forcar = false): Promise<void> {
  const faltam = grupos.filter((g) => forcar || (!cache.has(g) && !pendentes.has(g)));
  if (faltam.length === 0) {
    await Promise.all(grupos.map((g) => pendentes.get(g)).filter(Boolean));
    return;
  }
  const promessa = (async () => {
    const supabase = criarClienteNavegador();
    const { data } = await supabase
      .from('legalizacao_opcoes')
      .select('id, grupo, valor, ordem, ativo, padrao')
      .in('grupo', faltam)
      .eq('ativo', true)
      .order('ordem')
      .order('valor');
    for (const g of faltam) cache.set(g, []);
    for (const o of (data ?? []) as OpcaoLista[]) cache.get(o.grupo)?.push(o);
    for (const g of faltam) pendentes.delete(g);
    avisar();
  })();
  for (const g of faltam) pendentes.set(g, promessa);
  await promessa;
}

/** Semeia o cache com o que o servidor já buscou (evita uma ida ao banco). */
export function semearOpcoes(opcoes: OpcaoLista[], grupos: string[]) {
  for (const g of grupos) if (!cache.has(g)) cache.set(g, opcoes.filter((o) => o.grupo === g));
}

export async function adicionarOpcao(grupo: string, valor: string): Promise<string> {
  const supabase = criarClienteNavegador();
  const { data, error } = await supabase.rpc('opcao_adicionar', { p_grupo: grupo, p_valor: valor });
  if (error) throw new Error(error.message);
  await carregar([grupo], true);
  return String(data ?? valor);
}

export async function usoDaOpcao(grupo: string, valor: string): Promise<number> {
  const supabase = criarClienteNavegador();
  const { data } = await supabase.rpc('opcao_uso', { p_grupo: grupo, p_valor: valor });
  return Number(data ?? 0);
}

/** `substituir`: `undefined` = só excluir se não estiver em uso; '' = deixar em branco. */
export async function excluirOpcao(
  grupo: string,
  valor: string,
  substituir?: string,
): Promise<{ ok: boolean; em_uso?: number; substituidos?: number }> {
  const supabase = criarClienteNavegador();
  const { data, error } = await supabase.rpc('opcao_excluir', {
    p_grupo: grupo,
    p_valor: valor,
    p_substituir: substituir ?? null,
  });
  if (error) throw new Error(error.message);
  const resultado = data as { ok: boolean; em_uso?: number; substituidos?: number };
  if (resultado.ok) await carregar([grupo], true);
  return resultado;
}

/** Opções de um ou mais grupos, sempre atualizadas entre os campos da tela. */
export function useOpcoes(...grupos: string[]): Record<string, OpcaoLista[]> {
  const chave = grupos.join('|');
  const [, forcar] = useState(0);

  useEffect(() => {
    const ouvir = () => forcar((n) => n + 1);
    ouvintes.add(ouvir);
    void carregar(chave.split('|').filter(Boolean));
    return () => {
      ouvintes.delete(ouvir);
    };
  }, [chave]);

  const resultado: Record<string, OpcaoLista[]> = {};
  for (const g of grupos) resultado[g] = cache.get(g) ?? [];
  return resultado;
}

export function useValoresOpcoes(grupo: string): string[] {
  const lista = useOpcoes(grupo)[grupo];
  return lista.map((o) => o.valor);
}

export const recarregarOpcoes = (grupos: string[]) => carregar(grupos, true);

/** Para quem precisa do retorno imperativo (ex.: célula da planilha). */
export function useAcoesOpcoes() {
  return {
    adicionar: useCallback(adicionarOpcao, []),
    excluir: useCallback(excluirOpcao, []),
    uso: useCallback(usoDaOpcao, []),
  };
}
