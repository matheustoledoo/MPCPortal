/**
 * Fórmulas no estilo do Excel para as colunas criadas pela equipe.
 *
 * O time escreve como escreveria no Excel em português:
 *
 *   =SE(DIAS([Validade AVCB]; HOJE()) < 30; "Renovar"; "OK")
 *   =[Cidade] & " / " & [Status]
 *   =ARRED([Honorário] * 1,1; 2)
 *
 * Referências são o nome da coluna entre colchetes (ou o nome técnico, sem
 * colchetes). Os nomes das funções aceitam português e inglês, com ou sem
 * acento. Quando a fórmula usa `;` para separar argumentos, a vírgula vira
 * separador decimal — exatamente como no Excel brasileiro.
 *
 * Roda no navegador (planilha) e no servidor (exportação), sem `eval`: é um
 * analisador próprio, então uma fórmula nunca executa código arbitrário.
 */

export type ValorFormula = number | string | boolean | Date | null;

export type CodigoErro = '#NOME?' | '#VALOR!' | '#DIV/0!' | '#REF!' | '#CICLO!' | '#N/D' | '#ERRO!';

export class ErroFormula extends Error {
  constructor(
    public codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroFormula';
  }
}

type No =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; nome: string }
  | { t: 'fn'; nome: string; args: No[] }
  | { t: 'un'; op: '-' | '+'; a: No }
  | { t: 'pct'; a: No }
  | { t: 'bin'; op: string; a: No; b: No };

export interface FormulaCompilada {
  arvore: No;
  /** Nomes referenciados, como foram escritos. */
  referencias: string[];
}

/* -------------------------------------------------------------------------- */
/* Texto auxiliar                                                              */
/* -------------------------------------------------------------------------- */

/** "Validade AVCB" e "validade avcb" apontam para a mesma coluna. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Análise léxica                                                              */
/* -------------------------------------------------------------------------- */

type Token =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; v: string }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'sep' }
  | { k: 'abre' }
  | { k: 'fecha' };

function tokenizar(fonte: string): Token[] {
  const tokens: Token[] = [];
  // ';' fora de aspas => vírgula decimal (padrão brasileiro do Excel).
  const semAspas = fonte.replace(/"(?:[^"]|"")*"/g, '');
  const modoPontoEVirgula = semAspas.includes(';');

  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === '"') {
      let texto = '';
      i++;
      while (i < fonte.length) {
        if (fonte[i] === '"') {
          if (fonte[i + 1] === '"') {
            texto += '"';
            i += 2;
            continue;
          }
          break;
        }
        texto += fonte[i++];
      }
      if (fonte[i] !== '"') throw new ErroFormula('#ERRO!', 'Faltou fechar as aspas de um texto.');
      i++;
      tokens.push({ k: 'str', v: texto });
      continue;
    }

    if (c === '[') {
      const fim = fonte.indexOf(']', i);
      if (fim < 0) throw new ErroFormula('#ERRO!', 'Faltou fechar o colchete de uma coluna.');
      const nome = fonte.slice(i + 1, fim).trim();
      if (!nome) throw new ErroFormula('#REF!', 'Há um [ ] vazio na fórmula.');
      tokens.push({ k: 'ref', v: nome });
      i = fim + 1;
      continue;
    }

    if (/\d/.test(c) || (c === '.' && /\d/.test(fonte[i + 1] ?? '')) || (c === ',' && modoPontoEVirgula && /\d/.test(fonte[i + 1] ?? ''))) {
      let bruto = '';
      while (i < fonte.length) {
        const d = fonte[i];
        if (/\d/.test(d)) bruto += d;
        else if (d === '.' || (d === ',' && modoPontoEVirgula)) bruto += '.';
        else break;
        i++;
      }
      const n = Number(bruto);
      if (!Number.isFinite(n)) throw new ErroFormula('#VALOR!', `Número inválido: ${bruto}`);
      tokens.push({ k: 'num', v: n });
      continue;
    }

    if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      let nome = '';
      while (i < fonte.length && /[A-Za-zÀ-ÿ0-9_.]/.test(fonte[i])) nome += fonte[i++];
      tokens.push({ k: 'id', v: nome });
      continue;
    }

    const dois = fonte.slice(i, i + 2);
    if (dois === '<=' || dois === '>=' || dois === '<>') {
      tokens.push({ k: 'op', v: dois });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(c)) {
      tokens.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ k: 'abre' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ k: 'fecha' });
      i++;
      continue;
    }
    if (c === ';' || (c === ',' && !modoPontoEVirgula)) {
      tokens.push({ k: 'sep' });
      i++;
      continue;
    }

    throw new ErroFormula('#ERRO!', `Caractere inesperado: "${c}".`);
  }
  return tokens;
}

/* -------------------------------------------------------------------------- */
/* Análise sintática (precedência do Excel)                                    */
/* -------------------------------------------------------------------------- */

const BOOLEANOS: Record<string, boolean> = { VERDADEIRO: true, TRUE: true, FALSO: false, FALSE: false };

class Analisador {
  private p = 0;
  readonly referencias: string[] = [];

  constructor(private tokens: Token[]) {}

  private olhar(): Token | undefined {
    return this.tokens[this.p];
  }

  private consumir(): Token {
    const t = this.tokens[this.p++];
    if (!t) throw new ErroFormula('#ERRO!', 'A fórmula terminou antes do esperado.');
    return t;
  }

  private ehOp(...ops: string[]): string | null {
    const t = this.olhar();
    return t?.k === 'op' && ops.includes(t.v) ? t.v : null;
  }

  analisar(): No {
    const no = this.comparacao();
    if (this.p < this.tokens.length) {
      throw new ErroFormula('#ERRO!', 'Sobrou algo no fim da fórmula — confira parênteses e separadores.');
    }
    return no;
  }

  private comparacao(): No {
    let a = this.concatenacao();
    let op: string | null;
    while ((op = this.ehOp('=', '<>', '<', '>', '<=', '>='))) {
      this.p++;
      a = { t: 'bin', op, a, b: this.concatenacao() };
    }
    return a;
  }

  private concatenacao(): No {
    let a = this.soma();
    while (this.ehOp('&')) {
      this.p++;
      a = { t: 'bin', op: '&', a, b: this.soma() };
    }
    return a;
  }

  private soma(): No {
    let a = this.produto();
    let op: string | null;
    while ((op = this.ehOp('+', '-'))) {
      this.p++;
      a = { t: 'bin', op, a, b: this.produto() };
    }
    return a;
  }

  private produto(): No {
    let a = this.potencia();
    let op: string | null;
    while ((op = this.ehOp('*', '/'))) {
      this.p++;
      a = { t: 'bin', op, a, b: this.potencia() };
    }
    return a;
  }

  private potencia(): No {
    let a = this.percentual();
    while (this.ehOp('^')) {
      this.p++;
      a = { t: 'bin', op: '^', a, b: this.percentual() };
    }
    return a;
  }

  private percentual(): No {
    let a = this.unario();
    while (this.ehOp('%')) {
      this.p++;
      a = { t: 'pct', a };
    }
    return a;
  }

  private unario(): No {
    const op = this.ehOp('-', '+');
    if (op) {
      this.p++;
      return { t: 'un', op: op as '-' | '+', a: this.unario() };
    }
    return this.primario();
  }

  private primario(): No {
    const t = this.consumir();
    switch (t.k) {
      case 'num':
        return { t: 'num', v: t.v };
      case 'str':
        return { t: 'str', v: t.v };
      case 'ref':
        this.referencias.push(t.v);
        return { t: 'ref', nome: t.v };
      case 'abre': {
        const dentro = this.comparacao();
        if (this.consumir().k !== 'fecha') throw new ErroFormula('#ERRO!', 'Faltou fechar um parêntese.');
        return dentro;
      }
      case 'id': {
        if (this.olhar()?.k === 'abre') {
          this.p++;
          const args: No[] = [];
          if (this.olhar()?.k !== 'fecha') {
            for (;;) {
              // Argumento vazio (ex.: SE(x;;"n")) vale como texto vazio.
              if (this.olhar()?.k === 'sep' || this.olhar()?.k === 'fecha') args.push({ t: 'str', v: '' });
              else args.push(this.comparacao());
              const prox = this.consumir();
              if (prox.k === 'fecha') break;
              if (prox.k !== 'sep') throw new ErroFormula('#ERRO!', `Separe os argumentos de ${t.v} com ";".`);
            }
          } else {
            this.p++;
          }
          return { t: 'fn', nome: normalizarNome(t.v), args };
        }
        const chave = normalizarNome(t.v);
        if (chave in BOOLEANOS) return { t: 'bool', v: BOOLEANOS[chave] };
        // Nome técnico da coluna sem colchetes (ex.: razao_social).
        this.referencias.push(t.v);
        return { t: 'ref', nome: t.v };
      }
      default:
        throw new ErroFormula('#ERRO!', 'Fórmula incompleta — confira operadores e parênteses.');
    }
  }
}

export function compilarFormula(formula: string): FormulaCompilada {
  const fonte = formula.trim().replace(/^=/, '');
  if (!fonte) throw new ErroFormula('#ERRO!', 'A fórmula está vazia.');
  const analisador = new Analisador(tokenizar(fonte));
  const arvore = analisador.analisar();
  return { arvore, referencias: analisador.referencias };
}

/* -------------------------------------------------------------------------- */
/* Conversões                                                                  */
/* -------------------------------------------------------------------------- */

const DIA_MS = 86_400_000;

function semHora(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diasEntre(fim: Date, inicio: Date): number {
  return Math.round((semHora(fim).getTime() - semHora(inicio).getTime()) / DIA_MS);
}

/** Lê "dd/mm/aaaa" ou "aaaa-mm-dd" como data local. */
export function lerData(texto: string): Date | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    const ano = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(ano, Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/i, '').replace(/%$/, '');
  if (!t) return null;
  // 1.234,56 (brasileiro) ou 1234.56
  const normalizado = /,\d{1,}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function paraNumero(v: ValorFormula): number {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime() / DIA_MS;
  const n = lerNumero(v);
  if (n === null) throw new ErroFormula('#VALOR!', `"${v}" não é um número.`);
  return n;
}

function paraData(v: ValorFormula): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = lerData(v);
    if (d) return d;
  }
  if (typeof v === 'number') return new Date(v * DIA_MS);
  throw new ErroFormula('#VALOR!', 'Esperava uma data.');
}

function paraBooleano(v: ValorFormula): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null || v === '') return false;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof Date) return true;
  const chave = normalizarNome(v);
  if (chave in BOOLEANOS) return BOOLEANOS[chave];
  if (chave === 'SIM') return true;
  if (chave === 'NAO') return false;
  throw new ErroFormula('#VALOR!', `"${v}" não é VERDADEIRO nem FALSO.`);
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatarDataBr(d: Date): string {
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function paraTexto(v: ValorFormula): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (v instanceof Date) return formatarDataBr(v);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10).replace('.', ',');
}

function vazio(v: ValorFormula): boolean {
  return v === null || v === '';
}

function comparar(a: ValorFormula, b: ValorFormula): number {
  if (vazio(a) && vazio(b)) return 0;
  const numericoA = typeof a === 'number' || a instanceof Date || typeof a === 'boolean';
  const numericoB = typeof b === 'number' || b instanceof Date || typeof b === 'boolean';
  if ((numericoA || vazio(a)) && (numericoB || vazio(b))) {
    const x = a instanceof Date ? semHora(a).getTime() : vazio(a) ? 0 : paraNumero(a);
    const y = b instanceof Date ? semHora(b).getTime() : vazio(b) ? 0 : paraNumero(b);
    if (a instanceof Date && !(b instanceof Date) && !vazio(b)) return x - y * DIA_MS;
    return x - y;
  }
  // Texto com data/número: tenta interpretar o texto antes de comparar como texto.
  if (a instanceof Date && typeof b === 'string' && lerData(b)) return semHora(a).getTime() - lerData(b)!.getTime();
  if (b instanceof Date && typeof a === 'string' && lerData(a)) return lerData(a)!.getTime() - semHora(b).getTime();
  return paraTexto(a).localeCompare(paraTexto(b), 'pt-BR', { sensitivity: 'base', numeric: true });
}

/* -------------------------------------------------------------------------- */
/* Funções                                                                     */
/* -------------------------------------------------------------------------- */

type Contexto = {
  ref: (nome: string) => ValorFormula;
  hoje: Date;
};

type Avaliador = (no: No) => ValorFormula;

type Funcao = (args: No[], aval: Avaliador, ctx: Contexto) => ValorFormula;

function exigir(args: No[], min: number, max: number, nome: string) {
  if (args.length < min || args.length > max) {
    const faixa = min === max ? `${min}` : max === Infinity ? `pelo menos ${min}` : `de ${min} a ${max}`;
    throw new ErroFormula('#VALOR!', `${nome} espera ${faixa} argumento(s).`);
  }
}

function numeros(args: No[], aval: Avaliador): number[] {
  return args
    .map(aval)
    .filter((v) => !vazio(v))
    .map(paraNumero);
}

function arredondar(n: number, casas: number, modo: 'normal' | 'cima' | 'baixo' = 'normal'): number {
  const f = 10 ** casas;
  const x = n * f;
  const r = modo === 'cima' ? Math.sign(x) * Math.ceil(Math.abs(x)) : modo === 'baixo' ? Math.trunc(x) : Math.sign(x) * Math.round(Math.abs(x));
  return r / f;
}

function adicionarMeses(d: Date, meses: number): Date {
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ultimo));
}

/** TEXTO(valor; formato) — os formatos que a equipe usa no dia a dia. */
function aplicarFormato(v: ValorFormula, formato: string): string {
  const f = formato.toLowerCase();
  if (/[dmay]/.test(f) && (v instanceof Date || (typeof v === 'string' && lerData(v)))) {
    const d = paraData(v);
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return f
      .replace(/aaaa|yyyy/g, String(d.getFullYear()))
      .replace(/aa|yy/g, String(d.getFullYear()).slice(-2))
      .replace(/mmm/g, meses[d.getMonth()])
      .replace(/mm/g, dois(d.getMonth() + 1))
      .replace(/dd/g, dois(d.getDate()));
  }
  const n = paraNumero(v);
  const casas = (/[.,](0+)/.exec(formato)?.[1] ?? '').length;
  const comMilhar = /#[.,]##/.test(formato);
  const texto = n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
    useGrouping: comMilhar,
  });
  return formato.includes('R$') ? `R$ ${texto}` : formato.includes('%') ? `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%` : texto;
}

const FUNCOES: Record<string, Funcao> = {
  SE: (args, aval) => {
    exigir(args, 2, 3, 'SE');
    return paraBooleano(aval(args[0])) ? aval(args[1]) : args[2] ? aval(args[2]) : false;
  },
  SES: (args, aval) => {
    if (args.length < 2 || args.length % 2 !== 0) throw new ErroFormula('#VALOR!', 'SES espera pares condição; valor.');
    for (let i = 0; i < args.length; i += 2) {
      if (paraBooleano(aval(args[i]))) return aval(args[i + 1]);
    }
    throw new ErroFormula('#N/D', 'Nenhuma condição do SES foi verdadeira.');
  },
  E: (args, aval) => {
    exigir(args, 1, Infinity, 'E');
    return args.every((a) => paraBooleano(aval(a)));
  },
  OU: (args, aval) => {
    exigir(args, 1, Infinity, 'OU');
    return args.some((a) => paraBooleano(aval(a)));
  },
  NAO: (args, aval) => {
    exigir(args, 1, 1, 'NÃO');
    return !paraBooleano(aval(args[0]));
  },
  SEERRO: (args, aval) => {
    exigir(args, 2, 2, 'SEERRO');
    try {
      return aval(args[0]);
    } catch (e) {
      if (e instanceof ErroFormula && e.codigo !== '#CICLO!') return aval(args[1]);
      throw e;
    }
  },
  HOJE: (args, _aval, ctx) => {
    exigir(args, 0, 0, 'HOJE');
    return semHora(ctx.hoje);
  },
  AGORA: (args, _aval, ctx) => {
    exigir(args, 0, 0, 'AGORA');
    return ctx.hoje;
  },
  DIA: (args, aval) => {
    exigir(args, 1, 1, 'DIA');
    return paraData(aval(args[0])).getDate();
  },
  MES: (args, aval) => {
    exigir(args, 1, 1, 'MÊS');
    return paraData(aval(args[0])).getMonth() + 1;
  },
  ANO: (args, aval) => {
    exigir(args, 1, 1, 'ANO');
    return paraData(aval(args[0])).getFullYear();
  },
  DATA: (args, aval) => {
    exigir(args, 3, 3, 'DATA');
    const [a, m, d] = args.map((x) => paraNumero(aval(x)));
    return new Date(a, m - 1, d);
  },
  DIAS: (args, aval) => {
    exigir(args, 1, 2, 'DIAS');
    const fim = aval(args[0]);
    if (vazio(fim)) return null;
    const inicio = args[1] ? aval(args[1]) : null;
    return diasEntre(paraData(fim), inicio === null || vazio(inicio) ? new Date() : paraData(inicio));
  },
  DATAM: (args, aval) => {
    exigir(args, 2, 2, 'DATAM');
    const base = aval(args[0]);
    if (vazio(base)) return null;
    return adicionarMeses(paraData(base), Math.trunc(paraNumero(aval(args[1]))));
  },
  FIMMES: (args, aval) => {
    exigir(args, 2, 2, 'FIMMÊS');
    const base = aval(args[0]);
    if (vazio(base)) return null;
    const d = paraData(base);
    return new Date(d.getFullYear(), d.getMonth() + Math.trunc(paraNumero(aval(args[1]))) + 1, 0);
  },
  'DIA.DA.SEMANA': (args, aval) => {
    exigir(args, 1, 2, 'DIA.DA.SEMANA');
    return paraData(aval(args[0])).getDay() + 1;
  },
  SOMA: (args, aval) => numeros(args, aval).reduce((s, n) => s + n, 0),
  MEDIA: (args, aval) => {
    const ns = numeros(args, aval);
    if (ns.length === 0) throw new ErroFormula('#DIV/0!', 'MÉDIA sem nenhum número.');
    return ns.reduce((s, n) => s + n, 0) / ns.length;
  },
  MIN: (args, aval) => {
    const ns = numeros(args, aval);
    return ns.length ? Math.min(...ns) : 0;
  },
  MAX: (args, aval) => {
    const ns = numeros(args, aval);
    return ns.length ? Math.max(...ns) : 0;
  },
  ARRED: (args, aval) => {
    exigir(args, 1, 2, 'ARRED');
    return arredondar(paraNumero(aval(args[0])), args[1] ? paraNumero(aval(args[1])) : 0);
  },
  'ARREDONDAR.PARA.CIMA': (args, aval) => {
    exigir(args, 1, 2, 'ARREDONDAR.PARA.CIMA');
    return arredondar(paraNumero(aval(args[0])), args[1] ? paraNumero(aval(args[1])) : 0, 'cima');
  },
  'ARREDONDAR.PARA.BAIXO': (args, aval) => {
    exigir(args, 1, 2, 'ARREDONDAR.PARA.BAIXO');
    return arredondar(paraNumero(aval(args[0])), args[1] ? paraNumero(aval(args[1])) : 0, 'baixo');
  },
  ABS: (args, aval) => {
    exigir(args, 1, 1, 'ABS');
    return Math.abs(paraNumero(aval(args[0])));
  },
  INT: (args, aval) => {
    exigir(args, 1, 1, 'INT');
    return Math.floor(paraNumero(aval(args[0])));
  },
  MOD: (args, aval) => {
    exigir(args, 2, 2, 'MOD');
    const d = paraNumero(aval(args[1]));
    if (d === 0) throw new ErroFormula('#DIV/0!', 'Divisão por zero em MOD.');
    const n = paraNumero(aval(args[0]));
    return n - d * Math.floor(n / d);
  },
  CONCATENAR: (args, aval) => args.map((a) => paraTexto(aval(a))).join(''),
  MAIUSCULA: (args, aval) => {
    exigir(args, 1, 1, 'MAIÚSCULA');
    return paraTexto(aval(args[0])).toLocaleUpperCase('pt-BR');
  },
  MINUSCULA: (args, aval) => {
    exigir(args, 1, 1, 'MINÚSCULA');
    return paraTexto(aval(args[0])).toLocaleLowerCase('pt-BR');
  },
  'PRI.MAIUSCULA': (args, aval) => {
    exigir(args, 1, 1, 'PRI.MAIÚSCULA');
    return paraTexto(aval(args[0]))
      .toLocaleLowerCase('pt-BR')
      .replace(/(^|\s)(\p{L})/gu, (_m, esp: string, l: string) => esp + l.toLocaleUpperCase('pt-BR'));
  },
  ESQUERDA: (args, aval) => {
    exigir(args, 1, 2, 'ESQUERDA');
    return paraTexto(aval(args[0])).slice(0, args[1] ? paraNumero(aval(args[1])) : 1);
  },
  DIREITA: (args, aval) => {
    exigir(args, 1, 2, 'DIREITA');
    const n = args[1] ? paraNumero(aval(args[1])) : 1;
    const t = paraTexto(aval(args[0]));
    return n <= 0 ? '' : t.slice(-n);
  },
  'EXT.TEXTO': (args, aval) => {
    exigir(args, 3, 3, 'EXT.TEXTO');
    const t = paraTexto(aval(args[0]));
    const inicio = paraNumero(aval(args[1]));
    return t.substr(Math.max(0, inicio - 1), paraNumero(aval(args[2])));
  },
  'NUM.CARACT': (args, aval) => {
    exigir(args, 1, 1, 'NÚM.CARACT');
    return paraTexto(aval(args[0])).length;
  },
  ARRUMAR: (args, aval) => {
    exigir(args, 1, 1, 'ARRUMAR');
    return paraTexto(aval(args[0])).replace(/\s+/g, ' ').trim();
  },
  SUBSTITUIR: (args, aval) => {
    exigir(args, 3, 3, 'SUBSTITUIR');
    const de = paraTexto(aval(args[1]));
    return de ? paraTexto(aval(args[0])).split(de).join(paraTexto(aval(args[2]))) : paraTexto(aval(args[0]));
  },
  LOCALIZAR: (args, aval) => {
    exigir(args, 2, 2, 'LOCALIZAR');
    const pos = normalizarNome(paraTexto(aval(args[1]))).indexOf(normalizarNome(paraTexto(aval(args[0]))));
    if (pos < 0) throw new ErroFormula('#VALOR!', 'Texto não encontrado em LOCALIZAR.');
    return pos + 1;
  },
  CONTEM: (args, aval) => {
    exigir(args, 2, 2, 'CONTÉM');
    return normalizarNome(paraTexto(aval(args[0]))).includes(normalizarNome(paraTexto(aval(args[1]))));
  },
  TEXTO: (args, aval) => {
    exigir(args, 2, 2, 'TEXTO');
    const v = aval(args[0]);
    return vazio(v) ? '' : aplicarFormato(v, paraTexto(aval(args[1])));
  },
  VALOR: (args, aval) => {
    exigir(args, 1, 1, 'VALOR');
    return paraNumero(aval(args[0]));
  },
  'ECEL.VAZIA': (args, aval) => {
    exigir(args, 1, 1, 'ÉCÉL.VAZIA');
    return vazio(aval(args[0]));
  },
  ENUM: (args, aval) => {
    exigir(args, 1, 1, 'ÉNÚM');
    return typeof aval(args[0]) === 'number';
  },
  ETEXTO: (args, aval) => {
    exigir(args, 1, 1, 'ÉTEXTO');
    return typeof aval(args[0]) === 'string';
  },
};

/** Nomes em inglês e grafias alternativas apontam para a mesma função. */
const APELIDOS: Record<string, string> = {
  IF: 'SE', IFS: 'SES', AND: 'E', OR: 'OU', NOT: 'NAO', IFERROR: 'SEERRO',
  TODAY: 'HOJE', NOW: 'AGORA', DAY: 'DIA', MONTH: 'MES', YEAR: 'ANO', DATE: 'DATA',
  DAYS: 'DIAS', EDATE: 'DATAM', EOMONTH: 'FIMMES', WEEKDAY: 'DIA.DA.SEMANA',
  SUM: 'SOMA', AVERAGE: 'MEDIA', ROUND: 'ARRED', ROUNDUP: 'ARREDONDAR.PARA.CIMA',
  ROUNDDOWN: 'ARREDONDAR.PARA.BAIXO', CONCAT: 'CONCATENAR', CONCATENATE: 'CONCATENAR',
  UPPER: 'MAIUSCULA', LOWER: 'MINUSCULA', PROPER: 'PRI.MAIUSCULA', LEFT: 'ESQUERDA',
  RIGHT: 'DIREITA', MID: 'EXT.TEXTO', LEN: 'NUM.CARACT', TRIM: 'ARRUMAR',
  SUBSTITUTE: 'SUBSTITUIR', SEARCH: 'LOCALIZAR', CONTAINS: 'CONTEM', TEXT: 'TEXTO',
  VALUE: 'VALOR', ISBLANK: 'ECEL.VAZIA', EVAZIO: 'ECEL.VAZIA', VAZIO: 'ECEL.VAZIA',
  ISNUMBER: 'ENUM', ISTEXT: 'ETEXTO', MAXIMO: 'MAX', MINIMO: 'MIN', MEDIAA: 'MEDIA',
  ARREDONDAR: 'ARRED', 'NUM.CARACTERES': 'NUM.CARACT',
};

/** Lista para a ajuda do editor de fórmulas. */
export const FUNCOES_DISPONIVEIS: { nome: string; exemplo: string; descricao: string }[] = [
  { nome: 'SE', exemplo: 'SE([Status]="ATIVO"; "Sim"; "Não")', descricao: 'Escolhe um valor conforme a condição.' },
  { nome: 'SES', exemplo: 'SES(DIAS([Validade AVCB])<0; "Vencido"; DIAS([Validade AVCB])<30; "Renovar"; VERDADEIRO; "OK")', descricao: 'Várias condições em sequência.' },
  { nome: 'E / OU / NÃO', exemplo: 'E([Alvará]="SIM"; [AVCB / CLCB]="SIM")', descricao: 'Combina condições.' },
  { nome: 'DIAS', exemplo: 'DIAS([Validade VISA]; HOJE())', descricao: 'Dias entre duas datas (sem a segunda, conta a partir de hoje).' },
  { nome: 'HOJE', exemplo: 'HOJE()', descricao: 'A data de hoje.' },
  { nome: 'DATAM', exemplo: 'DATAM([Início]; 12)', descricao: 'Soma meses a uma data.' },
  { nome: 'DIA / MÊS / ANO', exemplo: 'ANO([Início])', descricao: 'Partes de uma data.' },
  { nome: 'SOMA / MÉDIA / MÍN / MÁX', exemplo: 'SOMA([Honorário]; 50)', descricao: 'Contas com números.' },
  { nome: 'ARRED', exemplo: 'ARRED([Honorário]*1,1; 2)', descricao: 'Arredonda.' },
  { nome: '&', exemplo: '[Cidade] & " - " & [Status]', descricao: 'Junta textos.' },
  { nome: 'MAIÚSCULA / MINÚSCULA', exemplo: 'MAIÚSCULA([Cidade])', descricao: 'Muda a caixa do texto.' },
  { nome: 'ESQUERDA / DIREITA / EXT.TEXTO', exemplo: 'ESQUERDA([CNPJ]; 8)', descricao: 'Recorta um texto.' },
  { nome: 'CONTÉM', exemplo: 'CONTÉM([Sócio]; "Silva")', descricao: 'Verdadeiro se o texto aparece (ignora acento e caixa).' },
  { nome: 'TEXTO', exemplo: 'TEXTO([Início]; "mm/aaaa")', descricao: 'Formata data ou número.' },
  { nome: 'ÉCÉL.VAZIA', exemplo: 'ÉCÉL.VAZIA([Alvará])', descricao: 'Verdadeiro se a célula estiver vazia.' },
  { nome: 'SEERRO', exemplo: 'SEERRO(VALOR([Código]); 0)', descricao: 'Valor alternativo quando dá erro.' },
];

/* -------------------------------------------------------------------------- */
/* Avaliação                                                                   */
/* -------------------------------------------------------------------------- */

export function avaliarFormula(compilada: FormulaCompilada, ctx: Contexto): ValorFormula {
  const aval: Avaliador = (no) => {
    switch (no.t) {
      case 'num':
        return no.v;
      case 'str':
        return no.v;
      case 'bool':
        return no.v;
      case 'ref':
        return ctx.ref(no.nome);
      case 'un': {
        const v = paraNumero(aval(no.a));
        return no.op === '-' ? -v : v;
      }
      case 'pct':
        return paraNumero(aval(no.a)) / 100;
      case 'fn': {
        const nome = APELIDOS[no.nome] ?? no.nome;
        const fn = FUNCOES[nome];
        if (!fn) throw new ErroFormula('#NOME?', `Função desconhecida: ${no.nome}.`);
        return fn(no.args, aval, ctx);
      }
      case 'bin': {
        const a = aval(no.a);
        const b = aval(no.b);
        switch (no.op) {
          case '&':
            return paraTexto(a) + paraTexto(b);
          case '=':
            return comparar(a, b) === 0;
          case '<>':
            return comparar(a, b) !== 0;
          case '<':
            return comparar(a, b) < 0;
          case '>':
            return comparar(a, b) > 0;
          case '<=':
            return comparar(a, b) <= 0;
          case '>=':
            return comparar(a, b) >= 0;
          case '+':
            if (a instanceof Date && !(b instanceof Date)) return new Date(semHora(a).getTime() + paraNumero(b) * DIA_MS);
            if (b instanceof Date && !(a instanceof Date)) return new Date(semHora(b).getTime() + paraNumero(a) * DIA_MS);
            return paraNumero(a) + paraNumero(b);
          case '-':
            if (a instanceof Date && b instanceof Date) return diasEntre(a, b);
            if (a instanceof Date) return new Date(semHora(a).getTime() - paraNumero(b) * DIA_MS);
            return paraNumero(a) - paraNumero(b);
          case '*':
            return paraNumero(a) * paraNumero(b);
          case '/': {
            const d = paraNumero(b);
            if (d === 0) throw new ErroFormula('#DIV/0!', 'Divisão por zero.');
            return paraNumero(a) / d;
          }
          case '^':
            return paraNumero(a) ** paraNumero(b);
        }
        throw new ErroFormula('#ERRO!', `Operador desconhecido: ${no.op}`);
      }
    }
  };
  return aval(compilada.arvore);
}

/** Cache de compilação: a mesma fórmula roda em centenas de linhas. */
const cacheCompilacao = new Map<string, FormulaCompilada | ErroFormula>();

export function compilarComCache(formula: string): FormulaCompilada {
  let item = cacheCompilacao.get(formula);
  if (!item) {
    try {
      item = compilarFormula(formula);
    } catch (e) {
      item = e instanceof ErroFormula ? e : new ErroFormula('#ERRO!', String(e));
    }
    cacheCompilacao.set(formula, item);
  }
  if (item instanceof ErroFormula) throw item;
  return item;
}
