import { NextResponse, type NextRequest } from 'next/server';

import ExcelJS from 'exceljs';

import { COLUNAS_GERAIS, TODAS_COLUNAS, type DefinicaoColuna } from '@/lib/colunas';
import { formatarCnpj } from '@/lib/normalizacao';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import { PERMISSOES, ehAdmin, pode, podeLerLegalizacao } from '@/lib/permissoes';
import type { DadosAdministrativos, Empresa } from '@/types/banco';

export const runtime = 'nodejs';

interface FiltroExportacao {
  campo: string;
  operador: string;
  valor: string;
  confidencial?: boolean;
}

/**
 * Exportação para Excel com permissão aplicada NO SERVIDOR.
 *
 * O cliente não escolhe quais colunas pode exportar: mesmo que peça as
 * administrativas, elas só entram na planilha se o perfil for admin. E, ainda
 * que passassem por aqui, a RLS devolveria null no join.
 */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfilAtual();

  if (!perfil || !perfil.ativo) {
    return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  }
  if (!podeLerLegalizacao(perfil)) {
    return NextResponse.json({ erro: 'Sem permissão para acessar esta base.' }, { status: 403 });
  }
  // Ler e baixar são coisas diferentes: exportar leva a base inteira para fora
  // do portal, então tem permissão própria.
  if (!pode(perfil, PERMISSOES.exportarLegalizacao)) {
    return NextResponse.json(
      { erro: 'Você não tem permissão para exportar. Peça "Exportar Legalização" ao administrador.' },
      { status: 403 },
    );
  }

  const corpo = (await request.json().catch(() => ({}))) as {
    busca?: string;
    filtros?: FiltroExportacao[];
    ordenarPor?: string;
    ascendente?: boolean;
    colunas?: string[];
    contexto?: string;
  };

  const administrador = ehAdmin(perfil);

  // Ponto central da regra: o universo de colunas permitidas vem do perfil.
  const permitidas: DefinicaoColuna[] = administrador ? TODAS_COLUNAS : COLUNAS_GERAIS;
  const pedidas = corpo.colunas?.length
    ? permitidas.filter((c) => corpo.colunas!.includes(c.campo))
    : permitidas.filter((c) => c.padrao);
  const colunas = pedidas.length > 0 ? pedidas : permitidas.filter((c) => c.padrao);

  const supabase = await criarClienteServidor();

  const precisaAdministrativo = administrador && colunas.some((c) => c.confidencial);
  const filtrosAdmin = (corpo.filtros ?? []).filter((f) => f.confidencial);

  let query = supabase
    .from('legalizacao_empresas')
    .select(
      administrador
        ? filtrosAdmin.length > 0
          ? '*, legalizacao_dados_administrativos!inner(*)'
          : '*, legalizacao_dados_administrativos(*)'
        : '*',
    );

  const termo = (corpo.busca ?? '').replace(/[,()\\]/g, ' ').trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, '');
    query = query.or(
      [
        `razao_social.ilike.%${termo}%`,
        digitos ? `cnpj.ilike.%${digitos}%` : `cnpj.ilike.%${termo}%`,
        `cidade.ilike.%${termo}%`,
        `socio.ilike.%${termo}%`,
        `codigo.ilike.%${termo}%`,
      ].join(','),
    );
  }

  for (const filtro of corpo.filtros ?? []) {
    // Um usuário comum não pode nem filtrar por campo confidencial.
    if (filtro.confidencial && !administrador) continue;

    const coluna = filtro.confidencial
      ? `legalizacao_dados_administrativos.${filtro.campo}`
      : filtro.campo;

    switch (filtro.operador) {
      case 'contem': query = query.ilike(coluna, `%${filtro.valor}%`); break;
      case 'igual': query = query.eq(coluna, filtro.valor); break;
      case 'vazio': query = query.is(coluna, null); break;
      case 'preenchido': query = query.not(coluna, 'is', null); break;
      case 'maior': query = query.gte(coluna, filtro.valor); break;
      case 'menor': query = query.lte(coluna, filtro.valor); break;
    }
  }

  const ordenavel = COLUNAS_GERAIS.some((c) => c.campo === corpo.ordenarPor)
    ? corpo.ordenarPor!
    : 'razao_social';
  query = query.order(ordenavel, { ascending: corpo.ascendente ?? true, nullsFirst: false });

  // Limite de segurança: a base tem centenas de linhas, não milhões.
  const { data, error } = await query.limit(20000);
  if (error) {
    return NextResponse.json({ erro: `Falha ao consultar: ${error.message}` }, { status: 500 });
  }

  // O `select` varia conforme o perfil, então o tipo é afirmado aqui.
  const registros = (data ?? []) as unknown as (Empresa & {
    legalizacao_dados_administrativos?: DadosAdministrativos | DadosAdministrativos[] | null;
  })[];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PortalMPC';
  workbook.created = new Date();

  const planilha = workbook.addWorksheet('Legalização', {
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
      // Colunas confidenciais destacadas em âmbar, para ficar claro no arquivo.
      fgColor: { argb: coluna?.confidencial ? 'FFB45309' : 'FF2B5089' },
    };
  });

  for (const registro of registros) {
    const admBruto = registro.legalizacao_dados_administrativos;
    const administrativo = Array.isArray(admBruto) ? (admBruto[0] ?? null) : (admBruto ?? null);

    const linha: Record<string, unknown> = {};
    for (const coluna of colunas) {
      const bruto = coluna.confidencial
        ? administrativo
          ? (administrativo as unknown as Record<string, unknown>)[coluna.campo]
          : null
        : (registro as unknown as Record<string, unknown>)[coluna.campo];

      if (bruto === null || bruto === undefined) {
        linha[coluna.campo] = null;
      } else if (coluna.tipo === 'cnpj') {
        linha[coluna.campo] = formatarCnpj(bruto);
      } else if (coluna.tipo === 'data') {
        const data = new Date(String(bruto));
        linha[coluna.campo] = Number.isNaN(data.getTime()) ? String(bruto) : data;
      } else if (coluna.tipo === 'moeda' || coluna.tipo === 'numero') {
        linha[coluna.campo] = Number(bruto);
      } else if (coluna.tipo === 'booleano') {
        linha[coluna.campo] = bruto ? 'Sim' : 'Não';
      } else {
        linha[coluna.campo] = String(bruto);
      }
    }
    planilha.addRow(linha);
  }

  colunas.forEach((coluna, indice) => {
    const colunaExcel = planilha.getColumn(indice + 1);
    if (coluna.tipo === 'data') colunaExcel.numFmt = 'dd/mm/yyyy';
    if (coluna.tipo === 'moeda') colunaExcel.numFmt = 'R$ #,##0.00';
  });

  planilha.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: colunas.length },
  };

  // Aba de contexto: quem exportou, quando e sob quais filtros.
  const info = workbook.addWorksheet('Informações');
  info.columns = [{ width: 28 }, { width: 70 }];
  info.addRows([
    ['PortalMPC — Exportação'],
    [],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Usuário', `${perfil.nome} (${perfil.email})`],
    ['Função', perfil.role],
    ['Área', perfil.area],
    ['Registros exportados', registros.length],
    ['Colunas exportadas', colunas.length],
    [
      'Inclui dados administrativos',
      precisaAdministrativo ? 'Sim (perfil administrador)' : 'Não',
    ],
    ['Pesquisa aplicada', corpo.busca || '—'],
    [
      'Filtros aplicados',
      (corpo.filtros ?? []).length
        ? (corpo.filtros ?? []).map((f) => `${f.campo} ${f.operador} ${f.valor}`).join(' | ')
        : '—',
    ],
  ]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.getColumn(1).font = { bold: true };

  // Registra a exportação na trilha de auditoria.
  await supabase.rpc('registrar_evento_auditoria', {
    p_acao: 'EXPORT',
    p_tabela: 'legalizacao_empresas',
    p_registro_id: null,
    p_contexto: {
      registros: registros.length,
      colunas: colunas.map((c) => c.campo),
      inclui_administrativo: precisaAdministrativo,
      contexto: corpo.contexto ?? 'legalizacao',
      user_agent: request.headers.get('user-agent'),
    },
    p_dados_novos: null,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nome = `portalmpc-${corpo.contexto ?? 'legalizacao'}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  });
}
