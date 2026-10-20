/**
 * Importação de planilhas para a base de Legalização.
 *
 * "Quero que o aplicativo entenda qualquer planilha com as colunas": o
 * arquivo pode vir de qualquer lugar (Excel, LibreOffice, Google Planilhas,
 * CSV), com cabeçalho em qualquer linha e nomes de coluna do jeito que cada
 * um escreve. O portal reconhece o cabeçalho, sugere o destino de cada
 * coluna e mostra tudo antes de gravar.
 */

import type { DefinicaoColuna } from '@/lib/colunas';
import { normalizarNome } from '@/lib/planilha/formulas';
import { normalizarCnpj, normalizarData } from '@/lib/normalizacao';

export interface AbaLida {
  nome: string;
  /** Linhas já convertidas: datas viram 'aaaa-mm-dd', o resto texto/número. */
  linhas: (string | number | null)[][];
}

/** Lê xlsx, xls, ods e csv no navegador, sem enviar o arquivo a ninguém. */
export async function lerArquivo(arquivo: File): Promise<AbaLida[]> {
  const XLSX = await import('xlsx');
  const dados = await arquivo.arrayBuffer();
  const ehTexto = /\.(csv|txt)$/i.test(arquivo.name);
  // CSV fica como texto puro: o leitor interpretaria 01/02/2020 no formato
  // americano (2 de janeiro). A conversão brasileira acontece no mapeamento.
  const livro = ehTexto
    ? XLSX.read(new TextDecoder(detectarCodificacao(new Uint8Array(dados))).decode(dados), { type: 'string', raw: true })
    : XLSX.read(dados, { type: 'array', cellDates: false });

  return livro.SheetNames.map((nome) => {
    const aba = livro.Sheets[nome];
    const ref = aba['!ref'];
    if (!ref) return { nome, linhas: [] };
    const faixa = XLSX.utils.decode_range(ref);
    const linhas: (string | number | null)[][] = [];
    // Limite de segurança: 20 mil linhas × 200 colunas.
    for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + 20_000); r++) {
      const linha: (string | number | null)[] = [];
      for (let c = faixa.s.c; c <= Math.min(faixa.e.c, faixa.s.c + 200); c++) {
        const celula = aba[XLSX.utils.encode_cell({ r, c })] as
          | { t?: string; v?: unknown; w?: string; z?: string }
          | undefined;
        linha.push(converterCelula(celula, XLSX.SSF.is_date));
      }
      linhas.push(linha);
    }
    // Tira as linhas vazias do fim.
    while (linhas.length && linhas[linhas.length - 1].every((v) => v === null || v === '')) linhas.pop();
    return { nome, linhas };
  });
}

function detectarCodificacao(bytes: Uint8Array): string {
  // UTF-8 válido? Senão é quase certo que veio do Excel brasileiro (Windows-1252).
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

function converterCelula(
  celula: { t?: string; v?: unknown; w?: string; z?: string } | undefined,
  ehFormatoData: (fmt: string) => boolean,
): string | number | null {
  if (!celula || celula.v === undefined || celula.v === null || celula.v === '') return null;
  if (celula.t === 'n' && typeof celula.v === 'number') {
    if (celula.z && typeof celula.z === 'string' && ehFormatoData(celula.z)) return normalizarData(celula.v);
    return celula.v;
  }
  if (celula.t === 'd' && celula.v instanceof Date) return normalizarData(celula.v);
  if (celula.t === 'b') return celula.v ? 'SIM' : 'NÃO';
  const texto = String(celula.w ?? celula.v).trim();
  return texto === '' ? null : texto;
}

/* -------------------------------------------------------------------------- */
/* Reconhecimento das colunas                                                  */
/* -------------------------------------------------------------------------- */

/** Como o time costuma escrever o nome de cada coluna. */
const SINONIMOS: Record<string, string[]> = {
  razao_social: ['RAZAO SOCIAL', 'RAZAO', 'EMPRESA', 'EMPRESAS', 'NOME DA EMPRESA', 'CLIENTE', 'NOME EMPRESARIAL', 'NOME'],
  cnpj: ['CNPJ', 'CPF/CNPJ', 'CNPJ/CPF', 'CNPJ DA EMPRESA', 'DOCUMENTO', 'INSCRICAO CNPJ'],
  codigo: ['COD', 'COD.', 'CODIGO', 'COD CLIENTE', 'COD. CLIENTE', 'CODIGO DO CLIENTE', 'Nº', 'NUMERO'],
  cidade: ['CIDADE', 'MUNICIPIO', 'MUNICIPIO/UF', 'CIDADE/UF', 'LOCALIDADE'],
  data_inicio: ['INICIO', 'DATA INICIO', 'DATA DE INICIO', 'INICIO DO CONTRATO', 'ABERTURA', 'DATA DE ABERTURA'],
  socio: ['SOCIO', 'SOCIOS', 'SOCIO ADMINISTRADOR', 'SOCIOS/RESPONSAVEL', 'PROPRIETARIO'],
  estabelecido: ['ESTABELECIDO', 'ESTABELICIDO', 'ESTABELECIMENTO'],
  seguimento: ['SEGUIMENTO', 'SEGMENTO', 'RAMO', 'ATIVIDADE'],
  inscricao_municipal: ['INS. MUNICIPAL', 'INSCRICAO MUNICIPAL', 'INSC. MUNICIPAL', 'INSC MUNICIPAL', 'CCM', 'IM'],
  alvara: ['ALVARA', 'ALVARA DE FUNCIONAMENTO'],
  avcb_clcb: ['AVCB / CLCB', 'AVCB/CLCB', 'AVCB', 'CLCB', 'BOMBEIROS'],
  avcb_clcb_validade: ['VALIDADE AVCB', 'VENCIMENTO AVCB', 'VALIDADE CLCB', 'VALIDADE AVCB/CLCB'],
  lta: ['LTA', 'LICENCA TECNICA'],
  cnes: ['CNES'],
  cetesb: ['CETESB', 'LICENCA AMBIENTAL'],
  amlurb_tx_lixo: ['AMLURB (TX LIXO)', 'AMLURB', 'TX LIXO', 'TAXA DE LIXO'],
  vigilancia_sanitaria: ['VIGILANCIA SANITARIA', 'VISA', 'VIGILANCIA', 'LICENCA SANITARIA'],
  vigilancia_sanitaria_validade: ['VALIDADE VISA', 'VALIDADE VIGILANCIA', 'VENCIMENTO VISA', 'VALIDADE VIGILANCIA SANITARIA'],
  extramuros: ['EXTRAMUROS', 'EXTRA MUROS'],
  responsavel_tecnico: ['RESPONSAVEL TECNICO', 'RT', 'RESP. TECNICO', 'RESP TECNICO'],
  profissional: ['PROFISSIONAL', 'PROFISSAO'],
  orgao: ['ORGAO', 'CONSELHO', 'ORGAO DE CLASSE'],
  validade: ['VALIDADE', 'VALIDADE RT'],
  validade_data: ['VALIDADE RT (DATA)', 'DATA VALIDADE RT', 'VENCIMENTO RT'],
  tributacao: ['TRIBUTACAO', 'REGIME', 'REGIME TRIBUTARIO', 'ENQUADRAMENTO'],
  tipo: ['TIPO', 'TIPO DE EMPRESA', 'NATUREZA'],
  status: ['STATUS', 'SITUACAO', 'SITUACAO CADASTRAL'],
  observacoes: ['OBSERVACOES', 'OBSERVACAO', 'OBS', 'OBS.'],
  // ADM (só aparecem na Planilha ADM)
  valor_honorario: ['HONORARIO', 'HONORARIOS', 'VALOR', 'VALOR HONORARIO', 'MENSALIDADE', 'HONORARIO MENSAL'],
  dia_vencimento: ['DATA DE VENCIM.', 'DATA DE VENCIMENTO', 'VENCIMENTO', 'DIA VENCIMENTO', 'DIA DE VENCIMENTO', 'DIA VENC'],
  observacoes_honorarios: ['CONDICOES', 'CONDICOES DE HONORARIOS', 'OBS HONORARIOS', 'OBS. HONORARIOS'],
  data_saida: ['SAIDA', 'DATA DE SAIDA', 'DATA SAIDA'],
  observacoes_internas: ['OBSERVACOES INTERNAS', 'OBS INTERNAS'],
};

function chave(texto: string): string {
  return normalizarNome(texto).replace(/[^A-Z0-9/() .%º]/g, '').replace(/\s+/g, ' ').trim();
}

/** Nota de 0 a 100 de quanto um cabeçalho combina com uma coluna. */
function nota(cabecalho: string, coluna: DefinicaoColuna): number {
  const c = chave(cabecalho);
  if (!c) return 0;
  const candidatos = [coluna.rotulo, coluna.campo.replace(/_/g, ' '), ...(SINONIMOS[coluna.campo] ?? [])].map(chave);
  if (candidatos.includes(c)) return 100;
  // "VALIDADE AVCB/CLCB 2026" ainda é a validade do AVCB.
  const semNumeros = c.replace(/\b\d{2,4}\b/g, '').trim();
  if (candidatos.includes(semNumeros)) return 90;
  let melhor = 0;
  for (const alvo of candidatos) {
    if (alvo.length >= 4 && (c.startsWith(alvo) || alvo.startsWith(c))) melhor = Math.max(melhor, 70);
    else if (alvo.length >= 5 && c.includes(alvo)) melhor = Math.max(melhor, 55);
  }
  return melhor;
}

/** Acha a linha do cabeçalho: a que mais se parece com nomes de coluna. */
export function detectarCabecalho(linhas: (string | number | null)[][], colunas: DefinicaoColuna[]): number {
  let melhorLinha = 0;
  let melhorPontos = -1;
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const textos = linhas[i].filter((v): v is string => typeof v === 'string');
    if (textos.length < 2) continue;
    const pontos = textos.reduce((soma, t) => soma + Math.max(0, ...colunas.map((c) => nota(t, c))), 0);
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhorLinha = i;
    }
  }
  return melhorLinha;
}

/** Destino sugerido para cada coluna do arquivo ('' = ignorar). */
export function sugerirMapeamento(cabecalhos: string[], colunas: DefinicaoColuna[]): string[] {
  const usados = new Set<string>();
  const notas = cabecalhos.map((cabecalho) =>
    colunas
      .filter((c) => c.editavel && c.tipo !== 'formula')
      .map((c) => ({ campo: c.campo, pontos: nota(cabecalho, c) }))
      .filter((n) => n.pontos >= 55)
      .sort((a, b) => b.pontos - a.pontos),
  );
  // Primeiro os encaixes perfeitos, depois os aproximados — assim "VALIDADE AVCB"
  // não rouba o lugar de "VALIDADE".
  const resultado: string[] = cabecalhos.map(() => '');
  for (const limiar of [100, 90, 70, 55]) {
    notas.forEach((lista, i) => {
      if (resultado[i]) return;
      const escolha = lista.find((n) => n.pontos >= limiar && !usados.has(n.campo));
      if (escolha) {
        resultado[i] = escolha.campo;
        usados.add(escolha.campo);
      }
    });
  }
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Cruzamento com a base                                                       */
/* -------------------------------------------------------------------------- */

export type AcaoRepetida = 'substituir' | 'completar' | 'pular' | 'adicionar';

export const ACOES_REPETIDA: { valor: AcaoRepetida; rotulo: string; descricao: string }[] = [
  {
    valor: 'substituir',
    rotulo: 'Substituir os valores',
    descricao: 'O que vier preenchido na planilha passa por cima do que está no portal.',
  },
  {
    valor: 'completar',
    rotulo: 'Só completar o que está vazio',
    descricao: 'Não mexe em nada que já está preenchido no portal.',
  },
  {
    valor: 'pular',
    rotulo: 'Ignorar as repetidas',
    descricao: 'Empresas que já existem ficam exatamente como estão.',
  },
  {
    valor: 'adicionar',
    rotulo: 'Adicionar mesmo assim',
    descricao: 'Cria outra linha, marcada para revisão como CNPJ repetido.',
  },
];

/** Chave de comparação de empresas: CNPJ; sem CNPJ, a razão social sem acento. */
export function chaveEmpresa(cnpj: unknown, razao: unknown): string | null {
  const digitos = normalizarCnpj(cnpj);
  if (digitos && digitos.length >= 11) return `C:${digitos}`;
  const nome = typeof razao === 'string' ? normalizarNome(razao).replace(/[^A-Z0-9]/g, '') : '';
  return nome ? `N:${nome}` : null;
}
