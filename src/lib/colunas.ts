/**
 * Definição das colunas da base de Legalização.
 *
 * Fonte única usada por: tabela da planilha, formulário lateral, filtros e
 * exportação para Excel. Acrescentar uma coluna aqui a faz aparecer em todos
 * esses lugares de uma vez.
 *
 * `confidencial: true` marca campos da tabela `legalizacao_dados_administrativos`,
 * que só existem na resposta da API quando o usuário é admin (garantido por RLS).
 */

export type TipoColuna = 'texto' | 'data' | 'numero' | 'moeda' | 'cnpj' | 'status' | 'booleano' | 'longo';

export interface DefinicaoColuna {
  /** Chave do campo. Para confidenciais, o caminho dentro de `administrativo`. */
  campo: string;
  rotulo: string;
  tipo: TipoColuna;
  largura: number;
  /** Origem na planilha, exibida na ajuda da coluna. */
  origem?: string;
  editavel: boolean;
  /** Confidencial = tabela administrativa, exclusiva de admin. */
  confidencial?: boolean;
  /** Sugestões para o editor de célula. */
  opcoes?: string[];
  /** Visível por padrão ao abrir a planilha. */
  padrao?: boolean;
  /** Congelada à esquerda (identificação da empresa). */
  fixa?: boolean;
}

const SIM_NAO = ['SIM', 'NÃO', 'NA'];
const DOCUMENTO = ['SIM', 'NÃO', 'NA', 'VENCIDA', 'NÃO EMITIDO', 'NÃO PAGO', 'EM ANÁLISE'];

/** Colunas gerais — visíveis para a área de Legalização. */
export const COLUNAS_GERAIS: DefinicaoColuna[] = [
  { campo: 'razao_social', rotulo: 'Razão Social', tipo: 'texto', largura: 300, origem: 'Saúde: RAZÃO SOCIAL · ADM: EMPRESAS', editavel: true, padrao: true, fixa: true },
  { campo: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', largura: 170, origem: 'ambas: CNPJ', editavel: true, padrao: true, fixa: true },
  { campo: 'codigo', rotulo: 'Código', tipo: 'texto', largura: 90, origem: 'ambas: COD', editavel: true, padrao: true },
  { campo: 'cidade', rotulo: 'Cidade', tipo: 'texto', largura: 160, origem: 'ambas: CIDADE', editavel: true, padrao: true },
  { campo: 'data_inicio', rotulo: 'Início', tipo: 'data', largura: 110, origem: 'Saúde: INICIO · ADM: INÍCIO', editavel: true, padrao: true },
  { campo: 'status', rotulo: 'Status', tipo: 'status', largura: 110, origem: 'ADM: STATUS', editavel: true, opcoes: ['ATIVO', 'SUSPENSO', 'INATIVO', 'BAIXADO'], padrao: true },
  { campo: 'tributacao', rotulo: 'Tributação', tipo: 'status', largura: 140, origem: 'ADM: TRIBUTAÇÃO', editavel: true, opcoes: ['SIMPLES', 'NÃO OPTANTE', 'MEI', 'LUCRO REAL', 'LUCRO PRESUMIDO', 'DOMESTICA'], padrao: true },
  { campo: 'tipo', rotulo: 'Tipo', tipo: 'texto', largura: 200, origem: 'ADM: TIPO', editavel: true, padrao: true },
  { campo: 'seguimento', rotulo: 'Seguimento', tipo: 'status', largura: 160, origem: 'Saúde: SEGUIMENTO', editavel: true, padrao: true },
  { campo: 'socio', rotulo: 'Sócio', tipo: 'texto', largura: 260, origem: 'Saúde: SOCIO', editavel: true, padrao: true },
  { campo: 'estabelecido', rotulo: 'Estabelecido', tipo: 'status', largura: 120, origem: 'Saúde: ESTABELICIDO', editavel: true, opcoes: SIM_NAO, padrao: true },
  { campo: 'inscricao_municipal', rotulo: 'Insc. Municipal', tipo: 'texto', largura: 150, origem: 'Saúde: INS. MUNICIPAL', editavel: true, padrao: true },
  { campo: 'alvara', rotulo: 'Alvará', tipo: 'status', largura: 100, origem: 'Saúde: ALVARÁ', editavel: true, opcoes: SIM_NAO, padrao: true },
  { campo: 'avcb_clcb', rotulo: 'AVCB / CLCB', tipo: 'status', largura: 130, origem: 'Saúde: AVCB / CLCB', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'avcb_clcb_validade', rotulo: 'Validade AVCB', tipo: 'data', largura: 130, origem: 'Saúde: AVCB / CLCB (datas)', editavel: true, padrao: false },
  { campo: 'lta', rotulo: 'LTA', tipo: 'status', largura: 100, origem: 'Saúde: LTA', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'cnes', rotulo: 'CNES', tipo: 'status', largura: 100, origem: 'Saúde: CNES', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'cetesb', rotulo: 'CETESB', tipo: 'status', largura: 110, origem: 'Saúde: CETESB', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'amlurb_tx_lixo', rotulo: 'AMLURB (TX Lixo)', tipo: 'status', largura: 150, origem: 'Saúde: AMLURB (TX LIXO)', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'vigilancia_sanitaria', rotulo: 'Vigilância Sanitária', tipo: 'status', largura: 170, origem: 'Saúde: VIGILÂNCIA SANITÁRIA', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'vigilancia_sanitaria_validade', rotulo: 'Validade VISA', tipo: 'data', largura: 130, origem: 'Saúde: VIGILÂNCIA SANITÁRIA (datas)', editavel: true, padrao: false },
  { campo: 'extramuros', rotulo: 'Extramuros', tipo: 'status', largura: 120, origem: 'Saúde: EXTRAMUROS', editavel: true, opcoes: DOCUMENTO, padrao: true },
  { campo: 'responsavel_tecnico', rotulo: 'Responsável Técnico', tipo: 'texto', largura: 240, origem: 'Saúde: RESPONSÁVEL TÉCNICO', editavel: true, padrao: true },
  { campo: 'profissional', rotulo: 'Profissional', tipo: 'status', largura: 160, origem: 'Saúde: PROFISSIONAL', editavel: true, padrao: true },
  { campo: 'orgao', rotulo: 'Órgão', tipo: 'status', largura: 110, origem: 'Saúde: ÓRGÃO', editavel: true, padrao: true },
  { campo: 'validade', rotulo: 'Validade RT', tipo: 'status', largura: 120, origem: 'Saúde: VALIDADE', editavel: true, padrao: true },
  { campo: 'validade_data', rotulo: 'Validade RT (data)', tipo: 'data', largura: 150, origem: 'Saúde: VALIDADE (datas)', editavel: true, padrao: false },
  { campo: 'observacoes', rotulo: 'Observações', tipo: 'longo', largura: 260, origem: 'PortalMPC', editavel: true, padrao: false },
  { campo: 'origem', rotulo: 'Origem', tipo: 'status', largura: 140, origem: 'Rastreabilidade da importação', editavel: false, padrao: true },
  { campo: 'necessita_revisao', rotulo: 'Revisão', tipo: 'booleano', largura: 100, origem: 'Validação automática', editavel: true, padrao: true },
  { campo: 'revisao_motivo', rotulo: 'Motivo da revisão', tipo: 'longo', largura: 260, origem: 'Validação automática', editavel: false, padrao: false },
  { campo: 'updated_at', rotulo: 'Última alteração', tipo: 'data', largura: 140, origem: 'PortalMPC', editavel: false, padrao: false },
];

/** Colunas confidenciais — apenas admin. Bloco financeiro/contratual do Adm.xlsx. */
export const COLUNAS_ADMINISTRATIVAS: DefinicaoColuna[] = [
  { campo: 'valor_honorario', rotulo: 'Honorário', tipo: 'moeda', largura: 130, origem: 'ADM: coluna de competência (jul/26)', editavel: true, confidencial: true, padrao: true },
  { campo: 'competencia_label', rotulo: 'Competência', tipo: 'texto', largura: 120, origem: 'ADM: cabeçalho da competência', editavel: false, confidencial: true, padrao: true },
  { campo: 'dia_vencimento', rotulo: 'Dia Vencimento', tipo: 'numero', largura: 130, origem: 'ADM: DATA DE VENCIM.', editavel: true, confidencial: true, padrao: true },
  { campo: 'observacoes_honorarios', rotulo: 'Condições de honorários', tipo: 'longo', largura: 320, origem: 'ADM: OBS.', editavel: true, confidencial: true, padrao: true },
  { campo: 'data_saida', rotulo: 'Saída', tipo: 'data', largura: 110, origem: 'ADM: SAÍDA', editavel: true, confidencial: true, padrao: true },
  { campo: 'observacoes_internas', rotulo: 'Observações internas', tipo: 'longo', largura: 280, origem: 'PortalMPC', editavel: true, confidencial: true, padrao: false },
];

export const TODAS_COLUNAS = [...COLUNAS_GERAIS, ...COLUNAS_ADMINISTRATIVAS];

/** Colunas disponíveis para o perfil informado — a base da proteção na interface. */
export function colunasPara(podeVerAdministrativo: boolean): DefinicaoColuna[] {
  return podeVerAdministrativo ? TODAS_COLUNAS : COLUNAS_GERAIS;
}

export function colunasVisiveisPadrao(podeVerAdministrativo: boolean): string[] {
  return colunasPara(podeVerAdministrativo)
    .filter((coluna) => coluna.padrao)
    .map((coluna) => coluna.campo);
}

/** Campos que o cliente pode enviar num update da base geral. */
export const CAMPOS_EDITAVEIS_GERAIS = COLUNAS_GERAIS.filter((c) => c.editavel).map((c) => c.campo);

/** Campos que o cliente pode enviar num update dos dados administrativos. */
export const CAMPOS_EDITAVEIS_ADMINISTRATIVOS = COLUNAS_ADMINISTRATIVAS.filter((c) => c.editavel).map(
  (c) => c.campo,
);
