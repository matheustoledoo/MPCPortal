/**
 * Calendário de Obrigações — a lógica do "Portal Meta Plano" (index.html do
 * Apps Script), traduzida para TypeScript sem mudar o comportamento:
 * feriados com Páscoa móvel, dias úteis, `dataRegra()`, `refLabel()`,
 * `vencLabel()` e `ocorrencias()`.
 *
 * O banco faz a mesma conta em `calendario_ocorrencias()` (migration 0017),
 * usada pelas notificações; os dois lados foram conferidos dia a dia.
 */

import type {
  CategoriaCalendario,
  ConclusaoCalendario,
  Departamento,
  EventoCalendario,
  ReferenciaCompetencia,
  RegraCalendario,
} from '@/types/banco';

export const DEPARTAMENTOS: Departamento[] = ['Matriz', 'Fiscal', 'Departamento Pessoal', 'Contabilidade', 'Legalização', 'Qualidade'];

/** Os links por departamento do app antigo (`?d=fiscal`). */
export const SLUG_DEPARTAMENTO: Record<Departamento, string> = {
  Matriz: 'matriz',
  Fiscal: 'fiscal',
  'Departamento Pessoal': 'pessoal',
  Contabilidade: 'contabilidade',
  Legalização: 'legalizacao',
  Qualidade: 'qualidade',
};

export function departamentoDoSlug(slug: string | null | undefined): Departamento | null {
  const s = String(slug ?? '').toLowerCase();
  return DEPARTAMENTOS.find((d) => SLUG_DEPARTAMENTO[d] === s) ?? null;
}

/** Departamento de cada área do portal (mesma regra de `departamento_de_area`). */
export const DEPARTAMENTO_DA_AREA: Record<string, Departamento> = {
  legalizacao: 'Legalização',
  fiscal: 'Fiscal',
  contabil: 'Contabilidade',
  departamento_pessoal: 'Departamento Pessoal',
  qualidade: 'Qualidade',
  administracao: 'Matriz',
};

export const CATEGORIAS: CategoriaCalendario[] = ['Federal', 'Trabalhista', 'Estadual', 'Municipal', 'Interna', 'Outro', 'Feriado'];

/** As cores do app antigo, uma por esfera. */
export const COR_CATEGORIA: Record<CategoriaCalendario, string> = {
  Federal: '#2f62c9',
  Trabalhista: '#2e8a57',
  Estadual: '#b7791f',
  Municipal: '#7b4fc4',
  Interna: '#5f6a72',
  Outro: '#c2417a',
  Feriado: '#c0392b',
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const REFERENCIAS: Record<ReferenciaCompetencia, string> = {
  '': '—',
  mes: 'Mês anterior',
  mes2: '2 meses antes',
  tri: 'Trimestre anterior',
  ano: 'Ano anterior',
  atual: 'Mês atual',
};

export const REGIMES = ['Todos', 'Simples Nacional', 'MEI', 'Presumido/Real', 'Lucro Presumido', 'Lucro Real'];
export const TIPOS_EVENTO = ['', 'Demanda', 'Reunião Geral', 'Reunião de Integração'] as const;

/** Quem a reunião chama por padrão (como no app antigo). */
export const REUNIAO_PARA: Record<string, Departamento[]> = {
  'Reunião Geral': DEPARTAMENTOS,
  'Reunião de Integração': ['Contabilidade', 'Fiscal', 'Departamento Pessoal'],
};

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const lerYmd = (s: string) => {
  const [a, b, c] = s.slice(0, 10).split('-').map(Number);
  return new Date(a, b - 1, c);
};
export const br = (s: string) => {
  const [a, b, c] = s.slice(0, 10).split('-');
  return `${c}/${b}/${a}`;
};
export const hojeYmd = () => ymd(new Date());

export function pascoa(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const x = h + l - 7 * m + 114;
  return new Date(y, Math.floor(x / 31) - 1, (x % 31) + 1);
}

/** Feriados do ano: nacionais, móveis e os cadastrados como evento "Feriado". */
export function feriados(y: number, eventos: EventoCalendario[]): Map<string, string> {
  const mapa = new Map<string, string>();
  const fixos: [string, string][] = [
    ['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência'], ['10-12', 'N. Sra. Aparecida'], ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal'],
  ];
  fixos.forEach(([md, n]) => mapa.set(`${y}-${md}`, n));
  const p = pascoa(y);
  const somar = (o: number, n: string) => {
    const d = new Date(p);
    d.setDate(d.getDate() + o);
    mapa.set(ymd(d), n);
  };
  somar(-48, 'Carnaval');
  somar(-47, 'Carnaval');
  somar(-2, 'Sexta-feira Santa');
  somar(60, 'Corpus Christi');
  for (const e of eventos) {
    if (e.categoria !== 'Feriado' || !e.data) continue;
    if (e.recorrencia === 'anual') mapa.set(`${y}-${e.data.slice(5, 10)}`, e.titulo);
    else if (e.data.startsWith(`${y}-`)) mapa.set(e.data.slice(0, 10), e.titulo);
  }
  return mapa;
}

/** Cache de feriados por ano, para a grade não recalcular a cada dia. */
export function criarCalendarioFeriados(eventos: EventoCalendario[]) {
  const memo = new Map<number, Map<string, string>>();
  const doAno = (y: number) => {
    let m = memo.get(y);
    if (!m) {
      m = feriados(y, eventos);
      memo.set(y, m);
    }
    return m;
  };
  const ehUtil = (d: Date) => {
    const w = d.getDay();
    return w !== 0 && w !== 6 && !doAno(d.getFullYear()).has(ymd(d));
  };
  return { doAno, ehUtil };
}

type Feriados = ReturnType<typeof criarCalendarioFeriados>;

/** `dataRegra(r, y, m)` do app antigo. Null quando a regra não cai no mês. */
export function dataRegra(r: RegraCalendario, y: number, m: number, f: Feriados): Date | null {
  const ultimo = new Date(y, m, 0).getDate();
  const util = r.sabado_util ? (dt: Date) => dt.getDay() !== 0 && !f.doAno(dt.getFullYear()).has(ymd(dt)) : f.ehUtil;
  if (r.tipo === 'diaUtil') {
    let c = 0;
    for (let d = 1; d <= ultimo; d++) {
      const dt = new Date(y, m - 1, d);
      if (util(dt) && ++c === Number(r.dia)) return dt;
    }
    return null;
  }
  if (r.tipo === 'ultimoDiaUtil') {
    for (let d = ultimo; d >= 1; d--) {
      const dt = new Date(y, m - 1, d);
      if (f.ehUtil(dt)) return dt;
    }
    return null;
  }
  const dt = new Date(y, m - 1, Math.min(Number(r.dia) || 1, ultimo));
  if (r.ajuste === 'prorroga') while (!f.ehUtil(dt)) dt.setDate(dt.getDate() + 1);
  else if (r.ajuste === 'antecipa') while (!f.ehUtil(dt)) dt.setDate(dt.getDate() - 1);
  return dt;
}

export function refLabel(r: Pick<RegraCalendario, 'ref'>, y: number, m: number): string {
  const sh = (k: number) => {
    const d = new Date(y, m - 1 - k, 1);
    return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  switch (r.ref) {
    case 'mes':
      return `Ref. ${sh(1)}`;
    case 'mes2':
      return `Ref. ${sh(2)}`;
    case 'atual':
      return `Ref. ${sh(0)}`;
    case 'tri': {
      const d = new Date(y, m - 2, 1);
      return `Ref. ${Math.floor(d.getMonth() / 3) + 1}º tri/${d.getFullYear()}`;
    }
    case 'ano':
      return `Ano-base ${y - 1}`;
    default:
      return '';
  }
}

export function vencLabel(r: RegraCalendario): string {
  if (r.tipo === 'diaUtil') return `${r.dia}º dia útil`;
  if (r.tipo === 'ultimoDiaUtil') return 'Último dia útil';
  return `Dia ${r.dia}${r.ajuste === 'prorroga' ? ' · prorroga' : r.ajuste === 'antecipa' ? ' · antecipa' : ''}`;
}

/* -------------------------------------------------------------------------- */
/* Ocorrências do mês                                                          */
/* -------------------------------------------------------------------------- */

export interface Ocorrencia {
  chave: string;
  fonte: 'regra' | 'evento';
  id: string;
  titulo: string;
  data: string;
  /** Prazo final (para o início de uma demanda, é a data do fim). */
  prazo: string;
  inicio?: boolean;
  inicioData?: string;
  categoria: CategoriaCalendario;
  tipo: string;
  hora: string;
  visivel: Departamento[];
  ref: string;
  regime: string;
  descricao: string;
  recorrencia: string;
  departamento: Departamento;
  responsavelId: string | null;
  responsavel: string;
  empresa: string;
  empresaId: string | null;
  cnpj: string;
  contato: string;
  modalidade: string;
}

/** `ocorrencias(y, m)` do app antigo — tudo que cai no mês. */
export function ocorrencias(
  y: number,
  m: number,
  regras: RegraCalendario[],
  eventos: EventoCalendario[],
  f: Feriados,
  nomeDe: (id: string | null) => string | null,
): Ocorrencia[] {
  const saida: Ocorrencia[] = [];
  const prefixo = `${y}-${pad(m)}`;

  for (const desloc of [-1, 0, 1]) {
    const d0 = new Date(y, m - 1 + desloc, 1);
    const yy = d0.getFullYear();
    const mm = d0.getMonth() + 1;
    for (const r of regras) {
      if (!r.ativo) continue;
      if (r.meses?.length && !r.meses.includes(mm)) continue;
      const dt = dataRegra(r, yy, mm, f);
      if (!dt) continue;
      const ds = ymd(dt);
      if (!ds.startsWith(prefixo)) continue;
      saida.push({
        chave: `r:${r.id}:${ds}`,
        fonte: 'regra',
        id: r.id,
        titulo: r.nome,
        data: ds,
        prazo: ds,
        categoria: r.categoria,
        tipo: '',
        hora: '',
        visivel: [],
        ref: refLabel(r, yy, mm),
        regime: r.regime,
        descricao: r.descricao,
        recorrencia: '',
        departamento: r.departamento,
        responsavelId: r.responsavel_id,
        responsavel: (nomeDe(r.responsavel_id) ?? r.responsavel_nome ?? '').trim(),
        empresa: '',
        empresaId: null,
        cnpj: '',
        contato: '',
        modalidade: '',
      });
    }
  }

  for (const e of eventos) {
    if (!e.data || e.categoria === 'Feriado') continue;
    const dataEvento = e.data.slice(0, 10);
    const s = lerYmd(dataEvento);
    let ds: string | null = null;
    if (e.recorrencia === 'mensal') {
      const ultimo = new Date(y, m, 0).getDate();
      const d = new Date(y, m - 1, Math.min(s.getDate(), ultimo));
      if (ymd(d) >= dataEvento) ds = ymd(d);
    } else if (e.recorrencia === 'anual') {
      if (s.getMonth() + 1 === m && y >= s.getFullYear()) {
        const ultimo = new Date(y, m, 0).getDate();
        ds = ymd(new Date(y, m - 1, Math.min(s.getDate(), ultimo)));
      }
    } else if (dataEvento.startsWith(prefixo)) ds = dataEvento;

    const demanda = e.tipo === 'Demanda';
    const responsavel = (nomeDe(e.responsavel_id) ?? e.responsavel_nome ?? '').trim();
    const base = {
      fonte: 'evento' as const,
      id: e.id,
      categoria: e.categoria,
      tipo: e.tipo || '',
      visivel: e.visivel_para ?? [],
      ref: '',
      regime: '',
      descricao: e.notas,
      departamento: e.departamento,
      responsavelId: e.responsavel_id,
      responsavel,
      empresa: e.empresa ?? '',
      empresaId: e.empresa_id,
      cnpj: e.cnpj ?? '',
      contato: e.contato ?? '',
      modalidade: e.modalidade ?? '',
    };
    const inicio = e.data_inicio?.slice(0, 10);
    if (demanda && inicio && inicio < dataEvento && inicio.startsWith(prefixo)) {
      saida.push({
        ...base,
        chave: `e:${e.id}:${dataEvento}`,
        inicio: true,
        prazo: dataEvento,
        inicioData: inicio,
        titulo: `▶ Início: ${e.titulo}`,
        data: inicio,
        hora: '',
        recorrencia: 'nenhuma',
      });
    }
    if (ds) {
      const hora = e.hora?.slice(0, 5) ?? '';
      saida.push({
        ...base,
        chave: `e:${e.id}:${ds}`,
        prazo: ds,
        inicioData: demanda ? (inicio ?? '') : '',
        titulo: `${demanda ? '⏳ ' : ''}${hora ? `${hora} · ` : ''}${e.titulo}`,
        data: ds,
        hora,
        recorrencia: e.recorrencia,
      });
    }
  }

  return saida.sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo));
}

/** Concluída? O app antigo guardava por mês; aqui é uma linha por chave. */
export function mapaConclusoes(lista: ConclusaoCalendario[]): Map<string, ConclusaoCalendario> {
  return new Map(lista.map((c) => [c.chave, c]));
}

export function mesmaPessoa(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/** Atrasado: prazo antes de hoje e não concluído. */
export function atrasada(o: Ocorrencia, feitas: Map<string, ConclusaoCalendario>, hoje = hojeYmd()): boolean {
  return (o.prazo || o.data) < hoje && !feitas.has(o.chave);
}
