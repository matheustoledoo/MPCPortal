'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Settings,
  Undo2,
} from 'lucide-react';

import { COR_PRIORIDADE, EVENTO_NOTIFICACOES, ICONE_CATEGORIA } from '@/components/layout/SinoNotificacoes';
import { Botao, Campo, Cartao, EstadoVazio, Modal, Selo, cn, useAvisos } from '@/components/ui';
import {
  CATEGORIAS,
  TOM_PRIORIDADE,
  acaoDeOrigem,
  concluirOrigem,
  marcarNotificacoes,
  rotuloCategoria,
  tempoRelativo,
  type AcaoNotificacao,
} from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CategoriaNotificacao, Notificacao, PrioridadeNotificacao } from '@/types/banco';

type Situacao = 'pendentes' | 'nao_lidas' | 'concluidas' | 'arquivadas' | 'todas';

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'pendentes', rotulo: 'Pendentes' },
  { valor: 'nao_lidas', rotulo: 'Não lidas' },
  { valor: 'concluidas', rotulo: 'Concluídas' },
  { valor: 'arquivadas', rotulo: 'Fechadas' },
  { valor: 'todas', rotulo: 'Todas' },
];

const PRIORIDADES: { valor: PrioridadeNotificacao; rotulo: string }[] = [
  { valor: 'urgente', rotulo: 'Urgente' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'normal', rotulo: 'Normal' },
  { valor: 'baixa', rotulo: 'Baixa' },
];

function grupoDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((base - dia) / 86_400_000);
  if (diff <= 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return 'Nesta semana';
  if (diff < 31) return 'Neste mês';
  return 'Mais antigas';
}

/**
 * Tudo que pede a atenção da pessoa, num lugar só: filtros por situação,
 * categoria e prioridade, ações em lote e, quando a notificação vem de uma
 * tarefa, concluir a própria tarefa dali mesmo.
 */
export function CentralNotificacoes({
  usuarioId,
  nome,
  preferenciasIniciais,
}: {
  usuarioId: string;
  nome: string;
  preferenciasIniciais: Partial<Record<CategoriaNotificacao, boolean>>;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const { avisar } = useAvisos();

  const [itens, setItens] = useState<Notificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [situacao, setSituacao] = useState<Situacao>('pendentes');
  const [categorias, setCategorias] = useState<CategoriaNotificacao[]>([]);
  const [prioridades, setPrioridades] = useState<PrioridadeNotificacao[]>([]);
  const [busca, setBusca] = useState('');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [limite, setLimite] = useState(300);
  const [preferencias, setPreferencias] = useState(preferenciasIniciais);
  const [ajustes, setAjustes] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) avisar('erro', error.message);
    setItens((data ?? []) as Notificacao[]);
    setCarregando(false);
  }, [supabase, limite, avisar]);

  useEffect(() => {
    void carregar();
    const aoMudar = () => void carregar();
    window.addEventListener(EVENTO_NOTIFICACOES, aoMudar);
    return () => window.removeEventListener(EVENTO_NOTIFICACOES, aoMudar);
  }, [carregar]);

  function avisarSino() {
    window.dispatchEvent(new Event(EVENTO_NOTIFICACOES + ':recarregar'));
  }

  async function sincronizar() {
    setSincronizando(true);
    await supabase.rpc('sincronizar_minhas_notificacoes');
    await carregar();
    avisarSino();
    setSincronizando(false);
    avisar('sucesso', 'Prazos conferidos agora.');
  }

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      itens.filter((n) => {
        switch (situacao) {
          case 'pendentes':
            if (n.arquivada_em || n.concluida_em) return false;
            break;
          case 'nao_lidas':
            if (n.arquivada_em || n.lida_em) return false;
            break;
          case 'concluidas':
            if (!n.concluida_em) return false;
            break;
          case 'arquivadas':
            if (!n.arquivada_em) return false;
            break;
        }
        if (categorias.length && !categorias.includes(n.categoria)) return false;
        if (prioridades.length && !prioridades.includes(n.prioridade)) return false;
        if (termo && !`${n.titulo} ${n.mensagem ?? ''}`.toLowerCase().includes(termo)) return false;
        return true;
      }),
    [itens, situacao, categorias, prioridades, termo],
  );

  const contagemCategoria = useMemo(() => {
    const mapa: Partial<Record<CategoriaNotificacao, number>> = {};
    for (const n of itens) if (!n.arquivada_em && !n.concluida_em) mapa[n.categoria] = (mapa[n.categoria] ?? 0) + 1;
    return mapa;
  }, [itens]);

  const resumo = useMemo(
    () => ({
      naoLidas: itens.filter((n) => !n.lida_em && !n.arquivada_em).length,
      urgentes: itens.filter((n) => !n.concluida_em && !n.arquivada_em && (n.prioridade === 'urgente' || n.prioridade === 'alta')).length,
      prazos: itens.filter((n) => n.categoria === 'prazo' && !n.concluida_em && !n.arquivada_em).length,
      concluidasSemana: itens.filter((n) => n.concluida_em && Date.now() - new Date(n.concluida_em).getTime() < 7 * 86_400_000).length,
    }),
    [itens],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, Notificacao[]>();
    for (const n of filtradas) {
      const g = grupoDoDia(n.created_at);
      mapa.set(g, [...(mapa.get(g) ?? []), n]);
    }
    return [...mapa.entries()];
  }, [filtradas]);

  async function agirEmLote(acao: AcaoNotificacao, ids = selecionadas) {
    // "todas_lidas" vale para a caixa inteira e não leva ids.
    if (!ids.length && acao !== 'todas_lidas') return;
    try {
      const n = await marcarNotificacoes(supabase, ids, acao);
      avisar('sucesso', `${n} notificação(ões) atualizada(s).`);
      setSelecionadas([]);
      await carregar();
      avisarSino();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível atualizar.');
    }
  }

  async function concluir(n: Notificacao) {
    try {
      await concluirOrigem(supabase, n, nome, usuarioId);
      avisar(
        'sucesso',
        acaoDeOrigem(n) === 'calendario'
          ? 'Obrigação marcada como concluída no calendário.'
          : acaoDeOrigem(n) === 'atribuicao'
            ? 'Ciclo da atribuição concluído — o próximo prazo já foi calculado.'
            : 'Notificação concluída.',
      );
      await carregar();
      avisarSino();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível concluir.');
    }
  }

  async function alternarPreferencia(categoria: CategoriaNotificacao, ativo: boolean) {
    setPreferencias((p) => ({ ...p, [categoria]: ativo }));
    const { error } = await supabase
      .from('notificacao_preferencias')
      .upsert({ categoria, ativo }, { onConflict: 'usuario_id,categoria' });
    if (error) avisar('erro', error.message);
  }

  const todasSelecionadas = filtradas.length > 0 && filtradas.every((n) => selecionadas.includes(n.id));

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo rotulo="Não lidas" valor={resumo.naoLidas} tom="marca" aoClicar={() => setSituacao('nao_lidas')} />
        <Resumo rotulo="Urgentes e altas" valor={resumo.urgentes} tom={resumo.urgentes ? 'erro' : 'neutro'} aoClicar={() => { setSituacao('pendentes'); setPrioridades(['urgente', 'alta']); }} />
        <Resumo rotulo="Prazos pendentes" valor={resumo.prazos} tom={resumo.prazos ? 'alerta' : 'neutro'} aoClicar={() => { setSituacao('pendentes'); setCategorias(['prazo']); }} />
        <Resumo rotulo="Concluídas na semana" valor={resumo.concluidasSemana} tom="sucesso" aoClicar={() => setSituacao('concluidas')} />
      </section>

      <Cartao className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-superficie p-1">
            {SITUACOES.map((s) => (
              <button
                key={s.valor}
                onClick={() => setSituacao(s.valor)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  situacao === s.valor ? 'bg-white text-marca-800 shadow-sm' : 'text-texto-suave hover:text-texto',
                )}
              >
                {s.rotulo}
              </button>
            ))}
          </div>
          <div className="min-w-[200px] flex-1">
            <Campo
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar nas notificações…"
              iconeInicial={<Search className="h-4 w-4" />}
              className="h-9"
              aria-label="Procurar nas notificações"
            />
          </div>
          <Botao variante="secundario" onClick={() => void sincronizar()} carregando={sincronizando} title="Recalcula agora o que está atrasado ou perto de vencer">
            <RefreshCw className="h-4 w-4" />
            Conferir prazos
          </Botao>
          <Botao variante="secundario" onClick={() => setAjustes(true)}>
            <Settings className="h-4 w-4" />
            Preferências
          </Botao>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Categoria</span>
          {CATEGORIAS.map((c) => {
            const Icone = ICONE_CATEGORIA[c.valor];
            const ativa = categorias.includes(c.valor);
            return (
              <button
                key={c.valor}
                onClick={() => setCategorias((atual) => (ativa ? atual.filter((x) => x !== c.valor) : [...atual, c.valor]))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  ativa ? 'bg-marca-600 text-white ring-marca-600' : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
                )}
                title={c.descricao}
              >
                <Icone className="h-3.5 w-3.5" />
                {c.rotulo}
                {contagemCategoria[c.valor] ? (
                  <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', ativa ? 'bg-white/20' : 'bg-superficie')}>
                    {contagemCategoria[c.valor]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Prioridade</span>
          {PRIORIDADES.map((p) => {
            const ativa = prioridades.includes(p.valor);
            return (
              <button
                key={p.valor}
                onClick={() => setPrioridades((atual) => (ativa ? atual.filter((x) => x !== p.valor) : [...atual, p.valor]))}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  ativa ? COR_PRIORIDADE[p.valor] : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
                )}
              >
                {p.rotulo}
              </button>
            );
          })}
          {(categorias.length > 0 || prioridades.length > 0 || termo) && (
            <button
              onClick={() => {
                setCategorias([]);
                setPrioridades([]);
                setBusca('');
              }}
              className="ml-2 text-xs font-medium text-marca-700 hover:underline"
            >
              limpar filtros
            </button>
          )}
        </div>
      </Cartao>

      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            <input
              type="checkbox"
              checked={todasSelecionadas}
              onChange={(e) => setSelecionadas(e.target.checked ? filtradas.map((n) => n.id) : [])}
              className="h-4 w-4 rounded border-borda-forte text-marca-600"
            />
            {selecionadas.length ? `${selecionadas.length} selecionada(s)` : `${filtradas.length} notificação(ões)`}
          </label>
          {selecionadas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <Botao tamanho="sm" variante="secundario" onClick={() => void agirEmLote('lida')}>
                <Eye className="h-3.5 w-3.5" /> Marcar como lidas
              </Botao>
              <Botao tamanho="sm" variante="secundario" onClick={() => void agirEmLote('nao_lida')}>
                <EyeOff className="h-3.5 w-3.5" /> Não lidas
              </Botao>
              <Botao tamanho="sm" variante="secundario" onClick={() => void agirEmLote('concluir')}>
                <Check className="h-3.5 w-3.5" /> Concluir
              </Botao>
              {situacao === 'arquivadas' ? (
                <Botao tamanho="sm" variante="secundario" onClick={() => void agirEmLote('restaurar')}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                </Botao>
              ) : (
                <Botao tamanho="sm" variante="secundario" onClick={() => void agirEmLote('arquivar')}>
                  <Archive className="h-3.5 w-3.5" /> Fechar
                </Botao>
              )}
            </div>
          ) : (
            resumo.naoLidas > 0 && (
              <Botao tamanho="sm" variante="fantasma" onClick={() => void agirEmLote('todas_lidas', [])}>
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </Botao>
            )
          )}
        </div>
      )}

      {carregando ? (
        <Cartao className="p-10 text-center text-sm text-texto-suave">Carregando…</Cartao>
      ) : filtradas.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Bell className="h-6 w-6" />}
            titulo={situacao === 'pendentes' ? 'Nada pendente — tudo em dia' : 'Nenhuma notificação neste filtro'}
            descricao="Prazos que vencem, coisas colocadas no seu nome, menções e posts de quem você segue com o sininho aparecem aqui."
          />
        </Cartao>
      ) : (
        <div className="space-y-5">
          {grupos.map(([grupo, lista]) => (
            <section key={grupo}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-texto-fraco">{grupo}</h2>
              <Cartao className="divide-y divide-borda overflow-hidden">
                {lista.map((n) => (
                  <Linha
                    key={n.id}
                    n={n}
                    selecionada={selecionadas.includes(n.id)}
                    aoSelecionar={(v) => setSelecionadas((atual) => (v ? [...atual, n.id] : atual.filter((id) => id !== n.id)))}
                    aoAbrir={() => {
                      if (!n.lida_em) void marcarNotificacoes(supabase, [n.id], 'lida').then(avisarSino);
                      if (n.link) router.push(n.link);
                    }}
                    aoConcluir={() => void concluir(n)}
                    aoAgir={(acao) => void agirEmLote(acao, [n.id])}
                  />
                ))}
              </Cartao>
            </section>
          ))}
          {itens.length >= limite && (
            <div className="text-center">
              <Botao variante="secundario" onClick={() => setLimite((l) => l + 300)}>
                Carregar mais antigas
              </Botao>
            </div>
          )}
        </div>
      )}

      <Modal
        aberto={ajustes}
        aoFechar={() => setAjustes(false)}
        titulo="O que você quer receber"
        descricao="Categoria desligada não gera notificação nova. As que já chegaram continuam aqui."
      >
        <ul className="divide-y divide-borda">
          {CATEGORIAS.map((c) => {
            const Icone = ICONE_CATEGORIA[c.valor];
            const ativo = preferencias[c.valor] !== false;
            return (
              <li key={c.valor} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-50 text-marca-700">
                  <Icone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-texto">{c.rotulo}</p>
                  <p className="text-xs text-texto-suave">{c.descricao}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={ativo}
                  onClick={() => void alternarPreferencia(c.valor, !ativo)}
                  className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', ativo ? 'bg-marca-600' : 'bg-slate-300')}
                  aria-label={`${ativo ? 'Desligar' : 'Ligar'} ${c.rotulo}`}
                >
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', ativo ? 'translate-x-5.5' : 'translate-x-0.5')} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-superficie px-3 py-2 text-xs text-texto-suave">
          <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Para receber os posts de alguém do Fórum, abra o perfil da pessoa e ligue o sininho.
        </p>
      </Modal>
    </div>
  );
}

function Resumo({
  rotulo,
  valor,
  tom,
  aoClicar,
}: {
  rotulo: string;
  valor: number;
  tom: 'marca' | 'erro' | 'alerta' | 'sucesso' | 'neutro';
  aoClicar: () => void;
}) {
  const cores = {
    marca: 'text-marca-700',
    erro: 'text-erro',
    alerta: 'text-alerta',
    sucesso: 'text-sucesso',
    neutro: 'text-texto',
  };
  return (
    <button onClick={aoClicar} className="rounded-xl border border-borda bg-superficie-elevada p-4 text-left transition-colors hover:border-marca-300">
      <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">{rotulo}</p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums', cores[tom])}>{valor.toLocaleString('pt-BR')}</p>
    </button>
  );
}

function Linha({
  n,
  selecionada,
  aoSelecionar,
  aoAbrir,
  aoConcluir,
  aoAgir,
}: {
  n: Notificacao;
  selecionada: boolean;
  aoSelecionar: (v: boolean) => void;
  aoAbrir: () => void;
  aoConcluir: () => void;
  aoAgir: (acao: AcaoNotificacao) => void;
}) {
  const Icone = ICONE_CATEGORIA[n.categoria];
  const origem = acaoDeOrigem(n);
  const automatica = (n.dados as { resolvida_automaticamente?: boolean })?.resolvida_automaticamente;
  return (
    <div className={cn('group flex gap-3 px-4 py-3.5 transition-colors hover:bg-superficie', !n.lida_em && !n.arquivada_em && 'bg-marca-50/30', selecionada && 'bg-marca-50')}>
      <input
        type="checkbox"
        checked={selecionada}
        onChange={(e) => aoSelecionar(e.target.checked)}
        className="mt-2 h-4 w-4 shrink-0 rounded border-borda-forte text-marca-600"
        aria-label={`Selecionar ${n.titulo}`}
      />
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', COR_PRIORIDADE[n.prioridade])}>
        <Icone className="h-4 w-4" />
      </span>
      <button type="button" onClick={aoAbrir} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn('text-sm text-texto', !n.lida_em && 'font-semibold', n.concluida_em && 'line-through opacity-60')}>{n.titulo}</p>
          {(n.prioridade === 'urgente' || n.prioridade === 'alta') && !n.concluida_em && (
            <Selo tom={TOM_PRIORIDADE[n.prioridade]} className="text-[10px]">
              {n.prioridade === 'urgente' ? 'Urgente' : 'Alta'}
            </Selo>
          )}
          {n.concluida_em && (
            <Selo tom="sucesso" className="text-[10px]">
              {automatica ? 'Resolvida sozinha' : 'Concluída'}
            </Selo>
          )}
        </div>
        {n.mensagem && <p className="mt-0.5 text-sm leading-relaxed text-texto-suave">{n.mensagem}</p>}
        <p className="mt-1 text-xs text-texto-fraco">
          {rotuloCategoria(n.categoria)} · {tempoRelativo(n.created_at)}
          {n.prazo && ` · prazo ${new Date(`${n.prazo}T12:00:00`).toLocaleDateString('pt-BR')}`}
          {n.link && <span className="ml-1 text-marca-700 group-hover:underline">· abrir</span>}
        </p>
      </button>
      <div className="flex shrink-0 items-start gap-1">
        {!n.concluida_em ? (
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={aoConcluir}
            title={origem === 'calendario' ? 'Marca a obrigação como feita no calendário' : origem === 'atribuicao' ? 'Fecha o ciclo da atribuição' : 'Marcar como resolvida'}
          >
            <Check className="h-3.5 w-3.5 text-sucesso" />
            {origem ? 'Concluir tarefa' : 'Concluir'}
          </Botao>
        ) : (
          <Botao variante="fantasma" tamanho="icone" onClick={() => aoAgir('reabrir')} title="Reabrir" aria-label="Reabrir">
            <Undo2 className="h-4 w-4" />
          </Botao>
        )}
        {n.arquivada_em ? (
          <Botao variante="fantasma" tamanho="icone" onClick={() => aoAgir('restaurar')} title="Restaurar" aria-label="Restaurar">
            <ArchiveRestore className="h-4 w-4" />
          </Botao>
        ) : (
          <Botao variante="fantasma" tamanho="icone" onClick={() => aoAgir('arquivar')} title="Fechar (sai da lista)" aria-label="Fechar">
            <Archive className="h-4 w-4" />
          </Botao>
        )}
        <Botao
          variante="fantasma"
          tamanho="icone"
          onClick={() => aoAgir(n.lida_em ? 'nao_lida' : 'lida')}
          title={n.lida_em ? 'Marcar como não lida' : 'Marcar como lida'}
          aria-label={n.lida_em ? 'Marcar como não lida' : 'Marcar como lida'}
        >
          {n.lida_em ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Botao>
      </div>
    </div>
  );
}
