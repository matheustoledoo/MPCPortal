/**
 * Tipos do domínio PortalMPC.
 * Espelham exatamente o schema aplicado em `supabase/migrations`.
 */

export type Area =
  | 'legalizacao' | 'fiscal' | 'contabil' | 'departamento_pessoal' | 'qualidade' | 'administracao';
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
  /** Perfil público do Fórum da Meta (migration 0019). */
  apelido?: string | null;
  bio?: string | null;
  cargo?: string | null;
  avatar_path?: string | null;
  capa_cor?: string | null;
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
  /** Carteira (migration 0026): a empresa que sai fica inativa, nunca é apagada. */
  situacao: 'ativa' | 'inativa';
  data_saida: string | null;
  motivo_saida: string | null;

  origem: OrigemRegistro;
  numero_origem_saude: number | null;
  numero_origem_adm: number | null;
  linha_origem_saude: number | null;
  linha_origem_adm: number | null;
  observacoes: string | null;
  necessita_revisao: boolean;
  revisao_motivo: string | null;
  responsavel_id: string | null;

  /** Aviso vindo do Controle Legalização — mantidos por gatilho, não editáveis. */
  processos_abertos: number;
  processo_proximo_prazo: string | null;

  /** Valores das colunas criadas pela equipe (planilha_colunas). */
  campos_extras: Record<string, unknown>;

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
  campos_extras: Record<string, unknown>;
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

/* -------------------------------------------------------------------------- */
/* Permissões modulares                                                        */
/* -------------------------------------------------------------------------- */

export type GrupoPermissao = 'telas' | 'dados' | 'administracao';

export interface PermissaoCatalogo {
  chave: string;
  rotulo: string;
  descricao: string | null;
  grupo: GrupoPermissao;
  rota: string | null;
  somente_admin: boolean;
  ordem: number;
}

export interface UsuarioPermissao {
  usuario_id: string;
  chave: string;
  concedido_por: string | null;
  created_at: string;
}

export interface UsuarioColuna {
  usuario_id: string;
  tabela: string;
  coluna: string;
}

/** Perfil somado ao que ele pode fazer — o que a aplicação consulta. */
export interface PerfilComPermissoes extends Perfil {
  permissoes: string[];
  /** Vazio = pode editar todas as colunas liberadas para o time. */
  colunasEditaveis: string[];
}

/* -------------------------------------------------------------------------- */
/* Atribuições recorrentes                                                     */
/* -------------------------------------------------------------------------- */

export type Periodicidade =
  | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral'
  | 'trimestral' | 'semestral' | 'anual' | 'avulsa';

export interface Atribuicao {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string;
  area: Area;
  tabela: string;
  colunas: string[];
  periodicidade: Periodicidade;
  proximo_prazo: string;
  alerta_dias_antes: number;
  ativa: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Atribuição já com o dono resolvido — todo mundo pode ver de quem é. */
export type AtribuicaoComResponsavel = Atribuicao & {
  responsavel: Pick<Perfil, 'id' | 'nome' | 'email' | 'area'> | null;
};

export type SituacaoAtribuicao = 'atrasada' | 'proxima' | 'em_dia';

/** Formato devolvido por `minhas_atribuicoes()`. */
export interface AtribuicaoDoUsuario {
  id: string;
  titulo: string;
  descricao: string | null;
  colunas: string[];
  periodicidade: Periodicidade;
  proximo_prazo: string;
  alerta_dias_antes: number;
  dias_restantes: number;
  situacao: SituacaoAtribuicao;
  ultima_conclusao: string | null;
}

/* -------------------------------------------------------------------------- */
/* CONTROLE_GERAL — processos de legalização                                   */
/* -------------------------------------------------------------------------- */

/** Situação do prazo, calculada — não é digitada por ninguém. */
export type SituacaoProcesso = 'atrasado' | 'atencao' | 'em_dia' | 'sem_prazo' | 'encerrado';

export interface Processo {
  id: string;
  empresa_id: string | null;
  empresa: string;
  cnpj: string | null;
  status: string;
  tipo_servico: string | null;
  orgao: string | null;
  protocolo: string | null;
  data_entrada: string;
  prazo: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  proxima_acao: string | null;
  observacoes: string | null;
  indicador: string | null;
  /** Campos opcionais: colunas da equipe e pares "rótulo → valor" livres. */
  campos_extras: Record<string, unknown>;
  ultima_atualizacao: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Resultado do autocomplete de empresa (`buscar_empresas_para_processo`). */
export interface EmpresaSugerida {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
  codigo: string | null;
  status: string | null;
  processos_abertos: number;
  responsavel_id: string | null;
}

export interface ContagemRotulada {
  valor: string;
  total: number;
}

/** Retorno de `processos_estatisticas()` — as três abas DASHBOARD juntas. */
export interface EstatisticasProcessos {
  total: number;
  abertos: number;
  atrasados: number;
  atencao: number;
  sem_prazo: number;
  concluidos_mes: number;
  por_status: ContagemRotulada[];
  por_orgao: ContagemRotulada[];
  por_tipo: ContagemRotulada[];
  por_responsavel: ContagemRotulada[];
  vencimentos_por_mes: { mes: number; total: number }[];
}

export interface OpcaoCombo {
  grupo: string;
  valor: string;
  ordem: number;
}

export interface ExecucaoAtribuicao {
  id: string;
  atribuicao_id: string;
  competencia: string;
  concluida_em: string;
  concluida_por: string | null;
  observacao: string | null;
}

/* -------------------------------------------------------------------------- */
/* Planilhas personalizáveis (migration 0016)                                  */
/* -------------------------------------------------------------------------- */

export type TabelaPlanilha =
  | 'legalizacao_empresas'
  | 'legalizacao_dados_administrativos'
  | 'legalizacao_processos';

export type TipoColunaPersonalizada =
  | 'texto' | 'longo' | 'numero' | 'moeda' | 'data' | 'status' | 'booleano' | 'formula';

export type FormatoFormula = 'texto' | 'numero' | 'moeda' | 'data' | 'status' | 'booleano';

export interface PlanilhaColuna {
  id: string;
  tabela: TabelaPlanilha;
  campo: string;
  personalizada: boolean;
  rotulo: string;
  tipo: TipoColunaPersonalizada;
  formula: string | null;
  formato: FormatoFormula;
  opcoes: string[];
  largura: number;
  ordem: number;
  oculta: boolean;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Notificações (migration 0018)                                               */
/* -------------------------------------------------------------------------- */

export type CategoriaNotificacao =
  | 'prazo' | 'atribuicao' | 'processo' | 'calendario' | 'forum' | 'mencao' | 'integracao' | 'sistema';

export type PrioridadeNotificacao = 'baixa' | 'normal' | 'alta' | 'urgente';

export interface Notificacao {
  id: string;
  usuario_id: string;
  categoria: CategoriaNotificacao;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  prioridade: PrioridadeNotificacao;
  ator_id: string | null;
  origem_tabela: string | null;
  origem_id: string | null;
  prazo: string | null;
  chave: string | null;
  dados: Record<string, unknown>;
  lida_em: string | null;
  concluida_em: string | null;
  arquivada_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContagemNotificacoes {
  nao_lidas: number;
  urgentes: number;
  prazos: number;
  por_categoria: Partial<Record<CategoriaNotificacao, number>>;
}

/* -------------------------------------------------------------------------- */
/* Fórum da Meta (migration 0019)                                              */
/* -------------------------------------------------------------------------- */

export interface AutorForum {
  id: string;
  nome: string;
  apelido: string | null;
  avatar_path: string | null;
  cargo?: string | null;
  area?: Area | null;
}

export interface EnqueteForum {
  opcoes: string[];
  encerra_em?: string | null;
}

/** Formato devolvido por `forum_listar()`. */
export interface PostForum {
  id: string;
  texto: string;
  imagens: string[];
  pai_id: string | null;
  raiz_id: string | null;
  citacao_id: string | null;
  enquete: EnqueteForum | null;
  tags: string[];
  fixado: boolean;
  editado_em: string | null;
  created_at: string;
  curtidas: number;
  respostas: number;
  citacoes: number;
  curti: boolean;
  salvei: boolean;
  meu_voto: number | null;
  votos: number[] | null;
  autor: AutorForum | null;
  respondendo_a: { id: string; apelido: string | null; nome: string } | null;
  citacao: {
    id: string;
    texto: string;
    imagens: string[];
    created_at: string;
    autor: AutorForum | null;
  } | null;
}

/** Formato devolvido por `forum_perfil()`. */
export interface PerfilForum {
  id: string;
  nome: string;
  apelido: string | null;
  bio: string | null;
  cargo: string | null;
  area: Area | null;
  avatar_path: string | null;
  capa_cor: string | null;
  desde: string;
  posts: number;
  respostas: number;
  seguidores: number;
  seguindo: number;
  curtidas_recebidas: number;
  eu_sigo: boolean;
  sininho: boolean;
  me_segue: boolean;
}

export interface PessoaForum {
  id: string;
  nome: string;
  apelido: string | null;
  cargo: string | null;
  area: Area | null;
  avatar_path: string | null;
  seguidores: number;
  eu_sigo: boolean;
}

/* -------------------------------------------------------------------------- */
/* Calendário de Obrigações e Integração de Clientes (migration 0017)          */
/* -------------------------------------------------------------------------- */

export type Departamento =
  | 'Matriz' | 'Fiscal' | 'Departamento Pessoal' | 'Contabilidade' | 'Legalização' | 'Qualidade';

export type CategoriaCalendario =
  | 'Federal' | 'Trabalhista' | 'Estadual' | 'Municipal' | 'Interna' | 'Outro' | 'Feriado';

export type TipoVencimento = 'dia' | 'diaUtil' | 'ultimoDiaUtil';
export type AjusteVencimento = 'antecipa' | 'prorroga' | 'nenhum';
export type ReferenciaCompetencia = '' | 'mes' | 'mes2' | 'tri' | 'ano' | 'atual';
export type TipoEvento = '' | 'Demanda' | 'Reunião Geral' | 'Reunião de Integração';
export type Recorrencia = 'nenhuma' | 'mensal' | 'anual';

export interface RegraCalendario {
  id: string;
  nome: string;
  departamento: Departamento;
  categoria: CategoriaCalendario;
  regime: string;
  tipo: TipoVencimento;
  dia: number;
  ajuste: AjusteVencimento;
  meses: number[];
  ref: ReferenciaCompetencia;
  descricao: string;
  ativo: boolean;
  sabado_util: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  /** 'econet' = obrigação legal do calendário anual e-Conet; 'equipe' = criada pelo time. */
  fonte?: 'econet' | 'equipe';
  conferido_em?: string | null;
  updated_at?: string;
}

export type ModuloAgenda =
  | 'calendario' | 'obrigacoes' | 'tarefas' | 'processos' | 'atribuicoes' | 'integracao' | 'documentos' | 'prospeccao';
export type StatusAgenda = 'pendente' | 'concluido' | 'cancelado';

export interface EventoCalendario {
  id: string;
  titulo: string;
  data: string;
  data_inicio: string | null;
  hora: string | null;
  tipo: TipoEvento;
  categoria: CategoriaCalendario;
  departamento: Departamento;
  visivel_para: Departamento[];
  responsavel_id: string | null;
  responsavel_nome: string | null;
  designado_por: string | null;
  designado_por_nome: string | null;
  recorrencia: Recorrencia;
  empresa_id: string | null;
  empresa: string | null;
  cnpj: string | null;
  contato: string | null;
  modalidade: string | null;
  notas: string;
  /** Agenda central (migration 0025): quem publicou o evento e para onde ele leva. */
  modulo?: ModuloAgenda;
  origem_tabela?: string | null;
  origem_id?: string | null;
  link?: string | null;
  status?: StatusAgenda;
  participantes?: string[];
  privado?: boolean;
  hora_fim?: string | null;
  status_na_origem?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ConclusaoCalendario {
  chave: string;
  mes: string;
  concluido_em: string;
  concluido_por: string | null;
  concluido_por_nome: string | null;
}

export interface Integracao {
  id: string;
  ficha: Record<string, string>;
  empresa_id: string | null;
  evento_id: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegracaoDepartamento {
  integracao_id: string;
  departamento: Departamento;
  dados: Record<string, unknown>;
  atendido_por: string | null;
  finalizado: boolean;
  finalizado_em: string | null;
  finalizado_por: string | null;
  finalizado_por_nome: string | null;
  updated_at: string;
}

/** Linha de `integracoes_resumo()`: a situação de cada roteiro, sem o conteúdo. */
export interface ResumoIntegracao {
  integracao_id: string;
  departamento: Departamento;
  finalizado: boolean;
  finalizado_em: string | null;
  finalizado_por: string | null;
  atendido_por: string | null;
}

/* -------------------------------------------------------------------------- */
/* Opções reutilizáveis (migration 0024)                                       */
/* -------------------------------------------------------------------------- */

export interface OpcaoLista {
  id: string;
  grupo: string;
  valor: string;
  ordem: number;
  ativo: boolean;
  /** Opção de fábrica: não pode ser excluída. */
  padrao: boolean;
}

/* -------------------------------------------------------------------------- */
/* Empresas: movimentações e documentos (migration 0026)                       */
/* -------------------------------------------------------------------------- */

export interface AnexoArquivo {
  caminho: string;
  nome: string;
  tipo: string | null;
  tamanho: number | null;
}

export interface MovimentacaoEmpresa {
  id: string;
  empresa_id: string;
  tipo: string;
  data_ocorrencia: string;
  descricao: string;
  situacao_anterior: string | null;
  nova_situacao: string | null;
  campo: string | null;
  automatica: boolean;
  anexos: AnexoArquivo[];
  registrado_por: string | null;
  registrado_por_nome: string | null;
  registrado_em: string;
}

export interface DocumentoEmpresa {
  id: string;
  empresa_id: string;
  movimentacao_id: string | null;
  nome: string;
  caminho: string;
  tipo: string | null;
  tamanho: number | null;
  categoria: string | null;
  enviado_por: string | null;
  enviado_por_nome: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Tarefas e lembretes (migration 0027)                                        */
/* -------------------------------------------------------------------------- */

export type StatusTarefa = 'a_fazer' | 'em_andamento' | 'em_revisao' | 'concluido' | 'cancelado';
export type PrioridadeTarefa = 'baixa' | 'normal' | 'alta' | 'urgente';

export interface ItemChecklistTarefa {
  id: string;
  texto: string;
  feito: boolean;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  tipo: 'tarefa' | 'lembrete';
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  categoria: string | null;
  vencimento: string | null;
  hora: string | null;
  responsaveis: string[];
  privada: boolean;
  empresa_id: string | null;
  empresa: string | null;
  checklist: ItemChecklistTarefa[];
  ordem: number;
  criado_por: string | null;
  criado_por_nome: string | null;
  concluida_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComentarioTarefa {
  id: string;
  tarefa_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  texto: string;
  created_at: string;
}

export interface AnexoTarefa {
  id: string;
  tarefa_id: string;
  nome: string;
  caminho: string;
  tipo: string | null;
  tamanho: number | null;
  enviado_por: string | null;
  enviado_por_nome: string | null;
  created_at: string;
}

export interface HistoricoTarefa {
  id: string;
  tarefa_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  acao: string;
  de: string | null;
  para: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Prospecção — CRM (migration 0028)                                           */
/* -------------------------------------------------------------------------- */

export interface EtapaProspeccao {
  id: string;
  nome: string;
  ordem: number;
  cor: string;
  tipo: 'aberta' | 'ganha' | 'perdida';
  ativo: boolean;
}

export interface Lead {
  id: string;
  empresa: string;
  cnpj: string | null;
  segmento: string | null;
  contato: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string | null;
  responsavel_id: string | null;
  data_entrada: string;
  observacoes: string;
  etapa_id: string;
  etapa_desde: string;
  valor_estimado: number | null;
  motivo_perda: string | null;
  ultimo_contato_em: string | null;
  proxima_acao_em: string | null;
  convertido_em: string | null;
  perdido_em: string | null;
  empresa_id: string | null;
  ordem: number;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoAtividadeLead = 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'visita' | 'proposta' | 'nota' | 'etapa';

export interface AtividadeLead {
  id: string;
  lead_id: string;
  tipo: TipoAtividadeLead;
  descricao: string;
  data: string;
  hora: string | null;
  agendada: boolean;
  concluida: boolean;
  concluida_em: string | null;
  resultado: string | null;
  valor: number | null;
  responsavel_id: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

export interface IndicadoresProspeccao {
  total: number;
  em_aberto: number;
  novos: number;
  convertidos: number;
  perdidos: number;
  valor_ganho: number;
  valor_em_aberto: number;
  taxa_conversao: number | null;
  funil: { etapa_id: string; nome: string; cor: string; tipo: string; total: number; valor: number }[];
  por_responsavel: { id: string | null; nome: string; leads: number; em_aberto: number; convertidos: number; perdidos: number }[];
  por_origem: { rotulo: string; total: number; convertidos: number }[];
  por_mes: { mes: string; novos: number; convertidos: number; perdidos: number }[];
  motivos_perda: { rotulo: string; total: number }[];
  pendentes: number;
  atrasadas: number;
  sem_proxima_acao: number;
  proximos: { id: string; lead_id: string; empresa: string; tipo: string; descricao: string; data: string; hora: string | null; responsavel: string | null }[];
}

/* -------------------------------------------------------------------------- */
/* Mensagens internas (migration 0029)                                         */
/* -------------------------------------------------------------------------- */

export interface ParticipanteChat {
  id: string;
  nome: string;
  apelido: string | null;
  avatar_path: string | null;
  area: Area | null;
  cargo: string | null;
  papel: 'admin' | 'membro';
  ativo: boolean;
}

export interface ConversaChat {
  id: string;
  tipo: 'direta' | 'grupo';
  nome: string | null;
  departamento: string | null;
  criado_por: string | null;
  ultima_mensagem_em: string;
  ultima_mensagem_resumo: string | null;
  ultima_mensagem_autor: string | null;
  nao_lidas: number;
  meu_papel: 'admin' | 'membro';
  participantes: ParticipanteChat[];
}

export interface MensagemChat {
  id: string;
  conversa_id: string;
  autor_id: string | null;
  texto: string;
  anexos: AnexoArquivo[];
  resposta_a: string | null;
  editada_em: string | null;
  excluida_em: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Aprendizagem e procedimentos (migration 0030)                               */
/* -------------------------------------------------------------------------- */

export interface CategoriaConhecimento {
  id: string;
  nome: string;
  descricao: string | null;
  pai_id: string | null;
  departamento: string | null;
  ordem: number;
}

export type TipoBloco = 'titulo' | 'texto' | 'destaque' | 'imagem' | 'video' | 'link';

export interface BlocoConteudo {
  id: string;
  tipo: TipoBloco;
  texto?: string;
  /** destaque: 'info' | 'atencao' | 'importante' */
  tom?: 'info' | 'atencao' | 'importante';
  /** imagem/vídeo enviados: caminho no bucket `arquivos`. */
  caminho?: string;
  /** vídeo ou link externo. */
  url?: string;
  legenda?: string;
}

export interface PassoProcedimento {
  id: string;
  titulo: string;
  detalhe?: string;
  importante?: boolean;
  caminho?: string;
}

export interface ArtigoConhecimento {
  id: string;
  titulo: string;
  resumo: string;
  tipo: 'tutorial' | 'procedimento' | 'arquivo';
  categoria_id: string | null;
  departamento: string | null;
  atividade: string | null;
  palavras_chave: string[];
  blocos: BlocoConteudo[];
  passos: PassoProcedimento[];
  anexos: AnexoArquivo[];
  publicado: boolean;
  destaque: boolean;
  versao: number;
  nota_alteracao: string | null;
  visualizacoes: number;
  uteis: number;
  nao_uteis: number;
  criado_por: string | null;
  criado_por_nome: string | null;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersaoConhecimento {
  id: string;
  artigo_id: string;
  versao: number;
  titulo: string;
  retrato: Partial<ArtigoConhecimento>;
  nota: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Ferramentas (migration 0031)                                                */
/* -------------------------------------------------------------------------- */

export interface TabelaFerramenta {
  id: string;
  chave: string;
  vigencia_inicio: string;
  titulo: string;
  dados: Record<string, unknown>;
  fonte: string;
  fonte_url: string | null;
  observacao: string | null;
  conferido_em: string | null;
  updated_at: string;
}

export interface CalculoSalvo {
  id: string;
  ferramenta: string;
  titulo: string;
  entrada: Record<string, unknown>;
  resultado: Record<string, unknown>;
  created_at: string;
}

/** Pessoa da equipe, para seletores de responsável (sem dado sensível). */
export interface PessoaEquipe {
  id: string;
  nome: string;
  area?: Area | null;
  avatar_path?: string | null;
}
