import { NextResponse, type NextRequest } from 'next/server';

import ExcelJS from 'exceljs';

import { formatarCnpj } from '@/lib/normalizacao';
import { PERMISSOES, pode } from '@/lib/permissoes';
import {
  COLUNAS_PROCESSO,
  buscarProcessos,
  situacaoProcesso,
  type FiltroProcessos,
} from '@/lib/processos';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { EstatisticasProcessos } from '@/types/banco';

export const runtime = 'nodejs';

/**
 * Exporta o Controle Geral no mesmo formato do arquivo de origem: a aba
 * CONTROLE_GERAL com as mesmas 13 colunas na mesma ordem, mais as abas de
 * painel. Quem preferir continuar no Excel consegue — e quem recebe o
 * arquivo reconhece o que está vendo.
 */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfilAtual();

  if (!perfil?.ativo) {
    return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  }
  if (!pode(perfil, PERMISSOES.telaProcessos)) {
    return NextResponse.json({ erro: 'Sem permissão para ver os processos.' }, { status: 403 });
  }

  const filtro = (await request.json().catch(() => ({}))) as FiltroProcessos;
  const supabase = await criarClienteServidor();

  const [processos, { data: stats }] = await Promise.all([
    buscarProcessos(supabase, filtro),
    supabase.rpc('processos_estatisticas'),
  ]);

  const estatisticas = (stats ?? {}) as Partial<EstatisticasProcessos>;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PortalMPC';
  workbook.created = new Date();

  /* ---------------------------------------------------------------- */
  /* CONTROLE_GERAL                                                     */
  /* ---------------------------------------------------------------- */
  const planilha = workbook.addWorksheet('CONTROLE_GERAL', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  planilha.columns = COLUNAS_PROCESSO.map((coluna) => ({
    header: coluna.rotulo.toUpperCase(),
    key: coluna.campo,
    width: Math.max(12, Math.min(48, Math.round(coluna.largura / 7))),
  }));

  const cabecalho = planilha.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cabecalho.height = 22;
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.eachCell((celula) => {
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
  });

  for (const processo of processos) {
    const linha = planilha.addRow({
      status: processo.status,
      empresa: processo.empresa,
      cnpj: processo.cnpj ? formatarCnpj(processo.cnpj) : null,
      tipo_servico: processo.tipo_servico,
      orgao: processo.orgao,
      protocolo: processo.protocolo,
      data_entrada: processo.data_entrada ? new Date(`${processo.data_entrada}T12:00:00`) : null,
      prazo: processo.prazo ? new Date(`${processo.prazo}T12:00:00`) : null,
      responsavel: processo.responsavel,
      proxima_acao: processo.proxima_acao,
      ultima_atualizacao: new Date(processo.ultima_atualizacao),
      observacoes: processo.observacoes,
      indicador: processo.indicador,
    });

    // Reproduz a formatação condicional do arquivo de origem: vermelho para
    // vencido, âmbar para vencendo em até três dias.
    const situacao = situacaoProcesso(processo.prazo, processo.status);
    const cor =
      situacao === 'atrasado' ? 'FFFFCDD2' : situacao === 'atencao' ? 'FFFFF9C4' : null;
    if (cor) {
      linha.eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
      });
    }
  }

  const colunaEntrada = planilha.getColumn('data_entrada');
  const colunaPrazo = planilha.getColumn('prazo');
  const colunaAtualizacao = planilha.getColumn('ultima_atualizacao');
  colunaEntrada.numFmt = 'dd/mm/yyyy';
  colunaPrazo.numFmt = 'dd/mm/yyyy';
  colunaAtualizacao.numFmt = 'dd/mm/yyyy hh:mm';

  planilha.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_PROCESSO.length } };

  /* ---------------------------------------------------------------- */
  /* Painéis — as mesmas três abas do arquivo original                  */
  /* ---------------------------------------------------------------- */
  function abaContagem(nome: string, titulo: string, dados: { valor: string; total: number }[]) {
    const aba = workbook.addWorksheet(nome);
    aba.columns = [{ width: 34 }, { width: 12 }];
    aba.addRow([titulo]);
    aba.getRow(1).font = { bold: true, size: 13 };
    aba.addRow([]);
    aba.addRow(['DESCRIÇÃO', 'QTDE']);
    aba.getRow(3).font = { bold: true };
    for (const item of dados) aba.addRow([item.valor, item.total]);
    return aba;
  }

  abaContagem('DASHBOARD', 'PAINEL DE CONTROLE', estatisticas.por_status ?? []);
  abaContagem('DASHBOARD_ORGAO', 'PAINEL POR ÓRGÃO', estatisticas.por_orgao ?? []);
  abaContagem('DASHBOARD_RESPONSAVEL', 'PAINEL POR RESPONSÁVEL', estatisticas.por_responsavel ?? []);

  const executivo = workbook.addWorksheet('DASHBOARD_EXECUTIVO');
  executivo.columns = [{ width: 20 }, { width: 22 }];
  executivo.addRow(['DASHBOARD EXECUTIVO - VENCIMENTOS']);
  executivo.getRow(1).font = { bold: true, size: 13 };
  executivo.addRow([]);
  executivo.addRow(['MÊS', 'QTDE VENCIMENTOS']);
  executivo.getRow(3).font = { bold: true };
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  for (const item of estatisticas.vencimentos_por_mes ?? []) {
    executivo.addRow([meses[item.mes - 1] ?? item.mes, item.total]);
  }

  const info = workbook.addWorksheet('Informações');
  info.columns = [{ width: 28 }, { width: 70 }];
  info.addRows([
    ['PortalMPC — Controle Geral'],
    [],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Usuário', `${perfil.nome} (${perfil.email})`],
    ['Processos exportados', processos.length],
    ['Recorte', filtro.recorte ?? 'todos'],
    ['Pesquisa aplicada', filtro.busca || '—'],
    ['Órgão', filtro.orgao || '—'],
    ['Tipo de serviço', filtro.tipoServico || '—'],
    ['Em aberto', estatisticas.abertos ?? 0],
    ['Atrasados', estatisticas.atrasados ?? 0],
    ['Vencem em até 3 dias', estatisticas.atencao ?? 0],
  ]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.getColumn(1).font = { bold: true };

  await supabase.rpc('registrar_evento_auditoria', {
    p_acao: 'EXPORT',
    p_tabela: 'legalizacao_processos',
    p_registro_id: null,
    p_contexto: { registros: processos.length, recorte: filtro.recorte ?? 'todos' },
    p_dados_novos: null,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nome = `portalmpc-controle-geral-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  });
}
