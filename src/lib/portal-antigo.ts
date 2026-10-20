/**
 * Importação do "Portal Meta Plano" (Google Apps Script).
 *
 * O app antigo guardava tudo na aba `dados` da planilha "Calendário Contábil
 * - Dados", uma linha por documento: coleção | id | dados (JSON) | atualizado
 * em. As coleções são `usuarios`, `regras`, `eventos`, `status` (um documento
 * por mês com os itens concluídos) e `integracoes`.
 *
 * Aqui só há leitura e conversão — nada é inventado: o que não vier no
 * arquivo não é criado, e valores fora do padrão caem no valor neutro do
 * campo (e são contados como ajustes no resumo).
 */

import { CATEGORIAS, DEPARTAMENTOS, mesmaPessoa } from '@/lib/calendario';
import { INTEG_DEPTS } from '@/lib/integracao';
import type { AbaLida } from '@/lib/planilha/importacao';
import { normalizarNome } from '@/lib/planilha/formulas';
import type { Area, CategoriaCalendario, Departamento } from '@/types/banco';

type Doc = Record<string, unknown>;
export type Colecoes = Record<string, Record<string, Doc>>;

export interface LeituraPortalAntigo {
  colecoes: Colecoes;
  /** Linhas cujo JSON não pôde ser lido. */
  invalidas: number;
  aba: string;
}

const texto = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Sem acento, minúsculo: para comparar nomes de aba, cabeçalho e pessoa. */
const chave = (v: unknown) => normalizarNome(texto(v)).toLowerCase();
const ehData = (v: unknown) => /^\d{4}-\d{2}-\d{2}/.test(texto(v));

/** Acha a aba `dados` (ou a primeira com cara de exportação) e lê as linhas. */
export function lerExportacao(abas: AbaLida[]): LeituraPortalAntigo | null {
  const candidatas = [...abas].sort((a, b) => Number(chave(b.nome) === 'dados') - Number(chave(a.nome) === 'dados'));
  for (const aba of candidatas) {
    const colecoes: Colecoes = {};
    let invalidas = 0;
    let lidas = 0;
    for (const linha of aba.linhas) {
      const col = texto(linha[0]);
      const id = texto(linha[1]);
      const json = texto(linha[2]);
      if (!col || !id || chave(col).startsWith('colecao')) continue;
      if (!json.startsWith('{')) {
        invalidas++;
        continue;
      }
      try {
        (colecoes[col] ??= {})[id] = JSON.parse(json) as Doc;
        lidas++;
      } catch {
        invalidas++;
      }
    }
    if (lidas > 0) return { colecoes, invalidas, aba: aba.nome };
  }
  return null;
}

/** Aceita também um JSON exportado à mão ({ regras: {...}, eventos: {...} }). */
export function lerJson(conteudo: string): LeituraPortalAntigo | null {
  try {
    const bruto = JSON.parse(conteudo) as Colecoes;
    if (!bruto || typeof bruto !== 'object') return null;
    const colecoes: Colecoes = {};
    for (const c of ['usuarios', 'regras', 'eventos', 'status', 'integracoes']) if (bruto[c] && typeof bruto[c] === 'object') colecoes[c] = bruto[c];
    return Object.keys(colecoes).length ? { colecoes, invalidas: 0, aba: 'JSON' } : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Pessoas                                                                     */
/* -------------------------------------------------------------------------- */

export const AREA_DO_DEPARTAMENTO: Record<string, Area> = {
  Legalização: 'legalizacao',
  Fiscal: 'fiscal',
  Contabilidade: 'contabil',
  'Departamento Pessoal': 'departamento_pessoal',
  Qualidade: 'qualidade',
  Matriz: 'administracao',
};

export const PAPEL_ANTIGO: Record<string, string> = {
  equipe: 'Colaborador',
  gerente: 'Responsável do departamento',
  matriz: 'Matriz',
  total: 'Acesso total',
};

export interface UsuarioAntigo {
  idAntigo: string;
  nome: string;
  departamento: string;
  papel: string;
  geral: boolean;
  area: Area;
}

export function usuariosAntigos(c: Colecoes): UsuarioAntigo[] {
  return Object.entries(c.usuarios ?? {})
    .map(([id, u]) => {
      const departamento = texto(u.departamento) || 'Matriz';
      return {
        idAntigo: id,
        nome: texto(u.nome),
        departamento,
        papel: texto(u.papel) || 'equipe',
        geral: u.geral === true,
        area: AREA_DO_DEPARTAMENTO[departamento] ?? 'administracao',
      };
    })
    .filter((u) => u.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Sugestão de e-mail no domínio da empresa (o admin confere antes de criar). */
export function sugerirEmail(nome: string, usados: Set<string>, dominio = 'metaplanocontabil.com.br'): string {
  const base =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'colaborador';
  let email = `${base}@${dominio}`;
  for (let n = 2; usados.has(email); n++) email = `${base}${n}@${dominio}`;
  usados.add(email);
  return email;
}

export interface PessoaConhecida {
  id: string;
  nome: string;
}

/** O app antigo guardava só o nome: casa com o perfil pelo nome completo ou pelo primeiro nome, quando único. */
export function criarResolvedorDeNomes(pessoas: PessoaConhecida[]) {
  return (nome: unknown): string | null => {
    const n = texto(nome);
    if (!n) return null;
    const exata = pessoas.find((p) => mesmaPessoa(p.nome, n));
    if (exata) return exata.id;
    if (n.includes(' ')) return null;
    const primeiro = chave(n);
    const porPrimeiro = pessoas.filter((p) => chave(p.nome.split(/\s+/)[0]) === primeiro);
    return porPrimeiro.length === 1 ? porPrimeiro[0].id : null;
  };
}

/* -------------------------------------------------------------------------- */
/* Calendário                                                                  */
/* -------------------------------------------------------------------------- */

const umDe = <T extends string>(v: unknown, validos: readonly T[], padrao: T): T => (validos.includes(texto(v) as T) ? (texto(v) as T) : padrao);
const departamento = (v: unknown): Departamento => umDe(v, DEPARTAMENTOS, 'Matriz');
const categoria = (v: unknown, padrao: CategoriaCalendario): CategoriaCalendario => umDe(v, CATEGORIAS, padrao);

export function regrasAntigas(c: Colecoes, resolver: (nome: unknown) => string | null) {
  return Object.entries(c.regras ?? {})
    .filter(([, r]) => texto(r.nome))
    .map(([id, r]) => ({
      id,
      nome: texto(r.nome).slice(0, 140),
      departamento: departamento(r.departamento),
      categoria: categoria(r.categoria, 'Federal'),
      regime: texto(r.regime) || 'Todos',
      tipo: umDe(r.tipo, ['dia', 'diaUtil', 'ultimoDiaUtil'] as const, 'dia'),
      dia: Math.min(31, Math.max(1, Number(r.dia) || 1)),
      ajuste: umDe(r.ajuste, ['antecipa', 'prorroga', 'nenhum'] as const, 'antecipa'),
      meses: (Array.isArray(r.meses) ? r.meses : []).map(Number).filter((m) => m >= 1 && m <= 12),
      ref: umDe(r.ref, ['', 'mes', 'mes2', 'tri', 'ano', 'atual'] as const, ''),
      descricao: texto(r.descricao),
      ativo: r.ativo !== false,
      sabado_util: r.sabadoUtil === true,
      responsavel_id: resolver(r.responsavel),
      responsavel_nome: texto(r.responsavel) || null,
    }));
}

export function eventosAntigos(c: Colecoes, resolver: (nome: unknown) => string | null) {
  return Object.entries(c.eventos ?? {})
    .filter(([, e]) => ehData(e.data))
    .map(([id, e]) => {
      const tipo = umDe(e.tipo, ['', 'Demanda', 'Reunião Geral', 'Reunião de Integração'] as const, '');
      const data = texto(e.data).slice(0, 10);
      const inicio = ehData(e.dataInicio) ? texto(e.dataInicio).slice(0, 10) : null;
      const dept = departamento(e.departamento);
      const hora = /^\d{1,2}:\d{2}/.test(texto(e.hora)) ? texto(e.hora).slice(0, 5) : null;
      const modalidade = umDe(e.modalidade, ['', 'Presencial', 'On-line', 'Telefone'] as const, '');
      const titulo = (texto(e.titulo) || tipo || 'Compromisso').slice(0, 140);
      return {
        id,
        titulo,
        data,
        data_inicio: tipo === 'Demanda' && inicio && inicio <= data ? inicio : null,
        hora,
        tipo,
        categoria: categoria(e.categoria, 'Outro'),
        departamento: dept,
        visivel_para: (Array.isArray(e.visivelPara) ? e.visivelPara : []).map(texto).filter((d): d is Departamento => DEPARTAMENTOS.includes(d as Departamento) && d !== dept),
        responsavel_id: resolver(e.responsavel),
        responsavel_nome: texto(e.responsavel) || null,
        designado_por: resolver(e.designadoPor),
        designado_por_nome: texto(e.designadoPor) || null,
        recorrencia: tipo === 'Demanda' ? 'nenhuma' : umDe(e.recorrencia, ['nenhuma', 'mensal', 'anual'] as const, 'nenhuma'),
        empresa: texto(e.empresa) || null,
        cnpj: texto(e.cnpj) || null,
        contato: texto(e.contato) || null,
        modalidade: modalidade || null,
        notas: texto(e.notas),
        ...(ehData(e.criadoEm) ? { created_at: texto(e.criadoEm) } : {}),
      };
    });
}

/** `status/<aaaa-mm>` → uma linha por item concluído. */
export function conclusoesAntigas(c: Colecoes, resolver: (nome: unknown) => string | null) {
  const saida: { chave: string; mes: string; concluido_em: string; concluido_por: string | null; concluido_por_nome: string | null }[] = [];
  for (const [mes, doc] of Object.entries(c.status ?? {})) {
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const itens = (doc.itens ?? {}) as Record<string, { feito?: boolean; em?: string; por?: string }>;
    for (const [chave, s] of Object.entries(itens)) {
      if (!s?.feito || !/^[re]:.+:\d{4}-\d{2}-\d{2}$/.test(chave)) continue;
      saida.push({
        chave,
        mes: chave.slice(-10, -3),
        concluido_em: ehData(s.em) ? texto(s.em) : `${chave.slice(-10)}T12:00:00-03:00`,
        concluido_por: resolver(s.por),
        concluido_por_nome: texto(s.por) || null,
      });
    }
  }
  return saida;
}

/* -------------------------------------------------------------------------- */
/* Integrações                                                                 */
/* -------------------------------------------------------------------------- */

export function integracoesAntigas(c: Colecoes, eventosExistentes: Set<string>, resolver: (nome: unknown) => string | null) {
  const integracoes: Record<string, unknown>[] = [];
  const departamentos: Record<string, unknown>[] = [];
  for (const [id, it] of Object.entries(c.integracoes ?? {})) {
    const fichaBruta = (it.ficha ?? {}) as Record<string, unknown>;
    const ficha = Object.fromEntries(Object.entries(fichaBruta).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k, String(v)]));
    const eventoId = texto(it.eventoId);
    integracoes.push({
      id,
      ficha,
      evento_id: eventoId && eventosExistentes.has(eventoId) ? eventoId : null,
      criado_por: resolver(it.criadoPor),
      criado_por_nome: texto(it.criadoPor) || null,
      ...(ehData(it.criadoEm) ? { created_at: texto(it.criadoEm) } : {}),
    });
    const deptos = (it.deptos ?? {}) as Record<string, Record<string, unknown>>;
    for (const [d, x] of Object.entries(deptos)) {
      if (!INTEG_DEPTS.includes(d as (typeof INTEG_DEPTS)[number]) || !x || typeof x !== 'object') continue;
      const finalizado = x.finalizado === true;
      departamentos.push({
        integracao_id: id,
        departamento: d,
        dados: {
          ...(x.itens ? { itens: x.itens } : {}),
          ...(x.ficha ? { ficha: x.ficha } : {}),
          ...(x.prazos ? { prazos: x.prazos } : {}),
          ...(x.docs ? { docs: x.docs } : {}),
          ...(x.combinados ? { combinados: texto(x.combinados) } : {}),
          ...(x.retorno ? { retorno: texto(x.retorno) } : {}),
        },
        atendido_por: texto(x.atendidoPor) || null,
        finalizado,
        finalizado_em: finalizado && ehData(x.finalizadoEm) ? texto(x.finalizadoEm) : null,
        finalizado_por: finalizado ? resolver(x.finalizadoPor) : null,
        finalizado_por_nome: finalizado ? texto(x.finalizadoPor) || null : null,
      });
    }
  }
  return { integracoes, departamentos };
}
