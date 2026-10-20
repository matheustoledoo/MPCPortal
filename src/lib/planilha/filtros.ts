/**
 * Filtros e ordenação da planilha, feitos no navegador sobre a base inteira.
 *
 * Dois jeitos de filtrar convivem, como no Excel:
 *  - no cabeçalho de cada coluna: marcar valores numa lista e/ou uma condição;
 *  - no painel "Filtros": regras livres combinadas (as mesmas condições).
 * Tudo é aplicado junto (E lógico).
 */

import type { DefinicaoColuna } from '@/lib/colunas';
import { lerData, normalizarNome } from '@/lib/planilha/formulas';
import {
  textoDaCelula,
  valorDeOrdenacao,
  valorTipado,
  valorBruto,
  type LinhaPlanilha,
  type ResultadoFormula,
} from '@/lib/planilha/valores';

export type OperadorCondicao =
  | 'contem'
  | 'nao_contem'
  | 'igual'
  | 'diferente'
  | 'comeca'
  | 'termina'
  | 'maior'
  | 'menor'
  | 'maior_igual'
  | 'menor_igual'
  | 'entre'
  | 'vazio'
  | 'preenchido';

export const OPERADORES_CONDICAO: { valor: OperadorCondicao; rotulo: string; semValor?: boolean; doisValores?: boolean }[] = [
  { valor: 'contem', rotulo: 'contém' },
  { valor: 'nao_contem', rotulo: 'não contém' },
  { valor: 'igual', rotulo: 'é igual a' },
  { valor: 'diferente', rotulo: 'é diferente de' },
  { valor: 'comeca', rotulo: 'começa com' },
  { valor: 'termina', rotulo: 'termina com' },
  { valor: 'maior', rotulo: 'maior que' },
  { valor: 'maior_igual', rotulo: 'maior ou igual a' },
  { valor: 'menor', rotulo: 'menor que' },
  { valor: 'menor_igual', rotulo: 'menor ou igual a' },
  { valor: 'entre', rotulo: 'entre', doisValores: true },
  { valor: 'vazio', rotulo: 'está vazio', semValor: true },
  { valor: 'preenchido', rotulo: 'está preenchido', semValor: true },
];

export interface Condicao {
  operador: OperadorCondicao;
  valor: string;
  valor2?: string;
}

/** Filtro de uma coluna, aberto pelo cabeçalho. */
export interface FiltroDeColuna {
  /** Valores exibidos marcados. Ausente = todos. '' representa "(Vazias)". */
  valores?: string[];
  condicao?: Condicao;
}

/** Regra do painel "Filtros". */
export interface RegraFiltro extends Condicao {
  campo: string;
}

export interface NivelOrdenacao {
  campo: string;
  ascendente: boolean;
}

export const ROTULO_VAZIAS = '(Vazias)';

function semAcento(t: string): string {
  return normalizarNome(t);
}

/** Número ou data digitados no filtro ("10", "1.500,00", "31/12/2026"). */
function interpretar(texto: string, coluna: DefinicaoColuna): number | null {
  const t = texto.trim();
  if (!t) return null;
  const ehData = coluna.tipo === 'data' || coluna.formato === 'data';
  if (ehData) {
    const d = lerData(t);
    if (d) return d.getTime();
  }
  const n = Number(/,\d+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  if (Number.isFinite(n)) return n;
  const d = lerData(t);
  return d ? d.getTime() : null;
}

export function atendeCondicao(
  linha: LinhaPlanilha,
  coluna: DefinicaoColuna,
  condicao: Condicao,
  formulas?: Record<string, ResultadoFormula>,
): boolean {
  const texto = textoDaCelula(linha, coluna, formulas);
  const vazio = texto.trim() === '';

  switch (condicao.operador) {
    case 'vazio':
      return vazio;
    case 'preenchido':
      return !vazio;
  }

  const alvo = semAcento(condicao.valor ?? '');
  if (!alvo && condicao.operador !== 'igual' && condicao.operador !== 'diferente') return true;
  const atual = semAcento(texto);
  // CNPJ com ou sem pontuação.
  const atualDigitos = coluna.tipo === 'cnpj' ? texto.replace(/\D/g, '') : '';
  const alvoDigitos = coluna.tipo === 'cnpj' ? condicao.valor.replace(/\D/g, '') : '';

  switch (condicao.operador) {
    case 'contem':
      return atual.includes(alvo) || (Boolean(alvoDigitos) && atualDigitos.includes(alvoDigitos));
    case 'nao_contem':
      return !atual.includes(alvo);
    case 'igual':
      return atual === alvo || (Boolean(alvoDigitos) && atualDigitos === alvoDigitos);
    case 'diferente':
      return atual !== alvo;
    case 'comeca':
      return atual.startsWith(alvo) || (Boolean(alvoDigitos) && atualDigitos.startsWith(alvoDigitos));
    case 'termina':
      return atual.endsWith(alvo);
  }

  // Comparações numéricas / de data
  if (vazio) return false;
  const v = valorDeOrdenacao(linha, coluna, formulas);
  const num = typeof v === 'number' ? v : interpretar(String(v ?? ''), coluna);
  const a = interpretar(condicao.valor, coluna);
  if (num === null || a === null) {
    // Sem como comparar como número: compara como texto, em ordem alfabética.
    const cmp = atual.localeCompare(alvo, 'pt-BR', { numeric: true });
    switch (condicao.operador) {
      case 'maior': return cmp > 0;
      case 'maior_igual': return cmp >= 0;
      case 'menor': return cmp < 0;
      case 'menor_igual': return cmp <= 0;
      default: return true;
    }
  }
  switch (condicao.operador) {
    case 'maior':
      return num > a;
    case 'maior_igual':
      return num >= a;
    case 'menor':
      return num < a;
    case 'menor_igual':
      return num <= a;
    case 'entre': {
      const b = interpretar(condicao.valor2 ?? '', coluna);
      if (b === null) return num >= a;
      return num >= Math.min(a, b) && num <= Math.max(a, b);
    }
    default:
      return true;
  }
}

export function filtroAtivo(f: FiltroDeColuna | undefined): boolean {
  if (!f) return false;
  if (f.valores) return true;
  if (!f.condicao) return false;
  const op = OPERADORES_CONDICAO.find((o) => o.valor === f.condicao!.operador);
  return Boolean(op?.semValor || f.condicao.valor.trim());
}

export function regraAtiva(r: RegraFiltro): boolean {
  const op = OPERADORES_CONDICAO.find((o) => o.valor === r.operador);
  return Boolean(op?.semValor || r.valor.trim());
}

/** A pesquisa geral olha o texto de todas as colunas visíveis e alguns campos-chave. */
export function atendeBusca(
  linha: LinhaPlanilha,
  colunas: DefinicaoColuna[],
  termo: string,
  formulas?: Record<string, ResultadoFormula>,
): boolean {
  const t = semAcento(termo);
  if (!t) return true;
  const digitos = termo.replace(/\D/g, '');
  for (const coluna of colunas) {
    if (coluna.tipo === 'cnpj' && digitos.length >= 3) {
      const bruto = String(valorBruto(linha, coluna) ?? '');
      if (bruto.includes(digitos)) return true;
    }
    if (semAcento(textoDaCelula(linha, coluna, formulas)).includes(t)) return true;
  }
  return false;
}

export function aplicarFiltros({
  linhas,
  colunas,
  colunasBusca,
  busca,
  filtrosColuna,
  regras,
  formulas,
}: {
  linhas: LinhaPlanilha[];
  colunas: DefinicaoColuna[];
  /** Onde a pesquisa geral procura (normalmente as colunas visíveis). */
  colunasBusca: DefinicaoColuna[];
  busca: string;
  filtrosColuna: Record<string, FiltroDeColuna>;
  regras: RegraFiltro[];
  formulas: Map<string, Record<string, ResultadoFormula>>;
}): LinhaPlanilha[] {
  const porCampo = new Map(colunas.map((c) => [c.campo, c]));
  const ativos = Object.entries(filtrosColuna).filter(([campo, f]) => porCampo.has(campo) && filtroAtivo(f));
  const regrasAtivas = regras.filter((r) => porCampo.has(r.campo) && regraAtiva(r));

  return linhas.filter((linha) => {
    const f = formulas.get(linha.id);
    if (busca.trim() && !atendeBusca(linha, colunasBusca, busca, f)) return false;

    for (const [campo, filtro] of ativos) {
      const coluna = porCampo.get(campo)!;
      if (filtro.valores) {
        const texto = textoDaCelula(linha, coluna, f).trim();
        if (!filtro.valores.includes(texto)) return false;
      }
      if (filtro.condicao && !atendeCondicao(linha, coluna, filtro.condicao, f)) return false;
    }

    for (const regra of regrasAtivas) {
      if (!atendeCondicao(linha, porCampo.get(regra.campo)!, regra, f)) return false;
    }
    return true;
  });
}

/** Valores distintos de uma coluna, com contagem — a lista do filtro. */
export function valoresDistintos(
  linhas: LinhaPlanilha[],
  coluna: DefinicaoColuna,
  formulas: Map<string, Record<string, ResultadoFormula>>,
): { valor: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const texto = textoDaCelula(linha, coluna, formulas.get(linha.id)).trim();
    contagem.set(texto, (contagem.get(texto) ?? 0) + 1);
  }
  const lista = [...contagem.entries()].map(([valor, total]) => ({ valor, total }));
  const ehNumerico = ['data', 'numero', 'moeda', 'processos'].includes(coluna.tipo) ||
    (coluna.tipo === 'formula' && ['data', 'numero', 'moeda'].includes(coluna.formato ?? ''));

  return lista.sort((a, b) => {
    if (a.valor === '') return 1;
    if (b.valor === '') return -1;
    if (ehNumerico) {
      const x = interpretar(a.valor.replace(/^R\$\s*/, ''), coluna);
      const y = interpretar(b.valor.replace(/^R\$\s*/, ''), coluna);
      if (x !== null && y !== null) return x - y;
    }
    return a.valor.localeCompare(b.valor, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

export function ordenarLinhas(
  linhas: LinhaPlanilha[],
  niveis: NivelOrdenacao[],
  colunas: DefinicaoColuna[],
  formulas: Map<string, Record<string, ResultadoFormula>>,
): LinhaPlanilha[] {
  const porCampo = new Map(colunas.map((c) => [c.campo, c]));
  const validos = niveis.filter((n) => porCampo.has(n.campo));
  if (validos.length === 0) return linhas;

  // Pré-calcula as chaves: ordenar chama o comparador milhares de vezes.
  const chaves = new Map<string, (number | string | null)[]>();
  for (const linha of linhas) {
    chaves.set(
      linha.id,
      validos.map((n) => valorDeOrdenacao(linha, porCampo.get(n.campo)!, formulas.get(linha.id))),
    );
  }

  return [...linhas].sort((a, b) => {
    const ka = chaves.get(a.id)!;
    const kb = chaves.get(b.id)!;
    for (let i = 0; i < validos.length; i++) {
      const x = ka[i];
      const y = kb[i];
      // Vazios sempre no fim, em qualquer direção — como no Excel.
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      let cmp: number;
      if (typeof x === 'number' && typeof y === 'number') cmp = x - y;
      else cmp = String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return validos[i].ascendente ? cmp : -cmp;
    }
    return 0;
  });
}

/**
 * Para o filtro chegar pronto pela URL:
 *  - `?f.cidade=Jundiaí` marca exatamente esse valor (filtro por valores);
 *  - `?fc.cidade=jundiai` usa "é igual a", sem diferenciar acento e caixa —
 *    útil quando a base grafa o nome de outro jeito (JUNDIAÍ, Jundiai…).
 */
export function filtrosDaUrl(parametros: Record<string, string | string[] | undefined>): Record<string, FiltroDeColuna> {
  const filtros: Record<string, FiltroDeColuna> = {};
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor === undefined) continue;
    const lista = Array.isArray(valor) ? valor : [valor];
    if (chave.startsWith('f.')) {
      filtros[chave.slice(2)] = { valores: lista.map((v) => (v === ROTULO_VAZIAS ? '' : v)) };
    } else if (chave.startsWith('fc.') && lista[0]) {
      filtros[chave.slice(3)] = { condicao: { operador: 'igual', valor: lista[0] } };
    }
  }
  return filtros;
}

export { valorTipado };
