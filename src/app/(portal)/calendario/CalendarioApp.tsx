'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FileDown,
  Handshake,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Users,
} from 'lucide-react';

import { EditorEvento, EditorRegra } from '@/app/(portal)/calendario/Editores';
import { DialogoRelatorio } from '@/app/(portal)/calendario/DialogoRelatorio';
import { Botao, Cartao, Modal, ModalConfirmacao, Selo, cn, useAvisos } from '@/components/ui';
import {
  CATEGORIAS,
  COR_CATEGORIA,
  DEPARTAMENTOS,
  DIAS_SEMANA,
  MESES,
  MODULOS_AGENDA,
  MODULOS_CONCLUIVEIS,
  REFERENCIAS,
  SLUG_DEPARTAMENTO,
  atrasada,
  br,
  criarCalendarioFeriados,
  hojeYmd,
  lerYmd,
  mesmaPessoa,
  ocorrencias,
  ocorrenciasDoIntervalo,
  ordenarPorHora,
  rotuloModulo,
  vencLabel,
  ymd,
  type Ocorrencia,
} from '@/lib/calendario';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CategoriaCalendario, ConclusaoCalendario, Departamento, EventoCalendario, ModuloAgenda, RegraCalendario } from '@/types/banco';

type Aba = 'painel' | 'cal' | 'semana' | 'dia' | 'lista' | 'regras';
type Situacao = '' | 'pendentes' | 'atrasadas' | 'concluidas';

export interface PessoaCalendario {
  id: string;
  nome: string;
  departamento: Departamento;
}

export interface PermissoesCalendario {
  todos: boolean;
  gerencia: boolean;
  meuDepartamento: Departamento;
  podeIntegracao: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * O Calendário de Obrigações do Portal Meta Plano, dentro do PortalMPC:
 * obrigações fixas com vencimento calculado (dias úteis, feriados, Páscoa),
 * compromissos, demandas e reuniões — por departamento, com responsável,
 * concluir com um clique e relatório em PDF ou Excel.
 */
export function CalendarioApp({
  meuId,
  meuNome,
  permissoes,
  regrasIniciais,
  eventosIniciais,
  pessoas,
  inicial,
}: {
  meuId: string;
  meuNome: string;
  permissoes: PermissoesCalendario;
  regrasIniciais: RegraCalendario[];
  eventosIniciais: EventoCalendario[];
  pessoas: PessoaCalendario[];
  inicial: { data?: string; item?: string; dept?: Departamento | null; aba?: Aba };
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const { avisar } = useAvisos();
  const hoje = hojeYmd();

  const dataInicial = inicial.data ? lerYmd(inicial.data) : new Date();
  const [view, setView] = useState({ y: dataInicial.getFullYear(), m: dataInicial.getMonth() + 1 });
  const [aba, setAba] = useState<Aba>(inicial.aba === 'painel' && !(permissoes.todos || permissoes.gerencia) ? 'cal' : (inicial.aba ?? 'cal'));
  const [regras, setRegras] = useState(regrasIniciais);
  const [eventos, setEventos] = useState(eventosIniciais);
  const [conclusoes, setFeitas] = useState<Map<string, ConclusaoCalendario>>(new Map());
  /** Dia em foco nas visões de semana e de dia. */
  const [foco, setFoco] = useState(inicial.data ?? hoje);
  const [modulos, setModulos] = useState<Set<ModuloAgenda>>(() => new Set(MODULOS_AGENDA.map((m) => m.valor)));
  const [situacao, setSituacao] = useState<Situacao>('');
  const [origem, setOrigem] = useState<'' | 'econet' | 'equipe'>('');
  const [cancelados, setCancelados] = useState(false);
  const [sincronizar, setSincronizar] = useState<'incluir' | 'redefinir' | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const deptosPermitidos = useMemo<Departamento[]>(
    () => (permissoes.todos ? DEPARTAMENTOS : [permissoes.meuDepartamento]),
    [permissoes.todos, permissoes.meuDepartamento],
  );
  const [dept, setDept] = useState<Departamento | null>(permissoes.todos ? (inicial.dept ?? null) : permissoes.meuDepartamento);
  const [pessoa, setPessoa] = useState('');
  const [filtro, setFiltro] = useState<Set<CategoriaCalendario>>(new Set(CATEGORIAS));
  const [detalhe, setDetalhe] = useState<string | null>(inicial.item ?? null);
  const [editandoEvento, setEditandoEvento] = useState<{ evento: EventoCalendario | null; data?: string } | null>(null);
  const [editandoRegra, setEditandoRegra] = useState<RegraCalendario | null | undefined>(undefined);
  const [relatorio, setRelatorio] = useState(false);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const podeEditar = useCallback(
    (d: Departamento) => permissoes.todos || (permissoes.gerencia && d === permissoes.meuDepartamento),
    [permissoes],
  );
  const podeCriar = permissoes.todos || permissoes.gerencia;

  // Filtro de esferas lembrado no navegador, como no app antigo.
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem('cc-filtro') ?? 'null');
      if (Array.isArray(f)) setFiltro(new Set(f));
    } catch {
      /* sem armazenamento */
    }
  }, []);
  function alternarCategoria(c: CategoriaCalendario) {
    setFiltro((atual) => {
      const novo = new Set(atual);
      if (novo.has(c)) novo.delete(c);
      else novo.add(c);
      try {
        localStorage.setItem('cc-filtro', JSON.stringify([...novo]));
      } catch {
        /* sem armazenamento */
      }
      return novo;
    });
  }

  const nomes = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const nomeDe = useCallback((id: string | null) => (id ? (nomes.get(id) ?? null) : null), [nomes]);
  const feriados = useMemo(() => criarCalendarioFeriados(eventos), [eventos]);

  const carregarDados = useCallback(async () => {
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('calendario_regras').select('*').order('nome'),
      supabase.from('calendario_eventos').select('*').order('data'),
    ]);
    if (r) setRegras(r as RegraCalendario[]);
    if (e) setEventos(e as EventoCalendario[]);
  }, [supabase]);

  /** Conclusões do mês em vista e do seguinte (o início de demanda usa a data do fim). */
  const carregarConclusoes = useCallback(async () => {
    // Mês anterior e seguinte entram junto: a semana em vista pode atravessar a virada do mês.
    const meses = [-2, -1, 0].map((d) => {
      const x = new Date(view.y, view.m + d, 1);
      return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
    });
    const { data } = await supabase.from('calendario_conclusoes').select('*').in('mes', meses);
    setFeitas(new Map(((data ?? []) as ConclusaoCalendario[]).map((c) => [c.chave, c])));
  }, [supabase, view]);

  useEffect(() => {
    void carregarConclusoes();
  }, [carregarConclusoes]);

  // Tempo real: o que outra pessoa conclui aparece aqui também.
  useEffect(() => {
    const canal = supabase
      .channel('calendario')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_conclusoes' }, () => void carregarConclusoes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_eventos' }, () => void carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_regras' }, () => void carregarDados())
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, carregarConclusoes, carregarDados]);

  const todas = useMemo(() => ocorrencias(view.y, view.m, regras, eventos, feriados, nomeDe, cancelados), [view, regras, eventos, feriados, nomeDe, cancelados]);

  /**
   * Itens de outros módulos chegam com a situação mantida na origem (tarefa
   * concluída, ação de prospecção feita): contam como concluídos aqui também,
   * mesmo que a linha de conclusão do mês ainda não tenha sido carregada.
   */
  const feitas = useMemo(() => {
    const mapa = new Map(conclusoes);
    for (const e of eventos) {
      if (e.status !== 'concluido' || !e.status_na_origem || !e.data) continue;
      const chave = `e:${e.id}:${e.data.slice(0, 10)}`;
      if (!mapa.has(chave)) mapa.set(chave, { chave, mes: e.data.slice(0, 7), concluido_em: e.updated_at ?? new Date().toISOString(), concluido_por: null, concluido_por_nome: null });
    }
    return mapa;
  }, [conclusoes, eventos]);

  const passa = useCallback(
    (o: Ocorrencia) => {
      if (!filtro.has(o.categoria) || !modulos.has(o.modulo)) return false;
      if (dept && o.departamento !== dept && !o.visivel.includes(dept)) return false;
      if (pessoa) {
        if (pessoa === '__sem__' ? Boolean(o.responsavel) || o.participantes.length > 0 : !(o.responsavelId === pessoa || o.participantes.includes(pessoa) || mesmaPessoa(o.responsavel, nomes.get(pessoa) ?? pessoa))) return false;
      }
      if (origem && (o.fonte !== 'regra' || (origem === 'econet') !== o.econet)) return false;
      if (situacao === 'concluidas' && !feitas.has(o.chave)) return false;
      if (situacao === 'pendentes' && (feitas.has(o.chave) || o.status === 'cancelado')) return false;
      if (situacao === 'atrasadas' && !atrasada(o, feitas, hoje)) return false;
      return true;
    },
    [filtro, modulos, dept, pessoa, nomes, origem, situacao, feitas, hoje],
  );

  const visiveis = useMemo(() => todas.filter(passa), [todas, passa]);

  /** Semana (domingo a sábado) do dia em foco. */
  const semana = useMemo(() => {
    const d = lerYmd(foco);
    const inicio = new Date(d);
    inicio.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(inicio);
      x.setDate(inicio.getDate() + i);
      return ymd(x);
    });
  }, [foco]);
  const daSemana = useMemo(
    () => (aba === 'semana' || aba === 'dia' ? ocorrenciasDoIntervalo(semana[0], semana[6], regras, eventos, feriados, nomeDe, cancelados).filter(passa) : []),
    [aba, semana, regras, eventos, feriados, nomeDe, cancelados, passa],
  );

  const unicos = visiveis.filter((o) => !o.inicio);
  const feitos = unicos.filter((o) => feitas.has(o.chave)).length;
  const atrasados = unicos.filter((o) => atrasada(o, feitas, hoje)).length;
  const proximo = unicos.find((o) => o.data >= hoje && !feitas.has(o.chave));

  async function alternarFeito(chave: string) {
    const o = todas.find((x) => x.chave === chave) ?? daSemana.find((x) => x.chave === chave);
    // Item de outro módulo: a conclusão acontece na origem e volta para cá pelo banco.
    if (o?.statusNaOrigem) {
      if (!MODULOS_CONCLUIVEIS.includes(o.modulo)) {
        avisar('info', `A situação deste item é atualizada em ${rotuloModulo(o.modulo)}. Abra o item por lá.`);
        return;
      }
      const { error } = await supabase.rpc('agenda_concluir', { p_evento: o.id, p_concluir: !feitas.has(chave) });
      if (error) avisar('erro', error.message);
      else {
        avisar('sucesso', feitas.has(chave) ? `Reaberto em ${rotuloModulo(o.modulo)}.` : `Concluído — ${rotuloModulo(o.modulo)} já foi atualizado.`);
        await Promise.all([carregarDados(), carregarConclusoes()]);
      }
      return;
    }
    const jaFeito = feitas.get(chave);
    const novo = new Map(conclusoes);
    const data = chave.split(':').pop() ?? '';
    if (jaFeito) novo.delete(chave);
    else novo.set(chave, { chave, mes: data.slice(0, 7), concluido_em: new Date().toISOString(), concluido_por: meuId, concluido_por_nome: meuNome });
    setFeitas(novo);
    const { error } = jaFeito
      ? await supabase.from('calendario_conclusoes').delete().eq('chave', chave)
      : await supabase.from('calendario_conclusoes').insert({ chave, mes: data.slice(0, 7), concluido_por: meuId, concluido_por_nome: meuNome });
    if (error && error.code !== '23505') {
      setFeitas(conclusoes);
      avisar('erro', error.message);
    }
  }

  async function sincronizarEconet(redefinir: boolean) {
    setSincronizando(true);
    const { data, error } = await supabase.rpc('calendario_sincronizar_econet', { p_redefinir: redefinir });
    setSincronizando(false);
    setSincronizar(null);
    if (error) return avisar('erro', error.message);
    const r = data as { incluidas: number; redefinidas: number; catalogo: number };
    avisar(
      'sucesso',
      r.incluidas || r.redefinidas
        ? `Calendário e-Conet sincronizado: ${r.incluidas} obrigação(ões) incluída(s)${r.redefinidas ? ` e ${r.redefinidas} redefinida(s)` : ''}. Nada foi duplicado.`
        : `Tudo em dia: as ${r.catalogo} obrigações do calendário e-Conet já estão cadastradas.`,
    );
    void carregarDados();
  }

  async function alternarRegra(r: RegraCalendario) {
    setRegras((lista) => lista.map((x) => (x.id === r.id ? { ...x, ativo: !x.ativo } : x)));
    const { error } = await supabase.from('calendario_regras').update({ ativo: !r.ativo }).eq('id', r.id);
    if (error) {
      setRegras((lista) => lista.map((x) => (x.id === r.id ? r : x)));
      avisar('erro', error.message);
    }
  }

  function irPara(d: Date) {
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
    setFoco(ymd(d));
  }

  /** Anterior/próximo andam um mês, uma semana ou um dia, conforme a visão. */
  function navegar(sentido: -1 | 1) {
    if (aba === 'semana' || aba === 'dia') {
      const d = lerYmd(foco);
      d.setDate(d.getDate() + sentido * (aba === 'semana' ? 7 : 1));
      irPara(d);
    } else irPara(new Date(view.y, view.m - 1 + sentido, 1));
  }

  const tituloPeriodo =
    aba === 'dia'
      ? `${DIAS_SEMANA[lerYmd(foco).getDay()]}, ${br(foco)}`
      : aba === 'semana'
        ? `${br(semana[0]).slice(0, 5)} a ${br(semana[6])}`
        : `${MESES[view.m - 1]} ${view.y}`;
  const passo = aba === 'dia' ? 'Dia' : aba === 'semana' ? 'Semana' : 'Mês';

  const ocorrenciaDetalhe = detalhe ? (todas.find((o) => o.chave === detalhe) ?? daSemana.find((o) => o.chave === detalhe) ?? null) : null;

  // Chegou com ?item= de outro mês (notificação): abre quando o mês certo carrega.
  useEffect(() => {
    if (detalhe && !ocorrenciaDetalhe) {
      const data = detalhe.split(':').pop();
      if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
        const d = lerYmd(data);
        if (d.getFullYear() !== view.y || d.getMonth() + 1 !== view.m) irPara(d);
      }
    }
  }, [detalhe, ocorrenciaDetalhe, view]);

  const rotuloContexto = dept ? `${dept}` : 'Todos os departamentos';

  return (
    <div className="space-y-4">
      {/* Cabeçalho do mês */}
      <Cartao className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Botao variante="secundario" tamanho="icone" onClick={() => navegar(-1)} aria-label={`${passo} anterior`}>
              <ChevronLeft className="h-4 w-4" />
            </Botao>
            <h2 className="min-w-44 text-center text-lg font-semibold text-texto">{tituloPeriodo}</h2>
            <Botao variante="secundario" tamanho="icone" onClick={() => navegar(1)} aria-label={`Próximo ${passo.toLowerCase()}`}>
              <ChevronRight className="h-4 w-4" />
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => irPara(new Date())}>
              Hoje
            </Botao>
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg bg-superficie p-1">
            {(
              [
                (permissoes.todos || permissoes.gerencia) && { v: 'painel' as Aba, r: 'Visão geral', i: Users },
                { v: 'cal' as Aba, r: 'Mês', i: LayoutGrid },
                { v: 'semana' as Aba, r: 'Semana', i: CalendarRange },
                { v: 'dia' as Aba, r: 'Dia', i: CalendarDays },
                { v: 'lista' as Aba, r: 'Lista', i: List },
                { v: 'regras' as Aba, r: 'Obrigações fixas', i: Repeat },
              ].filter(Boolean) as { v: Aba; r: string; i: typeof List }[]
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => setAba(t.v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  aba === t.v ? 'bg-white text-marca-800 shadow-sm' : 'text-texto-suave hover:text-texto',
                )}
              >
                <t.i className="h-3.5 w-3.5" /> {t.r}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {permissoes.podeIntegracao && (
              <Link href="/integracao-clientes">
                <Botao variante="secundario">
                  <Handshake className="h-4 w-4" /> Integração
                </Botao>
              </Link>
            )}
            <Botao variante="secundario" onClick={() => setRelatorio(true)}>
              <FileDown className="h-4 w-4" /> Relatório
            </Botao>
            {podeCriar && (
              <Botao onClick={() => setEditandoEvento({ evento: null })}>
                <Plus className="h-4 w-4" /> Compromisso / demanda
              </Botao>
            )}
          </div>
        </div>

        {/* Departamento, pessoa e esferas */}
        <div className="mt-4 space-y-2.5">
          {permissoes.todos && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Departamento</span>
              {[null, ...DEPARTAMENTOS].map((d) => (
                <button
                  key={d ?? 'todos'}
                  onClick={() => setDept(d)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                    dept === d ? 'bg-marca-600 font-semibold text-white ring-marca-600' : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
                  )}
                >
                  {d ?? 'Todos'}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Pessoa</span>
            <select
              value={pessoa}
              onChange={(e) => setPessoa(e.target.value)}
              className="h-8 rounded-full border border-borda-forte bg-white px-3 text-xs"
              aria-label="Filtrar por pessoa"
            >
              <option value="">Todas as pessoas</option>
              {pessoas
                .filter((p) => !dept || p.departamento === dept)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              <option value="__sem__">Sem responsável</option>
            </select>
            <button onClick={() => setPessoa(meuId)} className={cn('text-xs font-medium hover:underline', pessoa === meuId ? 'text-marca-800' : 'text-marca-700')}>
              só as minhas
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => alternarCategoria(c)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity',
                  filtro.has(c) ? 'opacity-100' : 'opacity-40',
                )}
                style={{ borderColor: COR_CATEGORIA[c], color: COR_CATEGORIA[c] }}
                aria-pressed={filtro.has(c)}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: COR_CATEGORIA[c] }} /> {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Tipo</span>
            {MODULOS_AGENDA.filter((m) => m.valor === 'obrigacoes' || m.valor === 'calendario' || eventos.some((e) => e.modulo === m.valor)).map((m) => (
              <button
                key={m.valor}
                onClick={() =>
                  setModulos((atual) => {
                    const novo = new Set(atual);
                    if (novo.has(m.valor)) novo.delete(m.valor);
                    else novo.add(m.valor);
                    return novo;
                  })
                }
                aria-pressed={modulos.has(m.valor)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  modulos.has(m.valor) ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-texto-fraco ring-borda hover:text-texto',
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Situação</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} className="h-8 rounded-full border border-borda-forte bg-white px-3 text-xs" aria-label="Filtrar por situação">
              <option value="">Todas</option>
              <option value="pendentes">Pendentes</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="concluidas">Concluídas</option>
            </select>
            <select value={origem} onChange={(e) => setOrigem(e.target.value as '' | 'econet' | 'equipe')} className="h-8 rounded-full border border-borda-forte bg-white px-3 text-xs" aria-label="Filtrar pela origem da obrigação">
              <option value="">Qualquer origem</option>
              <option value="econet">Só obrigações do e-Conet</option>
              <option value="equipe">Só obrigações criadas pela equipe</option>
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-texto-suave">
              <input type="checkbox" checked={cancelados} onChange={(e) => setCancelados(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-marca-600)]" />
              Mostrar cancelados
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-borda pt-3 text-sm text-texto-suave">
          <span>
            <strong className="text-texto">{unicos.length}</strong> compromissos
          </span>
          <span>
            <strong className="text-sucesso">{feitos}</strong> concluídos
          </span>
          <span>
            <strong className={atrasados ? 'text-erro' : 'text-texto'}>{atrasados}</strong> atrasados
          </span>
          {proximo && (
            <span>
              Próximo: <strong className="text-texto">{br(proximo.data).slice(0, 5)}</strong> {proximo.titulo}
            </span>
          )}
          <span className="ml-auto text-xs text-texto-fraco">{rotuloContexto}</span>
        </div>
      </Cartao>

      {aba === 'painel' && (
        <VisaoGeral
          todas={todas}
          feitas={feitas}
          dept={dept}
          view={view}
          aoAbrirDepartamento={(d) => {
            setDept(d);
            setAba('cal');
          }}
          aoVerPessoa={(p) => {
            setPessoa(p);
            setAba('cal');
          }}
          aoAbrir={setDetalhe}
          pessoas={pessoas}
        />
      )}

      {aba === 'cal' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Cartao className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-borda bg-superficie text-center text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <Grade
              view={view}
              itens={visiveis}
              feitas={feitas}
              feriados={feriados}
              mostrarFeriados={filtro.has('Feriado')}
              hoje={hoje}
              aoAbrir={setDetalhe}
              aoClicarDia={(ds) => (podeCriar ? setEditandoEvento({ evento: null, data: ds }) : setDiaAberto(ds))}
              aoVerDia={setDiaAberto}
            />
          </Cartao>
          <ListaDias titulo="Vencimentos do mês" itens={visiveis} feitas={feitas} hoje={hoje} mostrarDept={!dept} aoAbrir={setDetalhe} aoAlternar={(k) => void alternarFeito(k)} />
        </div>
      )}

      {aba === 'semana' && (
        <Cartao className="overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-borda md:grid-cols-7 md:divide-x md:divide-y-0">
            {semana.map((ds) => {
              const d = lerYmd(ds);
              const itens = ordenarPorHora(daSemana.filter((o) => o.data === ds));
              const feriado = feriados.doAno(d.getFullYear()).get(ds);
              return (
                <div key={ds} className={cn('flex min-h-[140px] flex-col md:min-h-[460px]', (d.getDay() === 0 || d.getDay() === 6) && 'bg-slate-50', feriado && 'bg-red-50/60')}>
                  <button
                    onClick={() => {
                      setFoco(ds);
                      setAba('dia');
                    }}
                    className="flex items-center justify-between gap-2 border-b border-borda px-2.5 py-2 text-left hover:bg-marca-50/50"
                    title="Abrir o dia"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">{DIAS_SEMANA[d.getDay()]}</span>
                    <span className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold', ds === hoje ? 'bg-marca-600 text-white' : 'text-texto')}>{d.getDate()}</span>
                  </button>
                  <div className="flex-1 space-y-1 p-1.5">
                    {feriado && filtro.has('Feriado') && <p className="truncate px-1 text-[10px] font-semibold text-red-700">{feriado}</p>}
                    {itens.map((o) => (
                      <CartaoOcorrencia key={o.chave} o={o} feita={feitas.has(o.chave)} atrasado={atrasada(o, feitas, hoje)} aoAbrir={() => setDetalhe(o.chave)} />
                    ))}
                    {itens.length === 0 && <p className="px-1 py-2 text-[11px] text-texto-fraco">—</p>}
                    {podeCriar && (
                      <button onClick={() => setEditandoEvento({ evento: null, data: ds })} className="flex w-full items-center justify-center gap-1 rounded py-1 text-[11px] font-medium text-texto-fraco hover:bg-white hover:text-marca-700" aria-label={`Novo compromisso em ${br(ds)}`}>
                        <Plus className="h-3 w-3" /> adicionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      {aba === 'dia' && (
        <Cartao>
          {(() => {
            const itens = ordenarPorHora(daSemana.filter((o) => o.data === foco));
            const comHora = itens.filter((o) => o.hora);
            const diaTodo = itens.filter((o) => !o.hora);
            const feriado = feriados.doAno(lerYmd(foco).getFullYear()).get(foco);
            return (
              <div className="divide-y divide-borda">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <p className="text-sm text-texto-suave">
                    <strong className="text-texto">{itens.length}</strong> item(ns) no dia{feriado ? ` · ${feriado}` : ''}{foco === hoje ? ' · hoje' : ''}
                  </p>
                  {podeCriar && (
                    <Botao tamanho="sm" variante="secundario" onClick={() => setEditandoEvento({ evento: null, data: foco })}>
                      <Plus className="h-3.5 w-3.5" /> Novo neste dia
                    </Botao>
                  )}
                </div>
                {itens.length === 0 && <p className="px-5 py-12 text-center text-sm text-texto-suave">Nada neste dia com os filtros atuais.</p>}
                {comHora.length > 0 && (
                  <ol className="px-5 py-3">
                    {comHora.map((o) => (
                      <li key={o.chave} className="grid grid-cols-[56px_1fr] gap-3 py-1.5">
                        <span className="pt-1.5 text-right text-xs font-semibold tabular-nums text-texto-suave">{o.hora}</span>
                        <CartaoOcorrencia o={o} grande feita={feitas.has(o.chave)} atrasado={atrasada(o, feitas, hoje)} aoAbrir={() => setDetalhe(o.chave)} />
                      </li>
                    ))}
                  </ol>
                )}
                {diaTodo.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Vence no dia / sem horário</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {diaTodo.map((o) => (
                        <li key={o.chave}>
                          <CartaoOcorrencia o={o} grande feita={feitas.has(o.chave)} atrasado={atrasada(o, feitas, hoje)} aoAbrir={() => setDetalhe(o.chave)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </Cartao>
      )}

      {aba === 'lista' && (
        <ListaDias titulo={`${MESES[view.m - 1]} ${view.y}`} itens={visiveis} feitas={feitas} hoje={hoje} mostrarDept={!dept} aoAbrir={setDetalhe} aoAlternar={(k) => void alternarFeito(k)} />
      )}

      {aba === 'regras' && (
        <Cartao className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3">
            <p className="max-w-2xl text-sm text-texto-suave">Obrigações que se repetem sozinhas. Desligue as que não se aplicam, ajuste o dia ou crie novas.</p>
            <div className="flex flex-wrap gap-2">
              {permissoes.todos && (
                <Botao tamanho="sm" variante="secundario" onClick={() => setSincronizar('incluir')} title="Inclui as obrigações do calendário anual e-Conet que estiverem faltando, sem duplicar">
                  <RefreshCw className="h-3.5 w-3.5" /> Sincronizar e-Conet
                </Botao>
              )}
              {podeCriar && (
                <Botao tamanho="sm" onClick={() => setEditandoRegra(null)}>
                  <Plus className="h-3.5 w-3.5" /> Nova obrigação fixa
                </Botao>
              )}
            </div>
          </div>
          <p className="border-b border-borda bg-superficie px-5 py-2 text-xs text-texto-suave">
            <Selo tom="info" className="mr-1.5 text-[10px]">e-Conet</Selo>
            obrigação legal do calendário anual e-Conet ({regras.filter((r) => r.fonte === 'econet').length} cadastradas). As demais foram criadas pela equipe. Os vencimentos são calculados aqui (dia útil, feriados), a partir da regra de cada obrigação.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-superficie text-left text-[11px] uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-4 py-2">Ativa</th>
                  <th className="px-3 py-2">Obrigação</th>
                  <th className="px-3 py-2">Departamento</th>
                  <th className="px-3 py-2">Esfera</th>
                  <th className="px-3 py-2">Regime</th>
                  <th className="px-3 py-2">Vencimento</th>
                  <th className="px-3 py-2">Meses</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {[...regras]
                  .filter((r) => (!dept || r.departamento === dept) && (!origem || (origem === 'econet') === (r.fonte === 'econet')))
                  .sort((a, b) => CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((r) => (
                    <tr key={r.id} className={cn(!r.ativo && 'opacity-50')}>
                      <td className="px-4 py-2.5">
                        <button
                          role="switch"
                          aria-checked={r.ativo}
                          disabled={!podeEditar(r.departamento)}
                          onClick={() => void alternarRegra(r)}
                          className={cn('relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed', r.ativo ? 'bg-marca-600' : 'bg-slate-300')}
                          aria-label={`Ativar ${r.nome}`}
                        >
                          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', r.ativo ? 'translate-x-4.5' : 'translate-x-0.5')} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-texto">
                          {r.nome}
                          {r.fonte === 'econet' && (
                            <Selo tom="info" className="ml-1.5 align-middle text-[10px]">
                              e-Conet{r.conferido_em ? ` · conferida ${br(r.conferido_em).slice(0, 5)}` : ''}
                            </Selo>
                          )}
                        </p>
                        {r.descricao && <p className="text-xs text-texto-suave">{r.descricao}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.departamento}
                        {(nomeDe(r.responsavel_id) ?? r.responsavel_nome) && <p className="text-xs text-texto-suave">👤 {nomeDe(r.responsavel_id) ?? r.responsavel_nome}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <PilulaCategoria c={r.categoria} />
                      </td>
                      <td className="px-3 py-2.5">{r.regime}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{vencLabel(r)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{r.meses?.length ? r.meses.map((m) => MESES[m - 1].slice(0, 3)).join(', ') : 'Todos'}</td>
                      <td className="px-3 py-2.5 text-xs">{REFERENCIAS[r.ref ?? '']}</td>
                      <td className="px-3 py-2.5">
                        {podeEditar(r.departamento) && (
                          <Botao variante="fantasma" tamanho="sm" onClick={() => setEditandoRegra(r)}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </Botao>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {/* Detalhe */}
      <Detalhe
        o={ocorrenciaDetalhe}
        feita={ocorrenciaDetalhe ? feitas.get(ocorrenciaDetalhe.chave) : undefined}
        hoje={hoje}
        aoFechar={() => setDetalhe(null)}
        aoAlternar={() => ocorrenciaDetalhe && void alternarFeito(ocorrenciaDetalhe.chave)}
        podeEditar={ocorrenciaDetalhe ? (ocorrenciaDetalhe.fonte === 'regra' || ocorrenciaDetalhe.modulo === 'calendario') && podeEditar(ocorrenciaDetalhe.departamento) : false}
        podeIntegracao={permissoes.podeIntegracao}
        aoEditar={() => {
          if (!ocorrenciaDetalhe) return;
          if (ocorrenciaDetalhe.fonte === 'regra') setEditandoRegra(regras.find((r) => r.id === ocorrenciaDetalhe.id) ?? null);
          else setEditandoEvento({ evento: eventos.find((e) => e.id === ocorrenciaDetalhe.id) ?? null });
          setDetalhe(null);
        }}
        aoIntegracao={() => ocorrenciaDetalhe && router.push(`/integracao-clientes?evento=${ocorrenciaDetalhe.id}`)}
      />

      {/* Dia (para quem só consulta) */}
      <Modal aberto={Boolean(diaAberto)} aoFechar={() => setDiaAberto(null)} titulo={diaAberto ? `${br(diaAberto)} · ${DIAS_SEMANA[lerYmd(diaAberto).getDay()]}` : ''} largura="md">
        {diaAberto && (
          <ListaDias
            semCartao
            titulo=""
            itens={visiveis.filter((o) => o.data === diaAberto)}
            feitas={feitas}
            hoje={hoje}
            mostrarDept={!dept}
            aoAbrir={(k) => {
              setDiaAberto(null);
              setDetalhe(k);
            }}
            aoAlternar={(k) => void alternarFeito(k)}
          />
        )}
      </Modal>

      <ModalConfirmacao
        aberto={Boolean(sincronizar)}
        aoFechar={() => setSincronizar(null)}
        aoConfirmar={() => void sincronizarEconet(sincronizar === 'redefinir')}
        carregando={sincronizando}
        perigoso={sincronizar === 'redefinir'}
        titulo={sincronizar === 'redefinir' ? 'Redefinir para o padrão e-Conet?' : 'Sincronizar com o calendário e-Conet'}
        rotuloConfirmar={sincronizar === 'redefinir' ? 'Redefinir' : 'Sincronizar'}
        mensagem={
          sincronizar === 'redefinir' ? (
            'As obrigações de origem e-Conet voltam ao dia, à regra de vencimento e à descrição do catálogo. Responsáveis e obrigações criadas pela equipe não mudam.'
          ) : (
            <>
              Inclui as obrigações do calendário anual e-Conet que não estiverem cadastradas. Nada é duplicado e os ajustes já feitos pela equipe são preservados.
              <button className="mt-2 block text-xs font-medium text-marca-700 hover:underline" onClick={() => setSincronizar('redefinir')}>
                Quero também redefinir as existentes para o padrão do catálogo…
              </button>
            </>
          )
        }
      />

      <EditorEvento
        aberto={Boolean(editandoEvento)}
        evento={editandoEvento?.evento ?? null}
        dataPadrao={editandoEvento?.data}
        aoFechar={() => setEditandoEvento(null)}
        aoSalvo={(e) => {
          setEditandoEvento(null);
          void carregarDados();
          if (e) irPara(lerYmd(e.data));
        }}
        deptosPermitidos={deptosPermitidos}
        deptPadrao={dept && deptosPermitidos.includes(dept) ? dept : permissoes.todos ? 'Qualidade' : permissoes.meuDepartamento}
        pessoas={pessoas}
        meuId={meuId}
        meuNome={meuNome}
      />

      <EditorRegra
        aberto={editandoRegra !== undefined}
        regra={editandoRegra ?? null}
        aoFechar={() => setEditandoRegra(undefined)}
        aoSalvo={() => {
          setEditandoRegra(undefined);
          void carregarDados();
        }}
        deptosPermitidos={deptosPermitidos}
        deptPadrao={dept && deptosPermitidos.includes(dept) ? dept : deptosPermitidos[0]}
        pessoas={pessoas}
        eventos={eventos}
      />

      <DialogoRelatorio
        aberto={relatorio}
        aoFechar={() => setRelatorio(false)}
        mesAtual={`${view.y}-${pad(view.m)}`}
        deptosPermitidos={deptosPermitidos}
        todos={permissoes.todos}
        deptSel={dept}
        regras={regras}
        eventos={eventos}
        nomeDe={nomeDe}
        meuNome={meuNome}
      />
    </div>
  );
}

function PilulaCategoria({ c }: { c: CategoriaCalendario }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${COR_CATEGORIA[c]}18`, color: COR_CATEGORIA[c] }}>
      {c}
    </span>
  );
}

/** De onde o item veio: e-Conet, ou o módulo que o publicou na agenda. */
function SeloOrigem({ o }: { o: Ocorrencia }) {
  if (o.fonte === 'regra') return o.econet ? <Selo tom="info" className="text-[10px]">e-Conet</Selo> : null;
  if (o.modulo === 'calendario') return null;
  return <Selo tom="marca" className="text-[10px]">{MODULOS_AGENDA.find((m) => m.valor === o.modulo)?.rotuloCurto ?? o.modulo}</Selo>;
}

function CartaoOcorrencia({ o, feita, atrasado, grande = false, aoAbrir }: { o: Ocorrencia; feita: boolean; atrasado: boolean; grande?: boolean; aoAbrir: () => void }) {
  return (
    <button
      onClick={aoAbrir}
      title={o.titulo}
      className={cn(
        'block w-full rounded border-l-[3px] text-left transition-colors hover:brightness-95',
        grande ? 'px-3 py-2' : 'px-1.5 py-1',
        (feita || o.status === 'cancelado') && 'opacity-55',
        atrasado && 'ring-1 ring-inset ring-red-300',
      )}
      style={{ borderColor: COR_CATEGORIA[o.categoria], background: `${COR_CATEGORIA[o.categoria]}14` }}
    >
      <span className={cn('block font-medium leading-tight text-texto', grande ? 'text-sm' : 'line-clamp-2 text-[11px]', (feita || o.status === 'cancelado') && 'line-through')}>{o.titulo}</span>
      <span className={cn('mt-0.5 flex flex-wrap items-center gap-1 text-texto-suave', grande ? 'text-xs' : 'text-[10px]')}>
        {grande && <span>{[o.responsavel ? `👤 ${o.responsavel}` : '', o.departamento, o.empresa].filter(Boolean).join(' · ')}</span>}
        <SeloOrigem o={o} />
        {atrasado && <Selo tom="erro" className="text-[10px]">Atrasado</Selo>}
      </span>
    </button>
  );
}

function Grade({
  view,
  itens,
  feitas,
  feriados,
  mostrarFeriados,
  hoje,
  aoAbrir,
  aoClicarDia,
  aoVerDia,
}: {
  view: { y: number; m: number };
  itens: Ocorrencia[];
  feitas: Map<string, ConclusaoCalendario>;
  feriados: ReturnType<typeof criarCalendarioFeriados>;
  mostrarFeriados: boolean;
  hoje: string;
  aoAbrir: (chave: string) => void;
  aoClicarDia: (ds: string) => void;
  aoVerDia: (ds: string) => void;
}) {
  const primeiro = new Date(view.y, view.m - 1, 1);
  const inicio = new Date(primeiro);
  inicio.setDate(1 - primeiro.getDay());
  const ultimo = new Date(view.y, view.m, 0);
  const total = Math.ceil((primeiro.getDay() + ultimo.getDate()) / 7) * 7;
  const porDia = new Map<string, Ocorrencia[]>();
  for (const o of itens) porDia.set(o.data, [...(porDia.get(o.data) ?? []), o]);

  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: total }, (_, i) => {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        const ds = ymd(d);
        const fora = d.getMonth() !== view.m - 1;
        const feriado = feriados.doAno(d.getFullYear()).get(ds);
        const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
        const evs = fora ? [] : (porDia.get(ds) ?? []);
        return (
          <div
            key={ds}
            onClick={() => !fora && aoClicarDia(ds)}
            className={cn(
              'min-h-[112px] cursor-pointer border-b border-r border-borda p-1.5 transition-colors hover:bg-marca-50/40',
              fora && 'cursor-default bg-superficie/60 text-texto-fraco',
              !fora && fimDeSemana && 'bg-slate-50',
              !fora && feriado && 'bg-red-50/60',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  ds === hoje ? 'bg-marca-600 text-white' : fora ? 'text-texto-fraco' : 'text-texto-suave',
                )}
              >
                {d.getDate()}
              </span>
              {evs.length > 0 && <span className="text-[10px] text-texto-fraco">{evs.length}</span>}
            </div>
            {feriado && !fora && mostrarFeriados && <p className="mb-0.5 truncate text-[10px] font-semibold text-red-700">{feriado}</p>}
            <div className="space-y-0.5">
              {evs.slice(0, 3).map((o) => {
                const feito = feitas.has(o.chave);
                const late = atrasada(o, feitas, hoje);
                return (
                  <button
                    key={o.chave}
                    onClick={(e) => {
                      e.stopPropagation();
                      aoAbrir(o.chave);
                    }}
                    title={o.titulo}
                    className={cn(
                      'block w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:brightness-95',
                      feito && 'line-through opacity-50',
                      late && 'ring-1 ring-inset ring-red-300',
                    )}
                    style={{ borderColor: COR_CATEGORIA[o.categoria], background: `${COR_CATEGORIA[o.categoria]}14` }}
                  >
                    {o.titulo}
                  </button>
                );
              })}
              {evs.length > 3 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    aoVerDia(ds);
                  }}
                  className="text-[10px] font-medium text-marca-700 hover:underline"
                >
                  +{evs.length - 3} mais
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListaDias({
  titulo,
  itens,
  feitas,
  hoje,
  mostrarDept,
  aoAbrir,
  aoAlternar,
  semCartao = false,
}: {
  titulo: string;
  itens: Ocorrencia[];
  feitas: Map<string, ConclusaoCalendario>;
  hoje: string;
  mostrarDept: boolean;
  aoAbrir: (chave: string) => void;
  aoAlternar: (chave: string) => void;
  semCartao?: boolean;
}) {
  const porDia = new Map<string, Ocorrencia[]>();
  for (const o of itens) porDia.set(o.data, [...(porDia.get(o.data) ?? []), o]);

  const conteudo = (
    <>
      {titulo && <h3 className="border-b border-borda px-4 py-3 text-sm font-semibold text-texto">{titulo}</h3>}
      {itens.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-texto-suave">Nada neste mês com os filtros atuais.</p>
      ) : (
        <div className="divide-y divide-borda">
          {[...porDia.entries()].map(([ds, lista]) => (
            <div key={ds} className="px-4 py-2.5">
              <p className={cn('mb-1.5 flex gap-2 text-xs font-semibold', ds === hoje ? 'text-marca-700' : 'text-texto-fraco')}>
                <span>{br(ds).slice(0, 5)}</span>
                <span>{DIAS_SEMANA[lerYmd(ds).getDay()]}</span>
                {ds === hoje && <span>· hoje</span>}
              </p>
              <ul className="space-y-1">
                {lista.map((o) => {
                  const feito = feitas.has(o.chave);
                  const late = atrasada(o, feitas, hoje);
                  return (
                    <li key={o.chave} className={cn('flex items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-superficie', feito && 'opacity-60')}>
                      <input
                        type="checkbox"
                        checked={feito}
                        disabled={o.status === 'cancelado' || (o.statusNaOrigem && !MODULOS_CONCLUIVEIS.includes(o.modulo))}
                        title={o.statusNaOrigem && !MODULOS_CONCLUIVEIS.includes(o.modulo) ? `A situação é atualizada em ${rotuloModulo(o.modulo)}` : undefined}
                        onChange={() => aoAlternar(o.chave)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-borda-forte text-marca-600 disabled:opacity-40"
                        aria-label={`Marcar ${o.titulo} como concluído`}
                      />
                      <button onClick={() => aoAbrir(o.chave)} className="min-w-0 flex-1 text-left">
                        <span className={cn('block text-sm font-medium text-texto', feito && 'line-through')}>{o.titulo}</span>
                        <span className="block text-xs text-texto-suave">
                          {[o.responsavel ? `👤 ${o.responsavel}` : '', mostrarDept ? o.departamento : '', o.ref, o.regime && o.regime !== 'Todos' ? o.regime : ''].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <PilulaCategoria c={o.categoria} />
                        <SeloOrigem o={o} />
                        {o.status === 'cancelado' && <Selo tom="neutro" className="text-[10px]">Cancelado</Selo>}
                        {late && <Selo tom="erro" className="text-[10px]">Atrasado</Selo>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
  return semCartao ? <div>{conteudo}</div> : <Cartao className="max-h-[78vh] overflow-y-auto">{conteudo}</Cartao>;
}

function Detalhe({
  o,
  feita,
  hoje,
  aoFechar,
  aoAlternar,
  podeEditar,
  podeIntegracao,
  aoEditar,
  aoIntegracao,
}: {
  o: Ocorrencia | null;
  feita: ConclusaoCalendario | undefined;
  hoje: string;
  aoFechar: () => void;
  aoAlternar: () => void;
  podeEditar: boolean;
  podeIntegracao: boolean;
  aoEditar: () => void;
  aoIntegracao: () => void;
}) {
  if (!o) return null;
  const linhas: [string, React.ReactNode][] = [];
  if (o.tipo === 'Demanda') {
    if (o.inicioData) linhas.push(['Prazo inicial', br(o.inicioData)]);
    linhas.push(['Prazo final', br(o.prazo || o.data)]);
  } else linhas.push([o.fonte === 'evento' ? 'Data' : 'Vencimento', br(o.data)]);
  if (o.fonte === 'evento') {
    if (o.tipo) linhas.push(['Tipo', o.tipo]);
    if (o.visivel.length) linhas.push(['Também aparece para', o.visivel.join(', ')]);
    if (o.hora) linhas.push(['Hora', o.hora]);
    if (o.empresa)
      linhas.push([
        'Empresa',
        o.empresaId ? (
          <Link href={`/legalizacao?empresa=${o.empresaId}`} className="text-marca-700 hover:underline">
            {o.empresa}
          </Link>
        ) : (
          o.empresa
        ),
      ]);
    if (o.cnpj) linhas.push(['CNPJ', o.cnpj]);
    if (o.contato) linhas.push(['Contato', o.contato]);
    if (o.modalidade) linhas.push(['Modalidade', o.modalidade]);
  }
  if (o.fonte === 'regra') linhas.push(['Origem', o.econet ? <span key="o"><Selo tom="info">e-Conet</Selo> calendário anual de obrigações</span> : 'Obrigação criada pela equipe']);
  else if (o.modulo !== 'calendario') linhas.push(['Origem', <span key="o"><Selo tom="marca">{rotuloModulo(o.modulo)}</Selo></span>]);
  linhas.push(['Departamento', o.departamento]);
  linhas.push(['Designado para', o.responsavel || <span className="text-texto-fraco">Não definido</span>]);
  linhas.push(['Esfera', <PilulaCategoria key="c" c={o.categoria} />]);
  if (o.ref) linhas.push(['Competência', o.ref]);
  if (o.regime) linhas.push(['Regime', o.regime]);
  if (o.recorrencia && o.recorrencia !== 'nenhuma') linhas.push(['Repete', o.recorrencia === 'mensal' ? 'Todo mês' : 'Todo ano']);
  if (o.descricao) linhas.push(['Observações', <span key="d" className="whitespace-pre-wrap">{o.descricao}</span>]);
  linhas.push([
    'Situação',
    o.status === 'cancelado' ? (
      <Selo tom="neutro">Cancelado</Selo>
    ) : feita ? (
      <span>
        <Selo tom="sucesso">Concluído</Selo> em {new Date(feita.concluido_em).toLocaleDateString('pt-BR')}
        {feita.concluido_por_nome ? ` por ${feita.concluido_por_nome}` : ''}
      </span>
    ) : (o.prazo || o.data) < hoje ? (
      <Selo tom="erro">Atrasado</Selo>
    ) : (
      'Pendente'
    ),
  ]);

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={o.titulo}
      largura="md"
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {o.status !== 'cancelado' && (!o.statusNaOrigem || MODULOS_CONCLUIVEIS.includes(o.modulo)) && (
              <Botao onClick={aoAlternar} variante={feita ? 'secundario' : 'primario'}>
                <Check className="h-4 w-4" /> {feita ? 'Reabrir' : 'Marcar como concluído'}
              </Botao>
            )}
            {o.link && (
              <Link href={o.link}>
                <Botao variante="secundario">
                  <ExternalLink className="h-4 w-4" /> Abrir em {rotuloModulo(o.modulo)}
                </Botao>
              </Link>
            )}
            {o.tipo === 'Reunião de Integração' && podeIntegracao && (
              <Botao variante="secundario" onClick={aoIntegracao}>
                <Handshake className="h-4 w-4" /> Abrir roteiro de integração
              </Botao>
            )}
          </div>
          {podeEditar && (
            <Botao variante="fantasma" onClick={aoEditar}>
              <Pencil className="h-4 w-4" /> {o.fonte === 'regra' ? 'Editar obrigação fixa' : 'Editar'}
            </Botao>
          )}
        </div>
      }
    >
      {o.statusNaOrigem && !MODULOS_CONCLUIVEIS.includes(o.modulo) && (
        <p className="mb-3 rounded-lg bg-superficie px-3 py-2 text-xs text-texto-suave">A situação deste item acompanha {rotuloModulo(o.modulo)}: quando ele for concluído ou alterado por lá, o calendário se atualiza sozinho.</p>
      )}
      <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-sm">
        {linhas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-texto-suave">{k}</dt>
            <dd className="text-texto">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

function VisaoGeral({
  todas,
  feitas,
  dept,
  view,
  aoAbrirDepartamento,
  aoVerPessoa,
  aoAbrir,
  pessoas,
}: {
  todas: Ocorrencia[];
  feitas: Map<string, ConclusaoCalendario>;
  dept: Departamento | null;
  view: { y: number; m: number };
  aoAbrirDepartamento: (d: Departamento) => void;
  aoVerPessoa: (p: string) => void;
  aoAbrir: (k: string) => void;
  pessoas: PessoaCalendario[];
}) {
  const { avisar } = useAvisos();
  const hoje = hojeYmd();
  const unicas = todas.filter((o) => !o.inicio);
  const conta = (lista: Ocorrencia[]) => {
    const ok = lista.filter((o) => feitas.has(o.chave)).length;
    const late = lista.filter((o) => atrasada(o, feitas, hoje)).length;
    return { t: lista.length, ok, pend: lista.length - ok, late, pct: lista.length ? Math.round((ok * 100) / lista.length) : 0 };
  };
  const porDept = DEPARTAMENTOS.map((d) => ({ d, ...conta(unicas.filter((o) => o.departamento === d)) }));
  const base = dept ? unicas.filter((o) => o.departamento === dept) : unicas;
  const grupos = new Map<string, { nome: string; chave: string; sem: boolean; itens: Ocorrencia[] }>();
  for (const o of base) {
    const chave = o.responsavelId ?? (o.responsavel ? o.responsavel.toLowerCase() : '__sem__');
    if (!grupos.has(chave)) grupos.set(chave, { nome: o.responsavel || 'Sem responsável', chave: o.responsavelId ?? (o.responsavel || '__sem__'), sem: !o.responsavel, itens: [] });
    grupos.get(chave)!.itens.push(o);
  }
  const porPessoa = [...grupos.values()]
    .sort((a, b) => Number(a.sem) - Number(b.sem) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((g) => ({ ...g, deps: [...new Set(g.itens.map((o) => o.departamento))].join(', '), ...conta(g.itens) }));
  const atrasadas = unicas.filter((o) => atrasada(o, feitas, hoje));
  // O endereço do portal só existe no navegador; no servidor o link sai relativo.
  const [base_url, setBaseUrl] = useState('');
  useEffect(() => setBaseUrl(window.location.origin), []);

  const Barra = ({ pct }: { pct: number }) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-sucesso" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-texto-suave">{pct}%</span>
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao className="overflow-hidden">
        <h3 className="border-b border-borda px-4 py-3 text-sm font-semibold">
          Andamento por departamento · {MESES[view.m - 1]} {view.y}
        </h3>
        <table className="w-full text-sm">
          <thead className="bg-superficie text-left text-[11px] uppercase tracking-wide text-texto-suave">
            <tr>
              <th className="px-4 py-2">Departamento</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Feitos</th>
              <th className="px-2 py-2 text-right">Atras.</th>
              <th className="w-40 px-4 py-2">Progresso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {porDept.map((x) => (
              <tr key={x.d} className="cursor-pointer hover:bg-superficie" onClick={() => aoAbrirDepartamento(x.d)}>
                <td className="px-4 py-2 font-medium">{x.d}</td>
                <td className="px-2 py-2 text-right tabular-nums">{x.t}</td>
                <td className="px-2 py-2 text-right tabular-nums">{x.ok}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', x.late && 'font-semibold text-erro')}>{x.late}</td>
                <td className="px-4 py-2">
                  <Barra pct={x.pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <Cartao className="overflow-hidden">
        <h3 className="border-b border-borda px-4 py-3 text-sm font-semibold">
          Andamento por pessoa{dept ? ` · ${dept}` : ''}
        </h3>
        {porPessoa.length === 0 ? (
          <p className="px-4 py-6 text-sm text-texto-suave">Nada neste mês.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-[11px] uppercase tracking-wide text-texto-suave">
              <tr>
                <th className="px-4 py-2">Pessoa</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Atras.</th>
                <th className="w-36 px-4 py-2">Progresso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {porPessoa.map((x) => (
                <tr
                  key={x.chave}
                  className="cursor-pointer hover:bg-superficie"
                  onClick={() => aoVerPessoa(x.sem ? '__sem__' : pessoas.some((p) => p.id === x.chave) ? x.chave : x.nome)}
                >
                  <td className="px-4 py-2">
                    <p className={cn('font-medium', x.sem && 'text-texto-fraco')}>{x.nome}</p>
                    <p className="text-[11px] text-texto-fraco">{x.deps}</p>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{x.t}</td>
                  <td className={cn('px-2 py-2 text-right tabular-nums', x.late && 'font-semibold text-erro')}>{x.late}</td>
                  <td className="px-4 py-2">
                    <Barra pct={x.pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-borda px-4 py-2 text-[11px] text-texto-fraco">Para definir o responsável, edite a obrigação fixa ou o compromisso.</p>
      </Cartao>

      <Cartao className="overflow-hidden">
        <h3 className="border-b border-borda px-4 py-3 text-sm font-semibold">Atrasados</h3>
        {atrasadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-texto-suave">Nenhuma obrigação atrasada neste mês. 🎉</p>
        ) : (
          <ul className="max-h-80 divide-y divide-borda overflow-y-auto">
            {atrasadas.map((o) => (
              <li key={o.chave}>
                <button onClick={() => aoAbrir(o.chave)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-superficie">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.titulo}</span>
                    <span className="block text-xs text-texto-suave">
                      {br(o.data)} · {o.departamento}
                      {o.responsavel ? ` · ${o.responsavel}` : ''}
                    </span>
                  </span>
                  <Selo tom="erro">Atrasado</Selo>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="overflow-hidden">
        <h3 className="border-b border-borda px-4 py-3 text-sm font-semibold">Links dos departamentos</h3>
        <p className="px-4 pt-3 text-xs text-texto-suave">Cada link abre o calendário já filtrado no departamento — como os links ?d= do app antigo.</p>
        <ul className="space-y-1.5 p-4">
          {DEPARTAMENTOS.map((d) => {
            const url = `${base_url}/calendario?d=${SLUG_DEPARTAMENTO[d]}`;
            return (
              <li key={d} className="flex items-center justify-between gap-3 rounded-lg border border-borda px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{d}</span>
                  <code className="block truncate text-[11px] text-texto-fraco">{url}</code>
                </span>
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      avisar('sucesso', `Link de ${d} copiado.`);
                    } catch {
                      window.prompt('Copie o link:', url);
                    }
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
                </Botao>
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}

