/**
 * PortalMPC — ETL de mesclagem das planilhas de Legalização
 * =========================================================
 *
 * Consolida `data/planilhas/Planilha_Saude.xlsx` (aba "Bese") e
 * `data/planilhas/Adm.xlsx` (aba "Pagadores (4)") em uma única base.
 *
 * Regras implementadas (conforme especificação do módulo):
 *  1. CNPJ normalizado (só dígitos, 14 posições) é o identificador principal.
 *  2. Sem CNPJ → chave composta razão social + nome fantasia + município.
 *  3. Empresa presente nas duas planilhas entra UMA única vez.
 *  4. Empresa presente em apenas uma planilha também entra.
 *  5. Campo vazio em uma fonte e preenchido na outra → usa o preenchido.
 *  6. Valores diferentes → Adm.xlsx prevalece e a divergência é REGISTRADA.
 *  7. Datas, CNPJ, telefone, e-mail, texto, números e status normalizados.
 *  8. Linhas totalmente vazias (e a linha de TOTAL do Adm.xlsx) descartadas.
 *  9. Nenhuma soma de registros: "unir" = consolidar, não somar.
 * 10. Origem preservada: planilha_saude | planilha_adm | ambas.
 *
 * Modos de execução:
 *   npm run import:planilhas        → grava direto no Supabase (service role)
 *   npm run import:planilhas:sql    → gera supabase/seed/legalizacao_import.sql
 *
 * O modo SQL existe para ambientes onde a service_role não está disponível
 * (ex.: execução via MCP/console) sem jamais expor a chave no navegador.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import ExcelJS from 'exceljs';

import {
  chaveAlternativa,
  chaveComparacao,
  cnpjValido,
  normalizarCnpj,
  normalizarCompetencia,
  normalizarData,
  normalizarDiaVencimento,
  normalizarNumero,
  normalizarStatus,
  normalizarTexto,
} from '../src/lib/normalizacao';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, '..');
const ARQUIVO_SAUDE = path.join(RAIZ, 'data/planilhas/Planilha_Saude.xlsx');
const ARQUIVO_ADM = path.join(RAIZ, 'data/planilhas/Adm.xlsx');

const ABA_SAUDE = 'Bese';
const LINHA_CABECALHO_SAUDE = 3;
const PRIMEIRA_LINHA_SAUDE = 5; // linha 4 traz a sub-legenda MPC/TERCEIROS

const ABA_ADM = 'Pagadores (4)';
const LINHA_CABECALHO_ADM = 1;
const PRIMEIRA_LINHA_ADM = 2;

/**
 * Bloco confidencial do Adm.xlsx.
 *
 * NOTA DE ANÁLISE: a especificação fala em "coluna N em diante" do Adm.xlsx,
 * mas o arquivo entregue possui dados apenas até a coluna M (13 colunas).
 * O bloco confidencial adotado é o financeiro/contratual — SAÍDA (G),
 * DATA DE VENCIM. (K), OBS. de honorários (L) e o valor mensal (M) — que é
 * exatamente o conteúdo que não pode chegar a um usuário de Legalização.
 * Para mover um campo entre "geral" e "confidencial" basta editar esta lista
 * e a montagem em `montarRegistro()`.
 */
const COLUNAS_CONFIDENCIAIS_ADM = ['SAÍDA', 'DATA DE VENCIM.', 'OBS.', 'jul/26'] as const;

type Origem = 'planilha_saude' | 'planilha_adm' | 'ambas';

interface LinhaBruta {
  linha: number;
  valores: Record<string, unknown>;
}

interface Divergencia {
  chave: string;
  razaoSocial: string;
  campo: string;
  valorSaude: string;
  valorAdm: string;
  valorAplicado: string;
  fonteVencedora: 'adm' | 'saude';
  confidencial: boolean;
}

interface EmpresaConsolidada {
  chave_identificacao: string;
  cnpj: string | null;
  cnpj_valido: boolean;
  razao_social: string;
  nome_fantasia: string | null;
  codigo: string | null;
  cidade: string | null;
  data_inicio: string | null;
  socio: string | null;
  estabelecido: string | null;
  seguimento: string | null;
  inscricao_municipal: string | null;
  alvara: string | null;
  avcb_clcb: string | null;
  avcb_clcb_validade: string | null;
  lta: string | null;
  cnes: string | null;
  cetesb: string | null;
  amlurb_tx_lixo: string | null;
  vigilancia_sanitaria: string | null;
  vigilancia_sanitaria_validade: string | null;
  extramuros: string | null;
  responsavel_tecnico: string | null;
  profissional: string | null;
  orgao: string | null;
  validade: string | null;
  validade_data: string | null;
  tributacao: string | null;
  tipo: string | null;
  status: string;
  origem: Origem;
  numero_origem_saude: number | null;
  numero_origem_adm: number | null;
  linha_origem_saude: number | null;
  linha_origem_adm: number | null;
  necessita_revisao: boolean;
  revisao_motivo: string | null;
  administrativo: DadosAdministrativos | null;
}

interface DadosAdministrativos {
  data_saida: string | null;
  saida_raw: string | null;
  dia_vencimento: number | null;
  dia_vencimento_raw: string | null;
  observacoes_honorarios: string | null;
  valor_honorario: number | null;
  competencia_honorario: string | null;
  competencia_label: string | null;
  honorarios_historico: Array<{ competencia: string | null; label: string; valor: number | null }>;
}

// ---------------------------------------------------------------------------
// Leitura das planilhas
// ---------------------------------------------------------------------------

/** exceljs entrega fórmulas/rich text como objeto; reduz para o valor final. */
function valorBruto(celula: ExcelJS.Cell): unknown {
  const valor = celula.value;
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    const objeto = valor as ExcelJS.CellValue & { result?: unknown; richText?: { text: string }[]; text?: string };
    if ('result' in objeto && objeto.result !== undefined) return objeto.result;
    if (objeto.richText) return objeto.richText.map((parte) => parte.text).join('');
    if (objeto.text !== undefined) return objeto.text;
    if ('error' in objeto) return null;
  }
  return valor;
}

async function lerAba(
  arquivo: string,
  nomeAba: string,
  linhaCabecalho: number,
  primeiraLinha: number,
): Promise<{ cabecalhos: string[]; linhas: LinhaBruta[]; totalLinhasArquivo: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(arquivo);

  const aba = workbook.getWorksheet(nomeAba);
  if (!aba) throw new Error(`Aba "${nomeAba}" não encontrada em ${arquivo}`);

  // Só interessam colunas que realmente têm cabeçalho — o Adm.xlsx declara
  // 16.305 colunas por resíduo de formatação.
  const linhaCab = aba.getRow(linhaCabecalho);
  const cabecalhos: string[] = [];
  linhaCab.eachCell({ includeEmpty: false }, (celula, coluna) => {
    const texto = normalizarTexto(valorBruto(celula));
    if (texto) cabecalhos[coluna - 1] = texto;
  });

  const linhas: LinhaBruta[] = [];
  let totalLinhasArquivo = 0;

  for (let numero = primeiraLinha; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);
    const valores: Record<string, unknown> = {};
    let algumPreenchido = false;

    cabecalhos.forEach((cabecalho, indice) => {
      if (!cabecalho) return;
      const bruto = valorBruto(linha.getCell(indice + 1));
      valores[cabecalho] = bruto;
      if (bruto !== null && bruto !== undefined && String(bruto).trim() !== '') algumPreenchido = true;
    });

    if (!algumPreenchido) continue; // regra 8: linha completamente vazia
    totalLinhasArquivo += 1;
    linhas.push({ linha: numero, valores });
  }

  return { cabecalhos: cabecalhos.filter(Boolean), linhas, totalLinhasArquivo };
}

// ---------------------------------------------------------------------------
// Normalização de campos com tipo misto (texto OU data na mesma coluna)
// ---------------------------------------------------------------------------

/**
 * Colunas como AVCB/CLCB e VIGILÂNCIA SANITÁRIA misturam "NA"/"SIM" com datas
 * de validade. Preserva-se o texto original E extrai-se a data quando houver.
 */
function textoComData(valor: unknown): { texto: string | null; data: string | null } {
  if (valor instanceof Date) {
    const data = normalizarData(valor);
    return { texto: data, data };
  }
  const texto = normalizarTexto(valor);
  const data = normalizarData(texto);
  return { texto: texto ? texto.toUpperCase() : null, data };
}

/** Canonicaliza cidades: "JundiaÍ" e "Jundiaí" viram a grafia mais frequente. */
function construirMapaCidades(...listas: Array<Array<unknown>>): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>();

  for (const lista of listas) {
    for (const bruto of lista) {
      const texto = normalizarTexto(bruto);
      if (!texto) continue;
      const chave = chaveComparacao(texto)!;
      if (!contagem.has(chave)) contagem.set(chave, new Map());
      const variantes = contagem.get(chave)!;
      variantes.set(texto, (variantes.get(texto) ?? 0) + 1);
    }
  }

  const mapa = new Map<string, string>();
  for (const [chave, variantes] of contagem) {
    // Desempate estável: mais frequente; depois a que tem acentuação correta
    // (mais caracteres não-ASCII costuma ser a grafia oficial); depois alfabética.
    const melhor = [...variantes.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const acentosA = (a[0].match(/[^\x20-\x7E]/g) ?? []).length;
      const acentosB = (b[0].match(/[^\x20-\x7E]/g) ?? []).length;
      if (acentosB !== acentosA) return acentosB - acentosA;
      return a[0].localeCompare(b[0], 'pt-BR');
    })[0][0];
    mapa.set(chave, melhor);
  }

  return mapa;
}

// ---------------------------------------------------------------------------
// Mesclagem
// ---------------------------------------------------------------------------

interface Registro {
  chave: string;
  cnpj: string | null;
  saude?: LinhaBruta;
  adm?: LinhaBruta;
}

function chaveDe(valores: Record<string, unknown>, colunaRazao: string): { chave: string; cnpj: string | null } {
  const cnpj = normalizarCnpj(valores['CNPJ']);
  if (cnpj) return { chave: cnpj, cnpj };
  return {
    chave: chaveAlternativa(valores[colunaRazao], null, valores['CIDADE']),
    cnpj: null,
  };
}

/** Linha de TOTAL do Adm.xlsx: sem CNPJ, sem razão social, só um somatório. */
function ehLinhaTotalizadora(valores: Record<string, unknown>, colunaRazao: string): boolean {
  const temCnpj = normalizarCnpj(valores['CNPJ']) !== null;
  const temRazao = normalizarTexto(valores[colunaRazao]) !== null;
  return !temCnpj && !temRazao;
}

function main(): Promise<void> {
  return executar();
}

async function executar(): Promise<void> {
  const emitirSql = process.argv.includes('--emit-sql');
  const emitirLotes = process.argv.includes('--emit-lotes');
  const tamanhoLote = Number(
    process.argv.find((a) => a.startsWith('--lote='))?.split('=')[1] ?? 40,
  );

  console.log('PortalMPC — importação das planilhas de Legalização');
  console.log('='.repeat(70));

  const saude = await lerAba(ARQUIVO_SAUDE, ABA_SAUDE, LINHA_CABECALHO_SAUDE, PRIMEIRA_LINHA_SAUDE);
  const adm = await lerAba(ARQUIVO_ADM, ABA_ADM, LINHA_CABECALHO_ADM, PRIMEIRA_LINHA_ADM);

  console.log(`Planilha Saúde  → aba "${ABA_SAUDE}": ${saude.linhas.length} linhas, ${saude.cabecalhos.length} colunas`);
  console.log(`Adm.xlsx        → aba "${ABA_ADM}": ${adm.linhas.length} linhas, ${adm.cabecalhos.length} colunas`);

  // --- descarte de linhas não-empresa -------------------------------------
  const linhasSaude = saude.linhas.filter((l) => !ehLinhaTotalizadora(l.valores, 'RAZÃO SOCIAL'));
  const linhasAdm = adm.linhas.filter((l) => !ehLinhaTotalizadora(l.valores, 'EMPRESAS'));

  const descartadasSaude = saude.linhas.length - linhasSaude.length;
  const descartadasAdm = adm.linhas.length - linhasAdm.length;

  // --- indexação por chave -------------------------------------------------
  const registros = new Map<string, Registro>();
  const duplicadasSaude: string[] = [];
  const duplicadasAdm: string[] = [];

  for (const linha of linhasSaude) {
    const { chave, cnpj } = chaveDe(linha.valores, 'RAZÃO SOCIAL');
    const existente = registros.get(chave);
    if (existente?.saude) {
      duplicadasSaude.push(`${chave} (linhas ${existente.saude.linha} e ${linha.linha})`);
      continue; // regra 3: não duplicar
    }
    registros.set(chave, { ...(existente ?? { chave, cnpj }), chave, cnpj, saude: linha });
  }

  for (const linha of linhasAdm) {
    const { chave, cnpj } = chaveDe(linha.valores, 'EMPRESAS');
    const existente = registros.get(chave);
    if (existente?.adm) {
      duplicadasAdm.push(`${chave} (linhas ${existente.adm.linha} e ${linha.linha})`);
      continue;
    }
    registros.set(chave, { ...(existente ?? { chave, cnpj }), chave, cnpj, adm: linha });
  }

  // --- canonicalização de cidades -----------------------------------------
  const mapaCidades = construirMapaCidades(
    linhasSaude.map((l) => l.valores['CIDADE']),
    linhasAdm.map((l) => l.valores['CIDADE']),
  );

  // --- consolidação --------------------------------------------------------
  const divergencias: Divergencia[] = [];
  const empresas: EmpresaConsolidada[] = [];

  for (const registro of registros.values()) {
    empresas.push(montarRegistro(registro, mapaCidades, divergencias));
  }

  empresas.sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR'));

  // --- relatório -----------------------------------------------------------
  const somenteSaude = empresas.filter((e) => e.origem === 'planilha_saude');
  const somenteAdm = empresas.filter((e) => e.origem === 'planilha_adm');
  const ambas = empresas.filter((e) => e.origem === 'ambas');
  const revisao = empresas.filter((e) => e.necessita_revisao);

  const relatorio = {
    executado_em: new Date().toISOString(),
    arquivos: [
      {
        nome: 'Planilha_Saude.xlsx',
        aba: ABA_SAUDE,
        linhas_lidas: saude.linhas.length,
        linhas_descartadas: descartadasSaude,
        linhas_validas: linhasSaude.length,
        colunas: saude.cabecalhos,
      },
      {
        nome: 'Adm.xlsx',
        aba: ABA_ADM,
        linhas_lidas: adm.linhas.length,
        linhas_descartadas: descartadasAdm,
        linhas_validas: linhasAdm.length,
        colunas: adm.cabecalhos,
        colunas_confidenciais: COLUNAS_CONFIDENCIAIS_ADM,
      },
    ],
    empresas_unicas: empresas.length,
    duplicadas_no_arquivo_saude: duplicadasSaude.length,
    duplicadas_no_arquivo_adm: duplicadasAdm.length,
    duplicadas_entre_arquivos: ambas.length,
    somente_planilha_saude: somenteSaude.length,
    somente_planilha_adm: somenteAdm.length,
    presentes_em_ambas: ambas.length,
    divergencias: divergencias.length,
    divergencias_confidenciais: divergencias.filter((d) => d.confidencial).length,
    registros_importados: empresas.length,
    registros_administrativos: empresas.filter((e) => e.administrativo).length,
    necessitam_revisao_manual: revisao.length,
    cnpj_invalidos: empresas.filter((e) => !e.cnpj_valido).length,
    motivos_revisao: contarPor(revisao.map((e) => e.revisao_motivo ?? 'não informado')),
  };

  console.log('\nRELATÓRIO DE MESCLAGEM');
  console.log('-'.repeat(70));
  console.log(`Linhas Planilha Saúde .......... ${saude.linhas.length} (descartadas: ${descartadasSaude})`);
  console.log(`Linhas Adm.xlsx ................ ${adm.linhas.length} (descartadas: ${descartadasAdm})`);
  console.log(`Empresas únicas consolidadas ... ${relatorio.empresas_unicas}`);
  console.log(`Presentes nas duas planilhas ... ${relatorio.presentes_em_ambas}`);
  console.log(`Somente na Planilha Saúde ...... ${relatorio.somente_planilha_saude}`);
  console.log(`Somente no Adm.xlsx ............ ${relatorio.somente_planilha_adm}`);
  console.log(`Duplicadas dentro dos arquivos . saúde=${duplicadasSaude.length} adm=${duplicadasAdm.length}`);
  console.log(`Divergências registradas ....... ${relatorio.divergencias}`);
  console.log(`Registros administrativos ...... ${relatorio.registros_administrativos}`);
  console.log(`Necessitam revisão manual ...... ${relatorio.necessitam_revisao_manual}`);

  mkdirSync(path.join(RAIZ, 'data/relatorios'), { recursive: true });
  writeFileSync(
    path.join(RAIZ, 'data/relatorios/relatorio-importacao.json'),
    JSON.stringify({ relatorio, divergencias, duplicadasSaude, duplicadasAdm }, null, 2),
    'utf-8',
  );
  console.log('\nRelatório detalhado: data/relatorios/relatorio-importacao.json');

  if (emitirSql) {
    const destino = path.join(RAIZ, 'supabase/seed/legalizacao_import.sql');
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, gerarSql(empresas, divergencias, relatorio), 'utf-8');
    console.log(`SQL de importação gerado em: ${path.relative(RAIZ, destino)}`);
  }

  if (emitirLotes) {
    const pasta = path.join(RAIZ, 'supabase/seed/lotes');
    const arquivos = gerarLotes(empresas, pasta, tamanhoLote);
    console.log(`${arquivos} lotes SQL gerados em: ${path.relative(RAIZ, pasta)}`);
  }

  if (emitirSql || emitirLotes) return;

  await gravarNoSupabase(empresas, divergencias, relatorio);
}

function contarPor(valores: string[]): Record<string, number> {
  return valores.reduce<Record<string, number>>((acumulado, valor) => {
    acumulado[valor] = (acumulado[valor] ?? 0) + 1;
    return acumulado;
  }, {});
}

// ---------------------------------------------------------------------------
// Montagem de um registro consolidado
// ---------------------------------------------------------------------------

function montarRegistro(
  registro: Registro,
  mapaCidades: Map<string, string>,
  divergencias: Divergencia[],
): EmpresaConsolidada {
  const s = registro.saude?.valores ?? {};
  const a = registro.adm?.valores ?? {};

  const origem: Origem = registro.saude && registro.adm ? 'ambas' : registro.saude ? 'planilha_saude' : 'planilha_adm';

  const razaoSocial =
    normalizarTexto(a['EMPRESAS']) ?? normalizarTexto(s['RAZÃO SOCIAL']) ?? 'EMPRESA SEM RAZÃO SOCIAL';

  /**
   * Regra 5 + 6: preenchido vence vazio; havendo os dois, o Adm.xlsx é o
   * valor principal e a diferença é registrada — nada é descartado em silêncio.
   */
  const resolver = <T>(
    campo: string,
    valorSaude: T | null,
    valorAdm: T | null,
    confidencial = false,
  ): T | null => {
    if (valorAdm !== null && valorSaude !== null && String(valorAdm) !== String(valorSaude)) {
      divergencias.push({
        chave: registro.chave,
        razaoSocial,
        campo,
        valorSaude: String(valorSaude),
        valorAdm: String(valorAdm),
        valorAplicado: String(valorAdm),
        fonteVencedora: 'adm',
        confidencial,
      });
      return valorAdm;
    }
    return valorAdm ?? valorSaude;
  };

  const cidadeBruta = resolver('cidade', normalizarTexto(s['CIDADE']), normalizarTexto(a['CIDADE']));
  const cidade = cidadeBruta ? mapaCidades.get(chaveComparacao(cidadeBruta)!) ?? cidadeBruta : null;

  const avcb = textoComData(s['AVCB / CLCB']);
  const visa = textoComData(s['VIGILÂNCIA SANITÁRIA']);
  const validade = textoComData(s['VALIDADE']);

  const cnpj = registro.cnpj;
  const valido = cnpj ? cnpjValido(cnpj) : false;

  const motivos: string[] = [];
  if (!cnpj) motivos.push('sem CNPJ (chave alternativa por razão social + município)');
  else if (!valido) motivos.push('CNPJ com dígito verificador inválido');
  if (razaoSocial === 'EMPRESA SEM RAZÃO SOCIAL') motivos.push('razão social ausente');

  const numeroSaude = normalizarNumero(s['N']);
  const numeroAdm = normalizarNumero(a['N']);

  return {
    chave_identificacao: registro.chave,
    cnpj,
    cnpj_valido: valido,
    razao_social: razaoSocial,
    nome_fantasia: null, // nenhuma das planilhas traz nome fantasia
    codigo: resolver('codigo', normalizarTexto(s['COD']), normalizarTexto(a['COD'])),
    cidade,
    data_inicio: resolver('data_inicio', normalizarData(s['INICIO']), normalizarData(a['INÍCIO'])),

    socio: normalizarTexto(s['SOCIO']),
    estabelecido: normalizarStatus(s['ESTABELICIDO']),
    seguimento: normalizarStatus(s['SEGUIMENTO']),
    inscricao_municipal: normalizarTexto(s['INS. MUNICIPAL']),
    alvara: normalizarStatus(s['ALVARÁ']),
    avcb_clcb: avcb.texto,
    avcb_clcb_validade: avcb.data,
    lta: normalizarStatus(s['LTA']),
    cnes: normalizarStatus(s['CNES']),
    cetesb: normalizarStatus(s['CETESB']),
    amlurb_tx_lixo: normalizarStatus(s['AMLURB (TX LIXO)']),
    vigilancia_sanitaria: visa.texto,
    vigilancia_sanitaria_validade: visa.data,
    extramuros: normalizarStatus(s['EXTRAMUROS']),
    responsavel_tecnico: normalizarTexto(s['RESPONSÁVEL TÉCNICO']),
    profissional: normalizarStatus(s['PROFISSIONAL']),
    orgao: normalizarStatus(s['ÓRGÃO']),
    validade: validade.texto,
    validade_data: validade.data,

    tributacao: normalizarStatus(a['TRIBUTAÇÃO']),
    tipo: normalizarTexto(a['TIPO']),
    status: normalizarStatus(a['STATUS']) ?? 'ATIVO',

    origem,
    numero_origem_saude: numeroSaude !== null ? Math.trunc(numeroSaude) : null,
    numero_origem_adm: numeroAdm !== null ? Math.trunc(numeroAdm) : null,
    linha_origem_saude: registro.saude?.linha ?? null,
    linha_origem_adm: registro.adm?.linha ?? null,
    necessita_revisao: motivos.length > 0,
    revisao_motivo: motivos.length > 0 ? motivos.join('; ') : null,

    administrativo: registro.adm ? montarAdministrativo(a) : null,
  };
}

function montarAdministrativo(a: Record<string, unknown>): DadosAdministrativos {
  const saidaRaw = a['SAÍDA'];
  const vencimentoRaw = a['DATA DE VENCIM.'];

  // Toda coluna cujo cabeçalho é uma competência (jul/26, ago/26…) vira
  // histórico — assim novas colunas mensais entram sem alterar o schema.
  const historico: DadosAdministrativos['honorarios_historico'] = [];
  for (const [cabecalho, valor] of Object.entries(a)) {
    const competencia = normalizarCompetencia(cabecalho);
    if (!competencia) continue;
    historico.push({ competencia, label: cabecalho, valor: normalizarNumero(valor) });
  }
  historico.sort((x, y) => (x.competencia ?? '').localeCompare(y.competencia ?? ''));

  const maisRecente = historico[historico.length - 1] ?? null;

  return {
    data_saida: normalizarData(saidaRaw),
    saida_raw: saidaRaw instanceof Date ? normalizarData(saidaRaw) : normalizarTexto(saidaRaw),
    dia_vencimento: normalizarDiaVencimento(vencimentoRaw),
    dia_vencimento_raw: normalizarTexto(vencimentoRaw),
    observacoes_honorarios: normalizarTexto(a['OBS.']),
    valor_honorario: maisRecente?.valor ?? null,
    competencia_honorario: maisRecente?.competencia ?? null,
    competencia_label: maisRecente?.label ?? null,
    honorarios_historico: historico,
  };
}

// ---------------------------------------------------------------------------
// Persistência — Supabase (service role)
// ---------------------------------------------------------------------------

async function gravarNoSupabase(
  empresas: EmpresaConsolidada[],
  divergencias: Divergencia[],
  relatorio: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Caminho alternativo: delegar a escrita a uma Edge Function que já roda com
  // service_role no servidor. Usado quando a chave não está no ambiente local —
  // assim a service_role nunca precisa sair do Supabase.
  const endpoint = process.env.IMPORT_ENDPOINT;
  if (!chave && endpoint) {
    await enviarParaEndpoint(endpoint, empresas, divergencias, relatorio);
    return;
  }

  if (!url || !chave) {
    console.error('\n[ERRO] Conexão com o Supabase indisponível.');
    console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local)');
    console.error('ou execute com --emit-sql para gerar o script SQL equivalente.');
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  const { data: log, error: erroLog } = await supabase
    .from('import_logs')
    .insert({
      status: 'em_andamento',
      executado_por_desc: 'script scripts/import-planilhas.ts',
      arquivos: (relatorio as { arquivos: unknown }).arquivos,
      resumo: relatorio,
    })
    .select('id')
    .single();

  if (erroLog) throw new Error(`Falha ao registrar import_log: ${erroLog.message}`);
  const importLogId = log.id as string;

  const LOTE = 100;
  const idsPorChave = new Map<string, string>();

  for (let i = 0; i < empresas.length; i += LOTE) {
    const lote = empresas.slice(i, i + LOTE).map(({ administrativo: _adm, ...empresa }) => empresa);
    const { data, error } = await supabase
      .from('legalizacao_empresas')
      .upsert(lote, { onConflict: 'chave_identificacao' })
      .select('id, chave_identificacao');

    if (error) throw new Error(`Falha no upsert de empresas: ${error.message}`);
    data?.forEach((linha) => idsPorChave.set(linha.chave_identificacao as string, linha.id as string));
    console.log(`  empresas ${Math.min(i + LOTE, empresas.length)}/${empresas.length}`);
  }

  const administrativos = empresas
    .filter((e) => e.administrativo)
    .map((e) => ({ empresa_id: idsPorChave.get(e.chave_identificacao)!, ...e.administrativo! }));

  for (let i = 0; i < administrativos.length; i += LOTE) {
    const { error } = await supabase
      .from('legalizacao_dados_administrativos')
      .upsert(administrativos.slice(i, i + LOTE), { onConflict: 'empresa_id' });
    if (error) throw new Error(`Falha no upsert de dados administrativos: ${error.message}`);
    console.log(`  administrativos ${Math.min(i + LOTE, administrativos.length)}/${administrativos.length}`);
  }

  if (divergencias.length > 0) {
    const registros = divergencias.map((d) => ({
      import_log_id: importLogId,
      empresa_id: idsPorChave.get(d.chave) ?? null,
      chave: d.chave,
      razao_social: d.razaoSocial,
      campo: d.campo,
      valor_planilha_saude: d.valorSaude,
      valor_planilha_adm: d.valorAdm,
      valor_aplicado: d.valorAplicado,
      fonte_vencedora: d.fonteVencedora,
      confidencial: d.confidencial,
    }));
    for (let i = 0; i < registros.length; i += LOTE) {
      const { error } = await supabase.from('import_divergencias').insert(registros.slice(i, i + LOTE));
      if (error) throw new Error(`Falha ao gravar divergências: ${error.message}`);
    }
  }

  await supabase
    .from('import_logs')
    .update({ status: 'concluido', finalizado_em: new Date().toISOString(), resumo: relatorio })
    .eq('id', importLogId);

  console.log(`\nImportação concluída. import_log_id = ${importLogId}`);
}

/** Envia o conjunto consolidado para a Edge Function `importar-legalizacao`. */
async function enviarParaEndpoint(
  endpoint: string,
  empresas: EmpresaConsolidada[],
  divergencias: Divergencia[],
  relatorio: Record<string, unknown>,
): Promise<void> {
  const token = process.env.IMPORT_TOKEN;
  const bearer = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token) {
    console.error('\n[ERRO] IMPORT_ENDPOINT definido, mas IMPORT_TOKEN ausente.');
    process.exitCode = 1;
    return;
  }

  const corpo = {
    relatorio,
    empresas: empresas.map(({ administrativo: _adm, ...resto }) => resto),
    administrativos: empresas
      .filter((e) => e.administrativo)
      .map((e) => ({ chave_identificacao: e.chave_identificacao, ...e.administrativo! })),
    divergencias: divergencias.map((d) => ({
      chave: d.chave,
      razao_social: d.razaoSocial,
      campo: d.campo,
      valor_planilha_saude: d.valorSaude,
      valor_planilha_adm: d.valorAdm,
      valor_aplicado: d.valorAplicado,
      fonte_vencedora: d.fonteVencedora,
      confidencial: d.confidencial,
    })),
  };

  console.log(`\nEnviando ${empresas.length} empresas para ${endpoint} …`);

  const resposta = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-import-token': token,
      ...(bearer ? { authorization: `Bearer ${bearer}`, apikey: bearer } : {}),
    },
    body: JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`Endpoint devolveu ${resposta.status}: ${texto}`);
  console.log('Resposta do endpoint:', texto);
}

// ---------------------------------------------------------------------------
// Persistência — geração de SQL idempotente
// ---------------------------------------------------------------------------

function sql(valor: unknown): string {
  if (valor === null || valor === undefined) return 'null';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : 'null';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function gerarSql(
  empresas: EmpresaConsolidada[],
  divergencias: Divergencia[],
  relatorio: Record<string, unknown>,
): string {
  const colunas = [
    'chave_identificacao', 'cnpj', 'razao_social', 'nome_fantasia', 'codigo', 'cidade', 'data_inicio',
    'socio', 'estabelecido', 'seguimento', 'inscricao_municipal', 'alvara', 'avcb_clcb', 'avcb_clcb_validade',
    'lta', 'cnes', 'cetesb', 'amlurb_tx_lixo', 'vigilancia_sanitaria', 'vigilancia_sanitaria_validade',
    'extramuros', 'responsavel_tecnico', 'profissional', 'orgao', 'validade', 'validade_data',
    'tributacao', 'tipo', 'status', 'origem', 'numero_origem_saude', 'numero_origem_adm',
    'linha_origem_saude', 'linha_origem_adm', 'necessita_revisao', 'revisao_motivo',
  ] as const;

  const partes: string[] = [];
  const hash = createHash('sha256').update(JSON.stringify(empresas)).digest('hex').slice(0, 16);

  partes.push('-- PortalMPC — importação consolidada das planilhas de Legalização');
  partes.push(`-- Gerado por scripts/import-planilhas.ts em ${new Date().toISOString()}`);
  partes.push(`-- Assinatura do conjunto: ${hash}`);
  partes.push('-- Idempotente: reexecutar não duplica registros (upsert por chave_identificacao).');
  partes.push('begin;');
  partes.push('');
  partes.push(`insert into public.import_logs (id, status, executado_por_desc, arquivos, resumo)
values (gen_random_uuid(), 'em_andamento', 'scripts/import-planilhas.ts --emit-sql',
        ${sql(JSON.stringify((relatorio as { arquivos: unknown }).arquivos))}::jsonb,
        ${sql(JSON.stringify(relatorio))}::jsonb);`);
  partes.push('');

  for (const empresa of empresas) {
    const valores = colunas.map((coluna) => sql((empresa as unknown as Record<string, unknown>)[coluna]));
    const atualizacoes = colunas
      .filter((coluna) => coluna !== 'chave_identificacao')
      .map((coluna) => `${coluna} = excluded.${coluna}`)
      .join(', ');

    partes.push(
      `insert into public.legalizacao_empresas (${colunas.join(', ')}) values (${valores.join(', ')})\n` +
        `on conflict (chave_identificacao) do update set ${atualizacoes};`,
    );

    if (empresa.administrativo) {
      const adm = empresa.administrativo;
      partes.push(
        `insert into public.legalizacao_dados_administrativos
  (empresa_id, data_saida, saida_raw, dia_vencimento, dia_vencimento_raw, observacoes_honorarios,
   valor_honorario, competencia_honorario, competencia_label, honorarios_historico)
select e.id, ${sql(adm.data_saida)}, ${sql(adm.saida_raw)}, ${sql(adm.dia_vencimento)}, ${sql(adm.dia_vencimento_raw)},
       ${sql(adm.observacoes_honorarios)}, ${sql(adm.valor_honorario)}, ${sql(adm.competencia_honorario)},
       ${sql(adm.competencia_label)}, ${sql(JSON.stringify(adm.honorarios_historico))}::jsonb
from public.legalizacao_empresas e where e.chave_identificacao = ${sql(empresa.chave_identificacao)}
on conflict (empresa_id) do update set
  data_saida = excluded.data_saida, saida_raw = excluded.saida_raw,
  dia_vencimento = excluded.dia_vencimento, dia_vencimento_raw = excluded.dia_vencimento_raw,
  observacoes_honorarios = excluded.observacoes_honorarios, valor_honorario = excluded.valor_honorario,
  competencia_honorario = excluded.competencia_honorario, competencia_label = excluded.competencia_label,
  honorarios_historico = excluded.honorarios_historico;`,
      );
    }
  }

  for (const d of divergencias) {
    partes.push(
      `insert into public.import_divergencias
  (import_log_id, empresa_id, chave, razao_social, campo, valor_planilha_saude, valor_planilha_adm,
   valor_aplicado, fonte_vencedora, confidencial)
select l.id, e.id, ${sql(d.chave)}, ${sql(d.razaoSocial)}, ${sql(d.campo)}, ${sql(d.valorSaude)},
       ${sql(d.valorAdm)}, ${sql(d.valorAplicado)}, ${sql(d.fonteVencedora)}, ${sql(d.confidencial)}
from (select id from public.import_logs order by iniciado_em desc limit 1) l
left join public.legalizacao_empresas e on e.chave_identificacao = ${sql(d.chave)};`,
    );
  }

  partes.push('');
  partes.push(`update public.import_logs
set status = 'concluido', finalizado_em = now()
where status = 'em_andamento';`);
  partes.push('commit;');

  return partes.join('\n\n');
}

/**
 * Modo "lotes": gera instruções SQL compactas via `jsonb_to_recordset`,
 * pequenas o suficiente para serem executadas por um cliente SQL remoto
 * (console do Supabase ou MCP) quando a service_role não está disponível.
 * O resultado no banco é idêntico ao do modo direto — mesmo upsert, mesmas
 * chaves de conflito.
 */
function gerarLotes(empresas: EmpresaConsolidada[], pasta: string, tamanho: number): number {
  mkdirSync(pasta, { recursive: true });

  const colunas = [
    'chave_identificacao', 'cnpj', 'razao_social', 'codigo', 'cidade', 'data_inicio',
    'socio', 'estabelecido', 'seguimento', 'inscricao_municipal', 'alvara', 'avcb_clcb',
    'avcb_clcb_validade', 'lta', 'cnes', 'cetesb', 'amlurb_tx_lixo', 'vigilancia_sanitaria',
    'vigilancia_sanitaria_validade', 'extramuros', 'responsavel_tecnico', 'profissional', 'orgao',
    'validade', 'validade_data', 'tributacao', 'tipo', 'status', 'origem', 'numero_origem_saude',
    'numero_origem_adm', 'linha_origem_saude', 'linha_origem_adm', 'necessita_revisao', 'revisao_motivo',
  ] as const;

  const tipos: Record<string, string> = {
    data_inicio: 'date', avcb_clcb_validade: 'date', vigilancia_sanitaria_validade: 'date',
    validade_data: 'date', numero_origem_saude: 'int', numero_origem_adm: 'int',
    linha_origem_saude: 'int', linha_origem_adm: 'int', necessita_revisao: 'boolean',
    origem: 'public.origem_registro',
  };

  // Formato posicional: cada empresa é um array na mesma ordem de `colunas`.
  // Repetir o nome de 35 colunas em cada objeto JSON dobraria o tamanho do lote.
  const projecao = colunas
    .map((coluna, indice) => {
      const tipo = tipos[coluna];
      const bruto = `r ->> ${indice}`;
      return tipo ? `(${bruto})::${tipo} as ${coluna}` : `${bruto} as ${coluna}`;
    })
    .join(',\n       ');

  const atualizacoes = colunas
    .filter((c) => c !== 'chave_identificacao')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  let arquivo = 0;

  for (let i = 0; i < empresas.length; i += tamanho) {
    const dados = empresas.slice(i, i + tamanho).map((empresa) =>
      colunas.map((coluna) => (empresa as unknown as Record<string, unknown>)[coluna] ?? null),
    );

    arquivo += 1;
    writeFileSync(
      path.join(pasta, `${String(arquivo).padStart(3, '0')}_empresas.sql`),
      `insert into public.legalizacao_empresas (${colunas.join(', ')})\n` +
        `select ${projecao}\n` +
        `from jsonb_array_elements(${sql(JSON.stringify(dados))}::jsonb) as t(r)\n` +
        `on conflict (chave_identificacao) do update set ${atualizacoes};\n`,
      'utf-8',
    );
  }

  // Dados administrativos: o histórico é remontado no banco a partir de
  // valor + competência, evitando repetir o mesmo JSON em cada linha.
  // Ordem posicional: chave, data_saida, saida_raw, dia_vencimento,
  //                   dia_vencimento_raw, observacoes_honorarios,
  //                   valor_honorario, competencia_honorario, competencia_label
  const administrativos = empresas
    .filter((e) => e.administrativo)
    .map((e) => {
      const adm = e.administrativo!;
      return [
        e.chave_identificacao, adm.data_saida, adm.saida_raw, adm.dia_vencimento,
        adm.dia_vencimento_raw, adm.observacoes_honorarios, adm.valor_honorario,
        adm.competencia_honorario, adm.competencia_label,
      ];
    });

  for (let i = 0; i < administrativos.length; i += tamanho) {
    const lote = administrativos.slice(i, i + tamanho);
    arquivo += 1;
    writeFileSync(
      path.join(pasta, `${String(arquivo).padStart(3, '0')}_administrativos.sql`),
      `insert into public.legalizacao_dados_administrativos
  (empresa_id, data_saida, saida_raw, dia_vencimento, dia_vencimento_raw,
   observacoes_honorarios, valor_honorario, competencia_honorario, competencia_label, honorarios_historico)
select e.id,
       (r ->> 1)::date, r ->> 2, (r ->> 3)::smallint, r ->> 4, r ->> 5,
       (r ->> 6)::numeric, (r ->> 7)::date, r ->> 8,
       case when r ->> 8 is null then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object(
                   'competencia', r ->> 7, 'label', r ->> 8,
                   'valor', (r ->> 6)::numeric)) end
from jsonb_array_elements(${sql(JSON.stringify(lote))}::jsonb) as t(r)
join public.legalizacao_empresas e on e.chave_identificacao = r ->> 0
on conflict (empresa_id) do update set
  data_saida = excluded.data_saida, saida_raw = excluded.saida_raw,
  dia_vencimento = excluded.dia_vencimento, dia_vencimento_raw = excluded.dia_vencimento_raw,
  observacoes_honorarios = excluded.observacoes_honorarios, valor_honorario = excluded.valor_honorario,
  competencia_honorario = excluded.competencia_honorario, competencia_label = excluded.competencia_label,
  honorarios_historico = excluded.honorarios_historico;
`,
      'utf-8',
    );
  }

  return arquivo;
}

main().catch((erro) => {
  console.error('\n[FALHA NA IMPORTAÇÃO]', erro);
  process.exit(1);
});
