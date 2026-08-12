/**
 * Centro único de decisões de permissão do frontend.
 *
 * IMPORTANTE: isto é conveniência de interface, não segurança. A segurança
 * real está nas políticas de RLS (`supabase/migrations/0006` e `0010`).
 * Toda regra aqui tem uma política equivalente no banco.
 *
 * O modelo é modular: o administrador marca permissões por usuário, e é
 * essa lista — e não a função (`role`) — que decide o que aparece e o que
 * pode ser feito. `admin` continua tendo tudo, sempre.
 */

import type { Area, PerfilComPermissoes, Role } from '@/types/banco';

/* -------------------------------------------------------------------------- */
/* Times e funções                                                             */
/* -------------------------------------------------------------------------- */

export const AREAS: { valor: Area; rotulo: string; rota: string }[] = [
  { valor: 'legalizacao', rotulo: 'Legalização', rota: '/legalizacao' },
  { valor: 'fiscal', rotulo: 'Fiscal', rota: '/fiscal' },
  { valor: 'contabil', rotulo: 'Contábil', rota: '/contabil' },
  { valor: 'departamento_pessoal', rotulo: 'Departamento Pessoal', rota: '/departamento-pessoal' },
  { valor: 'administracao', rotulo: 'Administração', rota: '/dashboard' },
];

export const ROLES: { valor: Role; rotulo: string; descricao: string }[] = [
  { valor: 'admin', rotulo: 'Administrador', descricao: 'Acesso total e irrestrito, inclusive aos dados financeiros.' },
  { valor: 'gestor', rotulo: 'Gestor', descricao: 'Lidera o time; costuma receber permissões de gestão.' },
  { valor: 'colaborador', rotulo: 'Colaborador', descricao: 'Trabalha na operação do time.' },
];

export function rotuloArea(area: Area | null | undefined): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? '—';
}

export function rotuloRole(role: Role | null | undefined): string {
  return ROLES.find((r) => r.valor === role)?.rotulo ?? '—';
}

/* -------------------------------------------------------------------------- */
/* Chaves de permissão — espelham `permissoes_catalogo` no banco               */
/* -------------------------------------------------------------------------- */

export const PERMISSOES = {
  telaInicio: 'tela.inicio',
  telaLegalizacao: 'tela.legalizacao',
  telaProcessos: 'tela.processos',
  telaReferencias: 'tela.referencias',
  telaImportacoes: 'tela.importacoes',
  telaAtribuicoes: 'tela.atribuicoes',
  telaFiscal: 'tela.fiscal',
  telaContabil: 'tela.contabil',
  telaDp: 'tela.dp',
  telaDashboard: 'tela.dashboard',
  telaAdministrativo: 'tela.administrativo',
  telaAuditoria: 'tela.auditoria',
  telaConfiguracoes: 'tela.configuracoes',

  criarEmpresas: 'dados.legalizacao.criar',
  editarEmpresas: 'dados.legalizacao.editar',
  excluirEmpresas: 'dados.legalizacao.excluir',
  exportarLegalizacao: 'dados.legalizacao.exportar',
  editarAdministrativo: 'dados.administrativo.editar',
  exportarAdministrativo: 'dados.administrativo.exportar',

  criarProcessos: 'dados.processos.criar',
  editarProcessos: 'dados.processos.editar',
  excluirProcessos: 'dados.processos.excluir',
  gerenciarOpcoes: 'dados.opcoes.gerenciar',

  gerenciarUsuarios: 'admin.usuarios.gerenciar',
  concederPermissoes: 'admin.usuarios.permissoes',
  gerenciarAtribuicoes: 'admin.atribuicoes.gerenciar',
} as const;

/** Permissões que NUNCA podem ser concedidas a quem não é admin. */
export const PERMISSOES_SOMENTE_ADMIN: string[] = [
  PERMISSOES.telaAdministrativo,
  PERMISSOES.telaAuditoria,
  PERMISSOES.telaConfiguracoes,
  PERMISSOES.editarAdministrativo,
  PERMISSOES.exportarAdministrativo,
];

/* -------------------------------------------------------------------------- */
/* Verificações                                                                */
/* -------------------------------------------------------------------------- */

type Usuario = PerfilComPermissoes | null | undefined;

export function ehAdmin(perfil: Usuario): boolean {
  return Boolean(perfil?.ativo && perfil.role === 'admin');
}

/** Admin tem tudo; os demais, só o que foi concedido. */
export function pode(perfil: Usuario, chave: string): boolean {
  if (!perfil?.ativo) return false;
  if (perfil.role === 'admin') return true;
  // Blindagem extra: nem um dado corrompido libera tela confidencial.
  if (PERMISSOES_SOMENTE_ADMIN.includes(chave)) return false;
  return perfil.permissoes.includes(chave);
}

export function podeLerLegalizacao(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.telaLegalizacao);
}

export function podeEditarLegalizacao(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.editarEmpresas) || pode(perfil, PERMISSOES.criarEmpresas);
}

export function podeCriarEmpresas(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.criarEmpresas);
}

export function podeExcluirLegalizacao(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.excluirEmpresas);
}

export function podeVerDadosAdministrativos(perfil: Usuario): boolean {
  return ehAdmin(perfil);
}

export function podeGerenciarUsuarios(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.gerenciarUsuarios);
}

export function podeConcederPermissoes(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.concederPermissoes);
}

export function podeGerenciarAtribuicoes(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.gerenciarAtribuicoes);
}

export function podeVerAuditoria(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.telaAuditoria);
}

/* --- Controle Geral (processos) ------------------------------------------ */

export function podeLerProcessos(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.telaProcessos);
}

export function podeCriarProcessos(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.criarProcessos);
}

export function podeEditarProcessos(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.editarProcessos);
}

export function podeExcluirProcessos(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.excluirProcessos);
}

/** Promover um valor digitado a opção permanente das listas do time. */
export function podeGerenciarOpcoes(perfil: Usuario): boolean {
  return pode(perfil, PERMISSOES.gerenciarOpcoes);
}

/**
 * Uma coluna é editável quando o usuário pode editar a base E a coluna está
 * na lista pessoal dele. Lista vazia significa "sem restrição de coluna".
 */
export function podeEditarColuna(perfil: Usuario, campo: string, confidencial = false): boolean {
  if (!perfil?.ativo) return false;
  if (confidencial) return ehAdmin(perfil) && pode(perfil, PERMISSOES.editarAdministrativo);
  if (!podeEditarLegalizacao(perfil)) return false;
  if (perfil.colunasEditaveis.length === 0) return true;
  return perfil.colunasEditaveis.includes(campo);
}

/* -------------------------------------------------------------------------- */
/* Rotas                                                                       */
/* -------------------------------------------------------------------------- */

/** Rota → permissão exigida. Fonte única para menu e guardas de página. */
export const ROTAS_PROTEGIDAS: { rota: string; permissao: string }[] = [
  { rota: '/dashboard', permissao: PERMISSOES.telaDashboard },
  { rota: '/legalizacao', permissao: PERMISSOES.telaLegalizacao },
  { rota: '/controle-geral', permissao: PERMISSOES.telaProcessos },
  { rota: '/administrativo', permissao: PERMISSOES.telaAdministrativo },
  { rota: '/referencias', permissao: PERMISSOES.telaReferencias },
  { rota: '/importacoes', permissao: PERMISSOES.telaImportacoes },
  { rota: '/atribuicoes', permissao: PERMISSOES.telaAtribuicoes },
  { rota: '/usuarios', permissao: PERMISSOES.gerenciarUsuarios },
  { rota: '/auditoria', permissao: PERMISSOES.telaAuditoria },
  { rota: '/configuracoes', permissao: PERMISSOES.telaConfiguracoes },
  { rota: '/fiscal', permissao: PERMISSOES.telaFiscal },
  { rota: '/contabil', permissao: PERMISSOES.telaContabil },
  { rota: '/departamento-pessoal', permissao: PERMISSOES.telaDp },
  { rota: '/inicio', permissao: PERMISSOES.telaInicio },
];

/**
 * Sempre acessíveis a quem tem sessão ativa.
 *
 * `/inicio` está aqui porque é o pouso de quem ainda não recebeu permissão
 * nenhuma — sem isso, um usuário recém-criado ficaria preso em `/sem-acesso`.
 * A tela em si não mostra dado de negócio: só o nome da pessoa, as atribuições
 * dela e atalhos para o que ela pode abrir.
 */
const ROTAS_LIVRES = ['/perfil', '/sem-acesso', '/inicio'];

export function podeAcessarRota(perfil: Usuario, rota: string): boolean {
  if (!perfil?.ativo) return false;
  if (ROTAS_LIVRES.some((r) => rota.startsWith(r))) return true;

  const protegida = ROTAS_PROTEGIDAS.find((r) => rota === r.rota || rota.startsWith(`${r.rota}/`));
  if (!protegida) return ehAdmin(perfil);
  return pode(perfil, protegida.permissao);
}

/**
 * Para onde o usuário vai logo após autenticar: a primeira tela que ele
 * realmente pode abrir, na ordem em que fazem sentido para o dia a dia.
 */
export function rotaInicial(perfil: Usuario): string {
  if (!perfil?.ativo) return '/sem-acesso';

  const preferencia = [
    { rota: '/dashboard', permissao: PERMISSOES.telaDashboard },
    { rota: '/legalizacao', permissao: PERMISSOES.telaLegalizacao },
    { rota: '/controle-geral', permissao: PERMISSOES.telaProcessos },
    { rota: '/fiscal', permissao: PERMISSOES.telaFiscal },
    { rota: '/contabil', permissao: PERMISSOES.telaContabil },
    { rota: '/departamento-pessoal', permissao: PERMISSOES.telaDp },
    { rota: '/inicio', permissao: PERMISSOES.telaInicio },
  ];

  // Admin vai direto ao painel; os demais, à primeira tela concedida.
  if (ehAdmin(perfil)) return '/dashboard';

  const encontrada = preferencia.find((p) => pode(perfil, p.permissao));
  return encontrada?.rota ?? '/inicio';
}

/* -------------------------------------------------------------------------- */
/* Periodicidade das atribuições                                               */
/* -------------------------------------------------------------------------- */

export const PERIODICIDADES: { valor: string; rotulo: string }[] = [
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
  { valor: 'bimestral', rotulo: 'A cada 2 meses' },
  { valor: 'trimestral', rotulo: 'A cada 3 meses' },
  { valor: 'semestral', rotulo: 'A cada 6 meses' },
  { valor: 'anual', rotulo: 'Uma vez por ano' },
  { valor: 'avulsa', rotulo: 'Uma vez só (avulsa)' },
];

export function rotuloPeriodicidade(valor: string | null | undefined): string {
  return PERIODICIDADES.find((p) => p.valor === valor)?.rotulo ?? '—';
}
