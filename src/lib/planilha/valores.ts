/**
 * Leitura dos valores de uma linha da planilha, do jeito que cada parte da
 * tela precisa: bruto (para editar), tipado (para as fórmulas), texto (para
 * buscar, filtrar e exportar).
 *
 * Usado no navegador e na rota de exportação, para que o Excel baixado saia
 * com exatamente os mesmos números que a tela mostra.
 */

import type { DefinicaoColuna } from '@/lib/colunas';
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/normalizacao';
import {
  ErroFormula,
  avaliarFormula,
  compilarComCache,
  formatarDataBr,
  lerData,
  normalizarNome,
  paraTexto,
  type ValorFormula,
} from '@/lib/planilha/formulas';

/** O mínimo que uma linha precisa ter — serve para empresas e processos. */
export interface LinhaPlanilha {
  id: string;
  campos_extras?: Record<string, unknown> | null;
  administrativo?: (Record<string, unknown> & { campos_extras?: Record<string, unknown> | null }) | null;
  [campo: string]: unknown;
}

export function valorBruto(linha: LinhaPlanilha, coluna: DefinicaoColuna): unknown {
  if (coluna.personalizada) {
    const origem = coluna.confidencial ? linha.administrativo?.campos_extras : linha.campos_extras;
    return origem ? (origem as Record<string, unknown>)[coluna.campo] ?? null : null;
  }
  if (coluna.confidencial) return linha.administrativo ? linha.administrativo[coluna.campo] ?? null : null;
  return linha[coluna.campo] ?? null;
}

/** O valor como as fórmulas o enxergam: data vira data, número vira número. */
export function valorTipado(bruto: unknown, coluna: DefinicaoColuna): ValorFormula {
  if (bruto === null || bruto === undefined || bruto === '') return null;
  switch (coluna.tipo) {
    case 'data': {
      const d = typeof bruto === 'string' ? lerData(bruto) : bruto instanceof Date ? bruto : null;
      return d ?? String(bruto);
    }
    case 'numero':
    case 'moeda':
    case 'processos': {
      const n = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(',', '.'));
      return Number.isFinite(n) ? n : String(bruto);
    }
    case 'booleano':
      return Boolean(bruto);
    default:
      return typeof bruto === 'string' ? bruto : String(bruto);
  }
}

export interface ResultadoFormula {
  valor: ValorFormula;
  erro?: ErroFormula;
}

/**
 * Calcula todas as colunas de fórmula de uma linha.
 *
 * Fórmula pode citar outra fórmula; o caminho percorrido fica numa pilha
 * para que A → B → A vire #CICLO! em vez de travar o navegador.
 */
export function calcularFormulas(
  linha: LinhaPlanilha,
  colunas: DefinicaoColuna[],
  hoje = new Date(),
): Record<string, ResultadoFormula> {
  const porNome = indiceDeColunas(colunas);
  const resultado: Record<string, ResultadoFormula> = {};
  const pilha: string[] = [];

  function valorDe(coluna: DefinicaoColuna): ValorFormula {
    if (coluna.tipo !== 'formula') return valorTipado(valorBruto(linha, coluna), coluna);
    const pronto = resultado[coluna.campo];
    if (pronto) {
      if (pronto.erro) throw pronto.erro;
      return pronto.valor;
    }
    if (pilha.includes(coluna.campo)) {
      throw new ErroFormula('#CICLO!', `A fórmula de "${coluna.rotulo}" depende dela mesma.`);
    }
    pilha.push(coluna.campo);
    try {
      const compilada = compilarComCache(coluna.formula ?? '');
      const valor = avaliarFormula(compilada, {
        hoje,
        ref: (nome) => {
          const alvo = porNome.get(normalizarNome(nome));
          if (!alvo) throw new ErroFormula('#REF!', `Coluna [${nome}] não existe.`);
          return valorDe(alvo);
        },
      });
      resultado[coluna.campo] = { valor };
      return valor;
    } catch (e) {
      const erro = e instanceof ErroFormula ? e : new ErroFormula('#ERRO!', String(e));
      resultado[coluna.campo] = { valor: null, erro };
      throw erro;
    } finally {
      pilha.pop();
    }
  }

  for (const coluna of colunas) {
    if (coluna.tipo !== 'formula' || resultado[coluna.campo]) continue;
    try {
      valorDe(coluna);
    } catch {
      /* o erro já ficou registrado em `resultado` */
    }
  }
  return resultado;
}

/** Rótulo e nome técnico, sem acento nem caixa, apontando para a coluna. */
export function indiceDeColunas(colunas: DefinicaoColuna[]): Map<string, DefinicaoColuna> {
  const mapa = new Map<string, DefinicaoColuna>();
  for (const coluna of colunas) {
    mapa.set(normalizarNome(coluna.campo), coluna);
  }
  // Rótulo vence o nome técnico em caso de empate: é o que a pessoa vê.
  for (const coluna of colunas) {
    mapa.set(normalizarNome(coluna.rotulo), coluna);
  }
  return mapa;
}

/** Valor efetivo da célula (bruto, ou o resultado da fórmula). */
export function valorDaCelula(
  linha: LinhaPlanilha,
  coluna: DefinicaoColuna,
  formulas?: Record<string, ResultadoFormula>,
): unknown {
  if (coluna.tipo === 'formula') return formulas?.[coluna.campo]?.valor ?? null;
  return valorBruto(linha, coluna);
}

/** Resultado de fórmula no formato escolhido para a coluna. */
export function textoDoResultado(valor: ValorFormula, coluna: DefinicaoColuna): string {
  if (valor === null || valor === '') return '';
  switch (coluna.formato) {
    case 'data':
      if (valor instanceof Date) return formatarDataBr(valor);
      return paraTexto(valor);
    case 'moeda':
      return typeof valor === 'number' ? formatarMoeda(valor) : paraTexto(valor);
    case 'numero':
      return typeof valor === 'number'
        ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
        : paraTexto(valor);
    case 'booleano':
      return typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : paraTexto(valor);
    default:
      if (valor instanceof Date) return formatarDataBr(valor);
      if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
      return paraTexto(valor);
  }
}

/** Texto exibido na célula — também é o que o filtro por valores lista. */
export function textoDaCelula(
  linha: LinhaPlanilha,
  coluna: DefinicaoColuna,
  formulas?: Record<string, ResultadoFormula>,
): string {
  if (coluna.tipo === 'formula') {
    const r = formulas?.[coluna.campo];
    if (!r) return '';
    if (r.erro) return r.erro.codigo;
    return textoDoResultado(r.valor, coluna);
  }
  const bruto = valorBruto(linha, coluna);
  if (bruto === null || bruto === undefined || bruto === '') return '';
  switch (coluna.tipo) {
    case 'cnpj':
      return formatarCnpj(bruto);
    case 'data':
      return formatarData(bruto);
    case 'moeda':
      return formatarMoeda(typeof bruto === 'number' ? bruto : Number(bruto));
    case 'booleano':
      return bruto ? 'Sim' : 'Não';
    case 'processos':
      return Number(bruto) > 0 ? String(bruto) : '';
    default:
      return String(bruto);
  }
}

/** Valor usado para ordenar: número/data quando dá, texto no resto. */
export function valorDeOrdenacao(
  linha: LinhaPlanilha,
  coluna: DefinicaoColuna,
  formulas?: Record<string, ResultadoFormula>,
): number | string | null {
  const v = coluna.tipo === 'formula' ? formulas?.[coluna.campo]?.valor ?? null : valorTipado(valorBruto(linha, coluna), coluna);
  if (v === null || v === '') return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
