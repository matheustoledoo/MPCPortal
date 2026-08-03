/**
 * Normalizadores compartilhados entre o ETL de importação e a aplicação.
 *
 * Regra geral: normalizar sem destruir informação. Valores que carregam
 * significado no negócio ("NA" = não aplicável, "N/P" = não possui,
 * "N/L" = não localizado) são preservados; apenas ruído de planilha
 * ("-", "#N/A", "#REF!", string vazia) vira null.
 */

/** Marcadores que representam célula vazia/erro do Excel — viram null. */
const PLACEHOLDERS_VAZIOS = new Set([
  '',
  '-',
  '--',
  '---',
  '#N/A',
  '#N/D',
  '#REF!',
  '#VALUE!',
  '#VALOR!',
  '#DIV/0!',
  'NULL',
  'NULO',
]);

/** Colapsa espaços/quebras de linha e remove espaços nas pontas. */
export function normalizarTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;

  let texto: string;
  if (valor instanceof Date) return null;
  else if (typeof valor === 'object') texto = String((valor as { text?: string }).text ?? valor);
  else texto = String(valor);

  texto = texto.replace(/\s+/g, ' ').trim();
  if (PLACEHOLDERS_VAZIOS.has(texto.toUpperCase())) return null;
  return texto === '' ? null : texto;
}

/** Texto normalizado e em caixa alta — para campos de status/flag. */
export function normalizarStatus(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  return texto === null ? null : texto.toUpperCase();
}

/** Remove acentos e devolve caixa alta — usado para comparar/deduplicar. */
export function chaveComparacao(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  if (texto === null) return null;
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** CNPJ com 14 dígitos, sem pontuação. Preenche com zeros à esquerda. */
export function normalizarCnpj(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos === '') return null;
  if (digitos.length > 14) return digitos.slice(-14);
  return digitos.padStart(14, '0');
}

/** Valida os dígitos verificadores do CNPJ. */
export function cnpjValido(valor: unknown): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!cnpj || cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string, pesos: number[]): number => {
    const soma = base
      .split('')
      .reduce((acumulado, caractere, indice) => acumulado + Number(caractere) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, ...pesos1];

  return (
    digito(cnpj.slice(0, 12), pesos1) === Number(cnpj[12]) &&
    digito(cnpj.slice(0, 13), pesos2) === Number(cnpj[13])
  );
}

/** Formata 14 dígitos como 00.000.000/0000-00. */
export function formatarCnpj(valor: unknown): string {
  const cnpj = normalizarCnpj(valor);
  if (!cnpj) return '';
  if (cnpj.length !== 14) return cnpj;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Telefone brasileiro: apenas dígitos (10 ou 11 posições com DDD). */
export function normalizarTelefone(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  let digitos = String(valor).replace(/\D/g, '');
  if (digitos === '') return null;
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  if (digitos.length < 8 || digitos.length > 11) return digitos;
  return digitos;
}

export function formatarTelefone(valor: unknown): string {
  const digitos = normalizarTelefone(valor);
  if (!digitos) return '';
  if (digitos.length === 11) return digitos.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (digitos.length === 10) return digitos.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return digitos;
}

/** E-mail em minúsculas; devolve null se não parecer um e-mail. */
export function normalizarEmail(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  const email = texto.toLowerCase().replace(/\s/g, '');
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/**
 * Converte para data ISO (YYYY-MM-DD).
 * Aceita Date (Excel), serial numérico do Excel e strings dd/mm/aaaa ou aaaa-mm-dd.
 */
export function normalizarData(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // exceljs devolve datas em UTC; usar os getters UTC evita deslocar o dia.
    const ano = valor.getUTCFullYear();
    if (ano < 1900 || ano > 2200) return null;
    return `${ano}-${String(valor.getUTCMonth() + 1).padStart(2, '0')}-${String(
      valor.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  if (typeof valor === 'number') {
    if (valor <= 0 || valor > 80000) return null;
    // Serial do Excel: dia 1 = 1900-01-01, com o bug do ano bissexto de 1900.
    const base = Date.UTC(1899, 11, 30);
    return normalizarData(new Date(base + Math.round(valor) * 86400000));
  }

  const texto = normalizarTexto(valor);
  if (!texto) return null;

  const brasileiro = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (brasileiro) {
    const [, d, m, aRaw] = brasileiro;
    const ano = aRaw.length === 2 ? 2000 + Number(aRaw) : Number(aRaw);
    const mes = Number(m);
    const dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

export function formatarData(valor: unknown): string {
  const iso = normalizarData(valor);
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Número monetário aceitando "1.234,56", "1234.56" ou number. */
export function normalizarNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  const texto = normalizarTexto(valor);
  if (!texto) return null;

  let limpo = texto.replace(/[R$\s]/gi, '');
  if (limpo.includes(',') && limpo.includes('.')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  else if (limpo.includes(',')) limpo = limpo.replace(',', '.');

  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Dia do vencimento (1..31) a partir de valores como 30, "30", "-". */
export function normalizarDiaVencimento(valor: unknown): number | null {
  const numero = normalizarNumero(valor);
  if (numero === null) return null;
  const dia = Math.trunc(numero);
  return dia >= 1 && dia <= 31 ? dia : null;
}

const MESES_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Converte rótulos de competência como "jul/26" em 2026-07-01. */
export function normalizarCompetencia(rotulo: unknown): string | null {
  const texto = normalizarTexto(rotulo);
  if (!texto) return null;

  const combinacao = texto.toLowerCase().match(/^([a-zç]{3})[a-zç]*[/\-\s]?(\d{2,4})$/);
  if (!combinacao) return normalizarData(rotulo);

  const mes = MESES_PT[combinacao[1]];
  if (!mes) return null;
  const anoBruto = Number(combinacao[2]);
  const ano = anoBruto < 100 ? 2000 + anoBruto : anoBruto;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/** Título com iniciais maiúsculas respeitando preposições. */
export function tituloPtBr(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o']);
  return texto
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, indice) =>
      indice > 0 && minusculas.has(palavra)
        ? palavra
        : palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1),
    )
    .join(' ');
}

/**
 * Chave de deduplicação quando não há CNPJ:
 * razão social + nome fantasia + município, sem acento e em caixa alta.
 */
export function chaveAlternativa(
  razaoSocial: unknown,
  nomeFantasia: unknown,
  municipio: unknown,
): string {
  const partes = [razaoSocial, nomeFantasia, municipio].map((parte) => chaveComparacao(parte) ?? '');
  return `SEMCNPJ:${partes.join('|')}`;
}
