/**
 * Centro único de decisões de permissão do frontend.
 *
 * IMPORTANTE: isto é conveniência de interface, não segurança. A segurança
 * real está nas políticas de RLS (`supabase/migrations/0006_rls_politicas.sql`).
 * Toda regra aqui tem uma política equivalente no banco.
 */

import type { Area, Perfil, Role } from '@/types/banco';

export const AREAS: { valor: Area; rotulo: string; rota: string }[] = [
  { valor: 'legalizacao', rotulo: 'Legalização', rota: '/legalizacao' },
  { valor: 'fiscal', rotulo: 'Fiscal', rota: '/fiscal' },
  { valor: 'contabil', rotulo: 'Contábil', rota: '/contabil' },
  { valor: 'departamento_pessoal', rotulo: 'Departamento Pessoal', rota: '/departamento-pessoal' },
  { valor: 'administracao', rotulo: 'Administração', rota: '/dashboard' },
];

export const ROLES: { valor: Role; rotulo: string; descricao: string }[] = [
  { valor: 'admin', rotulo: 'Administrador', descricao: 'Acesso total, incluindo dados financeiros e auditoria.' },
  { valor: 'gestor', rotulo: 'Gestor', descricao: 'Gerencia a própria área e pode excluir registros.' },
  { valor: 'colaborador', rotulo: 'Colaborador', descricao: 'Consulta e edita registros da própria área.' },
];

export function rotuloArea(area: Area | null | undefined): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? '—';
}

export function rotuloRole(role: Role | null | undefined): string {
  return ROLES.find((r) => r.valor === role)?.rotulo ?? '—';
}

export function ehAdmin(perfil: Perfil | null | undefined): boolean {
  return Boolean(perfil?.ativo && perfil.role === 'admin');
}

export function podeLerLegalizacao(perfil: Perfil | null | undefined): boolean {
  if (!perfil?.ativo) return false;
  return perfil.role === 'admin' || perfil.area === 'legalizacao' || perfil.area === 'administracao';
}

export function podeEditarLegalizacao(perfil: Perfil | null | undefined): boolean {
  if (!perfil?.ativo) return false;
  return perfil.role === 'admin' || perfil.area === 'legalizacao';
}

export function podeExcluirLegalizacao(perfil: Perfil | null | undefined): boolean {
  if (!perfil?.ativo) return false;
  return perfil.role === 'admin' || (perfil.area === 'legalizacao' && perfil.role === 'gestor');
}

/** Somente admin vê honorários, vencimentos e condições contratuais. */
export function podeVerDadosAdministrativos(perfil: Perfil | null | undefined): boolean {
  return ehAdmin(perfil);
}

export function podeGerenciarUsuarios(perfil: Perfil | null | undefined): boolean {
  return ehAdmin(perfil);
}

export function podeVerAuditoria(perfil: Perfil | null | undefined): boolean {
  return ehAdmin(perfil);
}

/** Para onde o usuário vai logo após autenticar. */
export function rotaInicial(perfil: Perfil | null | undefined): string {
  if (!perfil || !perfil.ativo) return '/sem-acesso';
  if (perfil.role === 'admin') return '/dashboard';

  switch (perfil.area) {
    case 'legalizacao':
      return '/legalizacao';
    case 'fiscal':
      return '/fiscal';
    case 'contabil':
      return '/contabil';
    case 'departamento_pessoal':
      return '/departamento-pessoal';
    case 'administracao':
      return '/dashboard';
    default:
      return '/sem-acesso';
  }
}

/** Rotas que cada perfil pode abrir. Usado pelo layout do portal e pelo middleware. */
export function podeAcessarRota(perfil: Perfil | null | undefined, rota: string): boolean {
  if (!perfil?.ativo) return false;

  const livres = ['/inicio', '/perfil', '/sem-acesso'];
  if (livres.some((r) => rota.startsWith(r))) return true;

  if (perfil.role === 'admin') return true;

  const somenteAdmin = ['/administrativo', '/usuarios', '/auditoria', '/configuracoes', '/dashboard'];
  if (somenteAdmin.some((r) => rota.startsWith(r))) return false;

  if (rota.startsWith('/legalizacao') || rota.startsWith('/importacoes') || rota.startsWith('/referencias')) {
    return podeLerLegalizacao(perfil);
  }
  if (rota.startsWith('/fiscal')) return perfil.area === 'fiscal';
  if (rota.startsWith('/contabil')) return perfil.area === 'contabil';
  if (rota.startsWith('/departamento-pessoal')) return perfil.area === 'departamento_pessoal';

  return false;
}
