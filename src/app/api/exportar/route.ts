import { NextResponse, type NextRequest } from 'next/server';

import ExcelJS from 'exceljs';

import { colunasPara, mesclarColunas, type DefinicaoColuna } from '@/lib/colunas';
import { carregarTodasEmpresas, type LinhaEmpresa } from '@/lib/empresas';
import { formatarCnpj } from '@/lib/normalizacao';
import { lerData } from '@/lib/planilha/formulas';
import { calcularFormulas, textoDaCelula, valorBruto, type LinhaPlanilha } from '@/lib/planilha/valores';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import { PERMISSOES, ehAdmin, pode, podeLerLegalizacao } from '@/lib/permissoes';
import type { PlanilhaColuna } from '@/types/banco';

export const runtime = 'nodejs';

/**
 * Exportação para Excel com permissão aplicada NO SERVIDOR.
 *
 * O navegador manda só a lista de ids (na ordem da tela) e as colunas
 * visíveis. Os dados são buscados de novo aqui, com a RLS de quem pediu: um
 * id que a pessoa não pode ver simplesmente não vem, e colunas
 * administrativas só entram para administradores.
 */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfilAtual();

  if (!perfil || !perfil.ativo) {
    return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  }
  if (!podeLerLegalizacao(perfil)) {
    return NextResponse.json({ erro: 'Sem permissão para acessar esta base.' }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => ({}))) as {
    contexto?: 'legalizacao' | 'administrativo';
    ids?: string[];
    colunas?: string[];
    resumoFiltros?: string;
  };

  const administrador = ehAdmin(perfil);
  const contexto = corpo.contexto === 'administrativo' && administrador ? 'administrativo' : 'legalizacao';

  // Ler e baixar são coisas diferentes: exportar leva a base inteira para fora
  // do portal, então tem permissão própria.
  const permissao = contexto === 'administrativo' ? PERMISSOES.exportarAdministrativo : PERMISSOES.exportarLegalizacao;
  if (!pode(perfil, permissao)) {
    return NextResponse.json(
      { erro: 'Você não tem permissão para exportar. Peça "Exportar Legalização" ao administrador.' },
      { status: 403 },
    );
  }

  const supabase = await criarClienteServidor();
  const incluiAdm = contexto === 'administrativo';

  const [{ data: definicoes }, linhas] = await Promise.all([
    supabase
      .from('planilha_colunas')
      .select('*')
      .in('tabela', incluiAdm ? ['legalizacao_empresas', 'legalizacao_dados_administrativos'] : ['legalizacao_empresas']),
    carregarTodasEmpresas(supabase, incluiAdm).catch((e: Error) => e),
  ]);
  if (linhas instanceof Error) {
    return NextResponse.json({ erro: `Falha ao consultar: ${linhas.message}` }, { status: 500 });
  }

  // O universo de colunas permitidas vem do perfil, não do pedido.
  const todas = mesclarColunas(colunasPara(incluiAdm), (definicoes ?? []) as PlanilhaColuna[]);
  const pedidas = (corpo.colunas ?? []).map((campo) => todas.find((c) => c.campo === campo)).filter(Boolean) as DefinicaoColuna[];
  const colunas = pedidas.length ? pedidas : todas.filter((c) => c.padrao);

  // Mantém a ordem e o recorte da tela; sem lista, exporta tudo.
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const registros: LinhaEmpresa[] = corpo.ids?.length
    ? corpo.ids.map((id) => porId.get(id)).filter((l): l is LinhaEmpresa => Boolean(l))
    : linhas;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PortalMPC';
  workbook.created = new Date();

  const planilha = workbook.addWorksheet(contexto === 'administrativo' ? 'Planilha ADM' : 'Legalização', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }],
  });

  planilha.columns = colunas.map((coluna) => ({
    header: coluna.rotulo,
    key: coluna.campo,
    width: Math.max(12, Math.min(52, Math.round(coluna.largura / 7.5))),
  }));

  const cabecalho = planilha.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cabecalho.height = 22;
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.eachCell((celula, indice) => {
    const coluna = colunas[indice - 1];
    celula.fill = {
      type: 'pattern',
      pattern: 'solid',
      // Confidenciais em âmbar e fórmulas em azul, para ficar claro no arquivo.
      fgColor: { argb: coluna?.confidencial ? 'FFB45309' : coluna?.tipo === 'formula' ? 'FF0E7490' : 'FF9B1C24' },
    };
  });

  const hoje = new Date();
  for (const registro of registros) {
    const linha = registro as unknown as LinhaPlanilha;
    const formulas = colunas.some((c) => c.tipo === 'formula') ? calcularFormulas(linha, todas, hoje) : undefined;
    const valores: Record<string, unknown> = {};
    for (const coluna of colunas) {
      if (coluna.tipo === 'formula') {
        const r = formulas?.[coluna.campo];
        if (!r || r.erro) valores[coluna.campo] = r?.erro?.codigo ?? null;
        else if (r.valor instanceof Date) valores[coluna.campo] = r.valor;
        else if (typeof r.valor === 'number' && ['numero', 'moeda'].includes(coluna.formato ?? '')) valores[coluna.campo] = r.valor;
        else valores[coluna.campo] = textoDaCelula(linha, coluna, formulas) || null;
        continue;
      }
      const bruto = valorBruto(linha, coluna);
      if (bruto === null || bruto === undefined || bruto === '') valores[coluna.campo] = null;
      else if (coluna.tipo === 'cnpj') valores[coluna.campo] = formatarCnpj(bruto);
      else if (coluna.tipo === 'data') valores[coluna.campo] = lerData(String(bruto)) ?? String(bruto);
      else if (coluna.tipo === 'moeda' || coluna.tipo === 'numero' || coluna.tipo === 'processos') valores[coluna.campo] = Number(bruto);
      else if (coluna.tipo === 'booleano') valores[coluna.campo] = bruto ? 'Sim' : 'Não';
      else valores[coluna.campo] = String(bruto);
    }
    planilha.addRow(valores);
  }

  colunas.forEach((coluna, indice) => {
    const colunaExcel = planilha.getColumn(indice + 1);
    if (coluna.tipo === 'data' || (coluna.tipo === 'formula' && coluna.formato === 'data')) colunaExcel.numFmt = 'dd/mm/yyyy';
    if (coluna.tipo === 'moeda' || (coluna.tipo === 'formula' && coluna.formato === 'moeda')) colunaExcel.numFmt = 'R$ #,##0.00';
  });

  planilha.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, colunas.length) } };

  // Aba de contexto: quem exportou, quando e sob quais filtros.
  const info = workbook.addWorksheet('Informações');
  info.columns = [{ width: 28 }, { width: 90 }];
  info.addRows([
    ['PortalMPC — Exportação'],
    [],
    ['Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    ['Usuário', `${perfil.nome} (${perfil.email})`],
    ['Planilha', contexto === 'administrativo' ? 'Planilha ADM' : 'Planilha Legalização'],
    ['Registros exportados', registros.length],
    ['Colunas exportadas', colunas.length],
    ['Inclui dados administrativos', incluiAdm && colunas.some((c) => c.confidencial) ? 'Sim (perfil administrador)' : 'Não'],
    ['Filtros aplicados na tela', corpo.resumoFiltros || '—'],
    ['Colunas calculadas', colunas.filter((c) => c.tipo === 'formula').map((c) => `${c.rotulo}: ${c.formula}`).join(' | ') || '—'],
  ]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.getColumn(1).font = { bold: true };

  await supabase.rpc('registrar_evento_auditoria', {
    p_acao: 'EXPORT',
    p_tabela: 'legalizacao_empresas',
    p_registro_id: null,
    p_contexto: {
      registros: registros.length,
      colunas: colunas.map((c) => c.campo),
      inclui_administrativo: incluiAdm && colunas.some((c) => c.confidencial),
      contexto,
      filtros: corpo.resumoFiltros ?? null,
      user_agent: request.headers.get('user-agent'),
    },
    p_dados_novos: null,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nome = `portalmpc-${contexto}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  });
}
