'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  FileDown,
  Handshake,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Repeat,
  Users,
} from 'lucide-react';

import { EditorEvento, EditorRegra } from '@/app/(portal)/calendario/Editores';
import { DialogoRelatorio } from '@/app/(portal)/calendario/DialogoRelatorio';
import { Botao, Cartao, Modal, Selo, cn, useAvisos } from '@/components/ui';
import {
  CATEGORIAS,
  COR_CATEGORIA,
  DEPARTAMENTOS,
  DIAS_SEMANA,
  MESES,
  REFERENCIAS,
  SLUG_DEPARTAMENTO,
  atrasada,
  br,
  criarCalendarioFeriados,
  hojeYmd,
  lerYmd,
  mesmaPessoa,
  ocorrencias,
  vencLabel,
  ymd,
  type Ocorrencia,
} from '@/lib/calendario';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CategoriaCalendario, ConclusaoCalendario, Departamento, EventoCalendario, RegraCalendario } from '@/types/banco';

type Aba = 'painel' | 'cal' | 'lista' | 'regras';

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
  const [feitas, setFeitas] = useState<Map<string, ConclusaoCalendario>>(new Map());
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
    const proximo = new Date(view.y, view.m, 1);
    const meses = [`${view.y}-${pad(view.m)}`, `${proximo.getFullYear()}-${pad(proximo.getMonth() + 1)}`];
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

  const todas = useMemo(() => ocorrencias(view.y, view.m, regras, eventos, feriados, nomeDe), [view, regras, eventos, feriados, nomeDe]);

  const visiveis = useMemo(
    () =>
      todas.filter(
        (o) =>
          filtro.has(o.categoria) &&
          (!dept || o.departamento === dept || o.visivel.includes(dept)) &&
          (!pessoa || (pessoa === '__sem__' ? !o.responsavel : o.responsavelId === pessoa || mesmaPessoa(o.responsavel, nomes.get(pessoa) ?? pessoa))),
      ),
    [todas, filtro, dept, pessoa, nomes],
  );

  const unicos = visiveis.filter((o) => !o.inicio);
  const feitos = unicos.filter((o) => feitas.has(o.chave)).length;
  const atrasados = unicos.filter((o) => atrasada(o, feitas, hoje)).length;
  const proximo = unicos.find((o) => o.data >= hoje && !feitas.has(o.chave));

  async function alternarFeito(chave: string) {
    const jaFeito = feitas.get(chave);
    const novo = new Map(feitas);
    const data = chave.split(':').pop() ?? '';
    if (jaFeito) novo.delete(chave);
    else novo.set(chave, { chave, mes: data.slice(0, 7), concluido_em: new Date().toISOString(), concluido_por: meuId, concluido_por_nome: meuNome });
    setFeitas(novo);
    const { error } = jaFeito
      ? await supabase.from('calendario_conclusoes').delete().eq('chave', chave)
      : await supabase.from('calendario_conclusoes').insert({ chave, mes: data.slice(0, 7), concluido_por: meuId, concluido_por_nome: meuNome });
    if (error && error.code !== '23505') {
      setFeitas(feitas);
      avisar('erro', error.message);
    }
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
  }

  const ocorrenciaDetalhe = detalhe ? todas.find((o) => o.chave === detalhe) ?? null : null;

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
            <Botao variante="secundario" tamanho="icone" onClick={() => irPara(new Date(view.y, view.m - 2, 1))} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Botao>
            <h2 className="w-44 text-center text-lg font-semibold text-texto">
              {MESES[view.m - 1]} {view.y}
            </h2>
            <Botao variante="secundario" tamanho="icone" onClick={() => irPara(new Date(view.y, view.m, 1))} aria-label="Próximo mês">
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
                { v: 'cal' as Aba, r: 'Calendário', i: LayoutGrid },
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

      {aba === 'lista' && (
        <ListaDias titulo={`${MESES[view.m - 1]} ${view.y}`} itens={visiveis} feitas={feitas} hoje={hoje} mostrarDept={!dept} aoAbrir={setDetalhe} aoAlternar={(k) => void alternarFeito(k)} />
      )}

      {aba === 'regras' && (
        <Cartao className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3">
            <p className="max-w-2xl text-sm text-texto-suave">Obrigações que se repetem sozinhas. Desligue as que não se aplicam, ajuste o dia ou crie novas.</p>
            {podeCriar && (
              <Botao tamanho="sm" onClick={() => setEditandoRegra(null)}>
                <Plus className="h-3.5 w-3.5" /> Nova obrigação fixa
              </Botao>
            )}
          </div>
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
                  .filter((r) => !dept || r.departamento === dept)
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
                        <p className="font-medium text-texto">{r.nome}</p>
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
        podeEditar={ocorrenciaDetalhe ? podeEditar(ocorrenciaDetalhe.departamento) : false}
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
                        onChange={() => aoAlternar(o.chave)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-borda-forte text-marca-600"
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
  linhas.push(['Departamento', o.departamento]);
  linhas.push(['Designado para', o.responsavel || <span className="text-texto-fraco">Não definido</span>]);
  linhas.push(['Esfera', <PilulaCategoria key="c" c={o.categoria} />]);
  if (o.ref) linhas.push(['Competência', o.ref]);
  if (o.regime) linhas.push(['Regime', o.regime]);
  if (o.recorrencia && o.recorrencia !== 'nenhuma') linhas.push(['Repete', o.recorrencia === 'mensal' ? 'Todo mês' : 'Todo ano']);
  if (o.descricao) linhas.push(['Observações', <span key="d" className="whitespace-pre-wrap">{o.descricao}</span>]);
  linhas.push([
    'Situação',
    feita ? (
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
            <Botao onClick={aoAlternar} variante={feita ? 'secundario' : 'primario'}>
              <Check className="h-4 w-4" /> {feita ? 'Reabrir' : 'Marcar como concluído'}
            </Botao>
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
  const base_url = typeof window !== 'undefined' ? window.location.origin : '';

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

