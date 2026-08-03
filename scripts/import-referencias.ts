/**
 * PortalMPC — importação das abas auxiliares da Planilha_Saúde.xlsx
 * ==================================================================
 *
 * As abas "Caminhos", "Docs Necessários", "Base", "Status" e "Conferência"
 * eram consultadas manualmente pela equipe. Aqui viram tabelas de referência
 * do portal: links de prefeitura por cidade, checklist de documentos, listas
 * de valores dos selects e modelos de parecer por órgão.
 *
 *   npm run import:referencias            → grava no Supabase (service role)
 *   npm run import:referencias -- --sql   → imprime o SQL equivalente
 */

import path from 'node:path';

import ExcelJS from 'exceljs';

import { chaveComparacao, normalizarTexto } from '../src/lib/normalizacao';

const ARQUIVO = path.resolve(__dirname, '../data/planilhas/Planilha_Saude.xlsx');

function sql(valor: unknown): string {
  if (valor === null || valor === undefined) return 'null';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function texto(celula: ExcelJS.Cell): string | null {
  const valor = celula.value;
  if (valor && typeof valor === 'object') {
    // Célula com link: o endereço vale mais que o rótulo exibido.
    if ('hyperlink' in valor) return normalizarTexto((valor as { hyperlink: string }).hyperlink);
    // Texto com formatação mista chega fatiado em `richText`.
    if ('richText' in valor) {
      const partes = (valor as { richText: { text: string }[] }).richText;
      return normalizarTexto(partes.map((parte) => parte.text).join(''));
    }
    if ('text' in valor) return normalizarTexto((valor as { text: string }).text);
  }
  return normalizarTexto(valor);
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ARQUIVO);

  const instrucoes: string[] = [];

  // --- Caminhos → links das prefeituras -----------------------------------
  const caminhos = workbook.getWorksheet('Caminhos')!;
  const linksVistos = new Set<string>();
  for (let n = 2; n <= caminhos.rowCount; n += 1) {
    const linha = caminhos.getRow(n);
    const cidade = texto(linha.getCell(1));
    if (!cidade) continue;

    const mobiliario = texto(linha.getCell(2));
    const mobiliario2025 = texto(linha.getCell(3));
    const cfm = texto(linha.getCell(4));
    if (!mobiliario && !mobiliario2025 && !cfm) continue;

    const chave = `${chaveComparacao(cidade)}|${mobiliario ?? ''}`;
    if (linksVistos.has(chave)) continue;
    linksVistos.add(chave);

    // Alguns "links" são orientações em texto (telefone, e-mail): viram observação.
    const ehUrl = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);
    const observacoes = [mobiliario, mobiliario2025, cfm]
      .filter((v): v is string => Boolean(v) && !ehUrl(v))
      .join(' | ');

    instrucoes.push(
      `insert into public.legalizacao_cidades_links
  (cidade, cidade_normalizada, url_contribuinte_mobiliario, url_contribuinte_2025, url_consulta_cfm, observacao)
values (${sql(cidade)}, ${sql(chaveComparacao(cidade))}, ${sql(ehUrl(mobiliario))},
        ${sql(ehUrl(mobiliario2025))}, ${sql(ehUrl(cfm))}, ${sql(observacoes || null)})
on conflict (cidade_normalizada, url_contribuinte_mobiliario) do update set
  url_contribuinte_2025 = excluded.url_contribuinte_2025,
  url_consulta_cfm = excluded.url_consulta_cfm,
  observacao = excluded.observacao;`,
    );
  }

  // --- Docs Necessários ----------------------------------------------------
  const docs = workbook.getWorksheet('Docs Necessários ')!;
  let ordem = 0;
  for (let n = 2; n <= docs.rowCount; n += 1) {
    const descricao = texto(docs.getRow(n).getCell(1));
    if (!descricao || descricao.length < 5) continue;
    ordem += 1;
    instrucoes.push(
      `insert into public.legalizacao_documentos_necessarios (ordem, descricao, grupo)
values (${ordem}, ${sql(descricao)}, ${sql('legalizacao')})
on conflict (descricao) do update set ordem = excluded.ordem;`,
    );
  }

  // --- Base → listas de valores dos selects --------------------------------
  const base = workbook.getWorksheet('Base')!;
  const grupos = [
    { coluna: 1, grupo: 'status_documentacao' },
    { coluna: 2, grupo: 'acao' },
    { coluna: 3, grupo: 'profissional' },
    { coluna: 4, grupo: 'orgao' },
    { coluna: 5, grupo: 'sim_nao' },
  ];
  for (const { coluna, grupo } of grupos) {
    let posicao = 0;
    for (let n = 1; n <= base.rowCount; n += 1) {
      const valor = texto(base.getRow(n).getCell(coluna));
      if (!valor) continue;
      posicao += 1;
      instrucoes.push(
        `insert into public.legalizacao_opcoes (grupo, valor, ordem)
values (${sql(grupo)}, ${sql(valor)}, ${posicao})
on conflict (grupo, valor) do update set ordem = excluded.ordem;`,
      );
    }
  }

  // --- Status / Conferência → modelos de parecer ---------------------------
  const registrarChecklist = (aba: ExcelJS.Worksheet, rotuloBase: string, colunas: number) => {
    let bloco = 0;
    let posicao = 0;
    for (let n = 1; n <= aba.rowCount; n += 1) {
      const linha = aba.getRow(n);
      const item = texto(linha.getCell(1));

      // Linha de cabeçalho de bloco: coluna A vazia e coluna B com o rótulo.
      if (!item && texto(linha.getCell(2))) {
        bloco += 1;
        posicao = 0;
        continue;
      }
      if (!item) continue;
      if (bloco === 0) bloco = 1;
      posicao += 1;

      instrucoes.push(
        `insert into public.legalizacao_checklist_referencia
  (bloco, ordem, item, status, acao, responsavel_tecnico, observacao)
values (${sql(`${rotuloBase} ${bloco}`)}, ${posicao}, ${sql(item)},
        ${sql(texto(linha.getCell(2)))}, ${sql(texto(linha.getCell(3)))},
        ${sql(colunas >= 4 ? texto(linha.getCell(4)) : null)},
        ${sql(colunas >= 5 ? texto(linha.getCell(5)) : null)});`,
      );
    }
  };

  registrarChecklist(workbook.getWorksheet('Status')!, 'Modelo de parecer', 5);
  registrarChecklist(workbook.getWorksheet('Conferência')!, 'Conferência', 3);

  if (process.argv.includes('--sql')) {
    console.log('begin;');
    console.log('delete from public.legalizacao_checklist_referencia;');
    console.log(instrucoes.join('\n'));
    console.log('commit;');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error('[ERRO] Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, ou use --sql.');
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, chave, { auth: { persistSession: false } });
  const { error } = await supabase.rpc('exec_sql' as never, { sql: instrucoes.join('\n') } as never);
  if (error) throw new Error(error.message);
  console.log(`${instrucoes.length} instruções aplicadas.`);
}

main().catch((erro) => {
  console.error('[FALHA]', erro);
  process.exit(1);
});
