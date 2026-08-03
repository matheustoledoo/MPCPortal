/**
 * Tipos do domínio PortalMPC.
 * Espelham exatamente o schema aplicado em `supabase/migrations`.
 */

export type Area = 'legalizacao' | 'fiscal' | 'contabil' | 'departamento_pessoal' | 'administracao';
export type Role = 'admin' | 'gestor' | 'colaborador';
export type OrigemRegistro = 'planilha_saude' | 'planilha_adm' | 'ambas' | 'manual';
export type AcaoAuditoria =
  | 'INSERT' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'LOGIN' | 'ADMIN_READ' | 'ADMIN_UPDATE';

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  area: Area;
  role: Role;
  ativo: boolean;
  telefone: string | null;
  ultimo_acesso: string | null;
  created_at: string;
  updated_at: string;
}

/** Base geral — o que a área de Legalização enxerga. */
export interface Empresa {
  id: string;
  cnpj: string | null;
  chave_identificacao: string;
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

  origem: OrigemRegistro;
  numero_origem_saude: number | null;
  numero_origem_adm: number | null;
  linha_origem_saude: number | null;
  linha_origem_adm: number | null;
  observacoes: string | null;
  necessita_revisao: boolean;
  revisao_motivo: string | null;
  responsavel_id: string | null;

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** CONFIDENCIAL — só chega ao cliente quando o usuário é admin (RLS). */
export interface DadosAdministrativos {
  id: string;
  empresa_id: string;
  data_saida: string | null;
  saida_raw: string | null;
  dia_vencimento: number | null;
  dia_vencimento_raw: string | null;
  observacoes_honorarios: string | null;
  valor_honorario: number | null;
  competencia_honorario: string | null;
  competencia_label: string | null;
  honorarios_historico: { competencia: string | null; label: string; valor: number | null }[];
  observacoes_internas: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type EmpresaComAdministrativo = Empresa & {
  legalizacao_dados_administrativos: DadosAdministrativos | DadosAdministrativos[] | null;
};

export interface RegistroAuditoria {
  id: number;
  usuario_id: string | null;
  usuario_email: string | null;
  usuario_nome: string | null;
  acao: AcaoAuditoria;
  tabela: string;
  registro_id: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  campos_alterados: string[] | null;
  contexto: Record<string, unknown> | null;
  created_at: string;
}

export interface LogImportacao {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: string;
  executado_por: string | null;
  executado_por_desc: string | null;
  arquivos: unknown;
  resumo: Record<string, unknown>;
  mensagem_erro: string | null;
  created_at: string;
}

export interface Divergencia {
  id: string;
  import_log_id: string | null;
  empresa_id: string | null;
  chave: string;
  razao_social: string | null;
  campo: string;
  valor_planilha_saude: string | null;
  valor_planilha_adm: string | null;
  valor_aplicado: string | null;
  fonte_vencedora: string | null;
  confidencial: boolean;
  resolvido: boolean;
  observacao: string | null;
  created_at: string;
}

export interface CidadeLink {
  id: string;
  cidade: string;
  cidade_normalizada: string;
  url_contribuinte_mobiliario: string | null;
  url_contribuinte_2025: string | null;
  url_consulta_cfm: string | null;
  observacao: string | null;
}

export interface DocumentoNecessario {
  id: string;
  ordem: number;
  descricao: string;
  grupo: string | null;
  ativo: boolean;
}

export interface OpcaoReferencia {
  id: string;
  grupo: string;
  valor: string;
  ordem: number;
  ativo: boolean;
}

export interface ItemChecklist {
  id: string;
  bloco: string;
  ordem: number;
  item: string;
  status: string | null;
  acao: string | null;
  responsavel_tecnico: string | null;
  observacao: string | null;
}

export interface EstatisticasLegalizacao {
  total_empresas: number;
  ativas: number;
  inativas: number;
  necessitam_revisao: number;
  cnpj_invalido: number;
  sem_alvara: number;
  com_alvara: number;
  por_origem: Record<string, number>;
  por_cidade: { cidade: string; total: number }[];
  por_tributacao: { tributacao: string; total: number }[];
  por_seguimento: { seguimento: string; total: number }[];
  vencimentos_proximos: { id: string; razao_social: string; documento: string; validade: string }[];
}

export interface EstatisticasFinanceiras {
  registros: number;
  faturamento_mensal: number;
  ticket_medio: number;
  maior_honorario: number;
  sem_honorario: number;
  por_vencimento: { dia: number; total: number }[];
}
