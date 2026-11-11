'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, CalendarClock, Filter, KanbanSquare, List, Plus, Search, Settings2, Target, UserRound } from 'lucide-react';

import { ConfigEtapas } from '@/app/(portal)/prospeccao/ConfigEtapas';
import { PainelComercial } from '@/app/(portal)/prospeccao/PainelComercial';
import { PainelLead } from '@/app/(portal)/prospeccao/PainelLead';
import { AvatarPessoa } from '@/components/equipe/Pessoas';
import { Botao, Campo, Cartao, EstadoVazio, Modal, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { CampoOpcoes } from '@/components/ui/CampoOpcoes';
import { hojeIso } from '@/lib/atribuicoes';
import { CAMPOS_LEAD, dataBr, diasDesde, moeda, moedaCompacta, textoBuscaLead } from '@/lib/prospeccao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { ordemEntre } from '@/lib/tarefas';
import type { EtapaProspeccao, Lead, PessoaEquipe } from '@/types/banco';

export interface PermissoesProspeccao {
  editar: boolean;
  excluir: boolean;
  etapas: boolean;
  opcoes: boolean;
  integracao: boolean;
}

type Aba = 'funil' | 'painel' | 'lista';

export function ProspeccaoApp({
  meuId,
  permissoes,
  etapasIniciais,
  leadsIniciais,
  pessoas,
  abrirId,
  abaInicial,
}: {
  meuId: string;
  permissoes: PermissoesProspeccao;
  etapasIniciais: EtapaProspeccao[];
  leadsIniciais: Lead[];
  pessoas: PessoaEquipe[];
  abrirId: string | null;
  abaInicial: Aba;
}) {
  const { avisar } = useAvisos();
  const router = useRouter();
  const [etapas, setEtapas] = useState(etapasIniciais);
  const [leads, setLeads] = useState(leadsIniciais);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [busca, setBusca] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [origem, setOrigem] = useState('');
  const [aberto, setAberto] = useState<string | null>(abrirId);
  const [novo, setNovo] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ etapa: string; indice: number } | null>(null);
  const [perda, setPerda] = useState<{ lead: Lead; etapa: EtapaProspeccao; ordem: number } | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const hoje = hojeIso();

  const carregar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const [{ data: e }, { data: l }] = await Promise.all([
      supabase.from('prospeccao_etapas').select('*').order('ordem'),
      supabase.from('prospeccao_leads').select(CAMPOS_LEAD).order('ordem'),
    ]);
    if (e) setEtapas(e as EtapaProspeccao[]);
    if (l) setLeads(l as unknown as Lead[]);
    setVersao((v) => v + 1);
  }, []);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel('prospeccao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospeccao_leads' }, () => {
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => void carregar(), 400);
      })
      .subscribe();
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  const ativas = useMemo(() => etapas.filter((e) => e.ativo), [etapas]);
  const origens = useMemo(() => Array.from(new Set(leads.map((l) => l.origem).filter(Boolean) as string[])).sort(), [leads]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (termo && !textoBuscaLead(l).includes(termo)) return false;
      if (responsavel === 'sem' ? l.responsavel_id : responsavel && l.responsavel_id !== responsavel) return false;
      if (origem && l.origem !== origem) return false;
      return true;
    });
  }, [leads, busca, responsavel, origem]);

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const e of etapas) mapa.set(e.id, []);
    for (const l of filtrados) mapa.get(l.etapa_id)?.push(l);
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [filtrados, etapas]);

  async function aplicarMovimento(lead: Lead, etapa: EtapaProspeccao, ordem: number, motivoPerda?: string | null) {
    const anterior = leads;
    setLeads((lista) => lista.map((l) => (l.id === lead.id ? { ...l, etapa_id: etapa.id, ordem } : l)));
    const { error } = await criarClienteNavegador()
      .from('prospeccao_leads')
      .update({ etapa_id: etapa.id, ordem, ...(etapa.tipo === 'perdida' ? { motivo_perda: motivoPerda ?? null } : {}) })
      .eq('id', lead.id);
    if (error) {
      setLeads(anterior);
      avisar('erro', `Não foi possível mover: ${error.message}`);
      return;
    }
    if (etapa.tipo === 'ganha' && lead.etapa_id !== etapa.id) avisar('sucesso', `${lead.empresa} convertido em cliente. Parabéns!`);
    void carregar();
  }

  function mover(id: string, etapaId: string, indice: number) {
    const lead = leads.find((l) => l.id === id);
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!lead || !etapa) return;
    if (!permissoes.editar) {
      avisar('alerta', 'Você pode consultar o funil, mas não tem permissão para mover leads.');
      return;
    }
    const destino = (porEtapa.get(etapaId) ?? []).filter((l) => l.id !== id);
    const ordem = ordemEntre(destino[indice - 1]?.ordem, destino[indice]?.ordem);
    if (lead.etapa_id === etapaId && lead.ordem === ordem) return;
    // Perder uma oportunidade sem dizer o motivo esvazia o indicador que mais ensina.
    if (etapa.tipo === 'perdida' && lead.etapa_id !== etapaId) {
      setMotivo(lead.motivo_perda);
      setPerda({ lead, etapa, ordem });
      return;
    }
    void aplicarMovimento(lead, etapa, ordem);
  }

  function fechar() {
    setAberto(null);
    setNovo(null);
    router.replace('/prospeccao', { scroll: false });
    void carregar();
  }

  const abertos = filtrados.filter((l) => etapas.find((e) => e.id === l.etapa_id)?.tipo === 'aberta');
  const temFiltro = Boolean(busca || responsavel || origem);
  const primeiraEtapa = ativas.find((e) => e.tipo === 'aberta') ?? ativas[0];

  return (
    <div className="space-y-5">
      <Cartao className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg border border-borda-forte bg-white p-0.5" role="tablist" aria-label="Visão">
          {([['funil', KanbanSquare, 'Funil'], ['painel', BarChart3, 'Indicadores'], ['lista', List, 'Lista']] as const).map(([v, Icone, rotulo]) => (
            <button
              key={v}
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', aba === v ? 'bg-marca-700 text-white shadow-sm' : 'text-texto-suave hover:text-texto')}
            >
              <Icone className="h-4 w-4" /> {rotulo}
            </button>
          ))}
        </div>

        {aba !== 'painel' && (
          <>
            <div className="min-w-[200px] flex-1">
              <Campo placeholder="Buscar empresa, contato, CNPJ, cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} iconeInicial={<Search className="h-4 w-4" />} aria-label="Buscar leads" />
            </div>
            <div className="w-44">
              <Selecao aria-label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">Todos os responsáveis</option>
                <option value={meuId}>Meus leads</option>
                <option value="sem">Sem responsável</option>
                {pessoas.filter((p) => p.id !== meuId).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Selecao>
            </div>
            {origens.length > 0 && (
              <div className="w-40">
                <Selecao aria-label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
                  <option value="">Todas as origens</option>
                  {origens.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Selecao>
              </div>
            )}
            {temFiltro && (
              <Botao variante="fantasma" tamanho="sm" onClick={() => { setBusca(''); setResponsavel(''); setOrigem(''); }}>
                <Filter className="h-3.5 w-3.5" /> Limpar
              </Botao>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {permissoes.etapas && (
            <Botao variante="secundario" onClick={() => setConfigurando(true)} title="Renomear, reordenar, criar ou desativar etapas do funil">
              <Settings2 className="h-4 w-4" /> Etapas
            </Botao>
          )}
          {permissoes.editar && primeiraEtapa && (
            <Botao onClick={() => setNovo(primeiraEtapa.id)}>
              <Plus className="h-4 w-4" /> Novo lead
            </Botao>
          )}
        </div>
      </Cartao>

      {aba === 'painel' ? (
        <PainelComercial versao={versao} aoAbrirLead={(id) => setAberto(id)} />
      ) : leads.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Target className="h-6 w-6" />}
            titulo="Nenhum lead cadastrado"
            descricao="Cadastre a primeira oportunidade para começar a acompanhar o funil. Os indicadores aparecem conforme os leads reais avançam — nada aqui é dado de exemplo."
            acao={permissoes.editar && primeiraEtapa ? <Botao onClick={() => setNovo(primeiraEtapa.id)}><Plus className="h-4 w-4" /> Novo lead</Botao> : undefined}
          />
        </Cartao>
      ) : aba === 'funil' ? (
        <>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-suave">
            <span><strong className="font-semibold text-texto">{abertos.length}</strong> oportunidade(s) em aberto</span>
            <span><strong className="font-semibold text-texto">{moeda(abertos.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0))}</strong> em negociação (honorário mensal estimado)</span>
            {permissoes.editar && <span className="text-texto-fraco">Arraste os cartões entre as etapas.</span>}
          </p>
          <div className="-mx-5 overflow-x-auto px-5 pb-3 sm:-mx-7 sm:px-7">
            <div className="flex min-w-max gap-3">
              {ativas.map((etapa) => {
                const lista = porEtapa.get(etapa.id) ?? [];
                const total = lista.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0);
                const recebendo = arrastando && alvo?.etapa === etapa.id;
                return (
                  <section
                    key={etapa.id}
                    aria-label={etapa.nome}
                    onDragOver={(e) => {
                      if (!arrastando) return;
                      e.preventDefault();
                      const cartoes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-lead]')).filter((el) => el.dataset.lead !== arrastando);
                      let indice = cartoes.length;
                      for (let i = 0; i < cartoes.length; i++) {
                        const r = cartoes[i].getBoundingClientRect();
                        if (e.clientY < r.top + r.height / 2) { indice = i; break; }
                      }
                      if (alvo?.etapa !== etapa.id || alvo.indice !== indice) setAlvo({ etapa: etapa.id, indice });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = arrastando;
                      const indice = alvo?.etapa === etapa.id ? alvo.indice : lista.length;
                      setArrastando(null);
                      setAlvo(null);
                      if (id) mover(id, etapa.id, indice);
                    }}
                    className={cn('flex w-[280px] shrink-0 flex-col rounded-xl border border-borda bg-superficie transition-colors', recebendo && 'border-marca-400 ring-2 ring-marca-100')}
                  >
                    <header className="rounded-t-xl border-b border-borda bg-white px-3 py-2.5" style={{ boxShadow: `inset 0 3px 0 ${etapa.cor}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold text-texto" title={etapa.nome}>{etapa.nome}</h2>
                        <span className="rounded-full bg-superficie px-2 py-0.5 text-[11px] font-semibold tabular-nums text-texto-suave">{lista.length}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-texto-fraco">{total > 0 ? moedaCompacta(total) : 'sem valor estimado'}</p>
                    </header>
                    <div className="flex min-h-28 flex-1 flex-col gap-2 p-2">
                      {lista.map((l, i) => (
                        <div key={l.id}>
                          {recebendo && alvo?.indice === i && arrastando !== l.id && <div className="mb-2 h-1 rounded-full bg-marca-400" aria-hidden />}
                          <CartaoLead
                            lead={l}
                            etapa={etapa}
                            hoje={hoje}
                            responsavel={pessoas.find((p) => p.id === l.responsavel_id)}
                            arrastavel={permissoes.editar}
                            esmaecido={arrastando === l.id}
                            aoAbrir={() => setAberto(l.id)}
                            aoArrastar={(inicio) => { setArrastando(inicio ? l.id : null); if (!inicio) setAlvo(null); }}
                          />
                        </div>
                      ))}
                      {lista.length === 0 && (
                        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-xs text-texto-fraco">
                          {arrastando ? 'Solte aqui' : 'Nenhum lead nesta etapa'}
                        </p>
                      )}
                    </div>
                    {permissoes.editar && etapa.tipo === 'aberta' && (
                      <button onClick={() => setNovo(etapa.id)} className="mx-2 mb-2 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-texto-suave hover:bg-white hover:text-marca-700">
                        <Plus className="h-3.5 w-3.5" /> Adicionar lead
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
                <th className="px-4 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Etapa</th>
                <th className="px-3 py-2.5">Responsável</th>
                <th className="px-3 py-2.5">Origem</th>
                <th className="px-3 py-2.5 text-right">Valor estimado</th>
                <th className="px-3 py-2.5">Último contato</th>
                <th className="px-3 py-2.5">Próxima ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l) => {
                const etapa = etapas.find((e) => e.id === l.etapa_id);
                const atrasada = etapa?.tipo === 'aberta' && l.proxima_acao_em && l.proxima_acao_em < hoje;
                return (
                  <tr key={l.id} onClick={() => setAberto(l.id)} className="cursor-pointer border-b border-borda last:border-0 hover:bg-superficie">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-texto">{l.empresa}</span>
                      <span className="block text-xs text-texto-fraco">{[l.contato, l.cidade && `${l.cidade}${l.uf ? `/${l.uf}` : ''}`].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-texto"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: etapa?.cor }} />{etapa?.nome}</span>
                    </td>
                    <td className="px-3 py-2.5 text-texto-suave">{pessoas.find((p) => p.id === l.responsavel_id)?.nome ?? '—'}</td>
                    <td className="px-3 py-2.5 text-texto-suave">{l.origem ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{moeda(l.valor_estimado)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-texto-suave">{dataBr(l.ultimo_contato_em)}</td>
                    <td className={cn('px-3 py-2.5 tabular-nums', atrasada ? 'font-semibold text-erro' : 'text-texto-suave')}>{dataBr(l.proxima_acao_em)}</td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-texto-fraco">Nenhum lead com estes filtros.</td></tr>}
            </tbody>
          </table>
        </Cartao>
      )}

      {(aberto || novo) && (
        <PainelLead
          key={aberto ?? `novo-${novo}`}
          leadId={aberto}
          etapaInicial={novo ?? primeiraEtapa?.id ?? ''}
          ordemInicial={ordemEntre(undefined, (porEtapa.get(novo ?? '') ?? [])[0]?.ordem)}
          meuId={meuId}
          permissoes={permissoes}
          etapas={ativas}
          todasEtapas={etapas}
          pessoas={pessoas}
          aoFechar={fechar}
          aoCriar={(id) => { setNovo(null); setAberto(id); void carregar(); }}
          aoMudar={() => void carregar()}
        />
      )}

      {configurando && <ConfigEtapas etapas={etapas} leads={leads} aoFechar={() => { setConfigurando(false); void carregar(); }} />}

      <Modal
        aberto={Boolean(perda)}
        aoFechar={() => setPerda(null)}
        titulo="Registrar oportunidade perdida"
        descricao={perda ? `${perda.lead.empresa} → ${perda.etapa.nome}` : undefined}
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setPerda(null)}>Cancelar</Botao>
            <Botao
              disabled={!motivo}
              onClick={() => {
                if (!perda) return;
                void aplicarMovimento(perda.lead, perda.etapa, perda.ordem, motivo);
                setPerda(null);
              }}
            >
              Confirmar perda
            </Botao>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-texto-suave">Informe o motivo. É ele que alimenta o indicador de motivos de perda e ajuda a melhorar a abordagem.</p>
          <CampoOpcoes grupo="lead_motivo_perda" rotulo="Motivo da perda" valor={motivo} aoMudar={setMotivo} podeGerenciar={permissoes.opcoes} autoFocus />
        </div>
      </Modal>
    </div>
  );
}

function CartaoLead({
  lead: l,
  etapa,
  hoje,
  responsavel,
  arrastavel,
  esmaecido,
  aoAbrir,
  aoArrastar,
}: {
  lead: Lead;
  etapa: EtapaProspeccao;
  hoje: string;
  responsavel?: PessoaEquipe;
  arrastavel: boolean;
  esmaecido: boolean;
  aoAbrir: () => void;
  aoArrastar: (inicio: boolean) => void;
}) {
  const aberta = etapa.tipo === 'aberta';
  const atrasada = aberta && l.proxima_acao_em && l.proxima_acao_em < hoje;
  const semAcao = aberta && !l.proxima_acao_em;
  const parado = diasDesde(l.etapa_desde);

  return (
    <article
      data-lead={l.id}
      draggable={arrastavel}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; aoArrastar(true); }}
      onDragEnd={() => aoArrastar(false)}
      onClick={aoAbrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAbrir(); } }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir lead ${l.empresa}`}
      className={cn(
        'rounded-lg border border-borda bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-marca-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-marca-500',
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        esmaecido && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-texto">{l.empresa}</h3>
        {responsavel ? <AvatarPessoa pessoa={responsavel} tamanho="sm" /> : <span title="Sem responsável"><UserRound className="h-4 w-4 text-texto-fraco" /></span>}
      </div>
      {(l.contato || l.segmento) && <p className="mt-0.5 truncate text-xs text-texto-suave">{[l.contato, l.segmento].filter(Boolean).join(' · ')}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {l.valor_estimado != null && <Selo tom="neutro" className="tabular-nums">{moeda(l.valor_estimado)}</Selo>}
        {l.origem && <Selo tom="marca" className="text-[10px]">{l.origem}</Selo>}
        {etapa.tipo === 'perdida' && l.motivo_perda && <Selo tom="erro" className="text-[10px]">{l.motivo_perda}</Selo>}
      </div>

      {aberta && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-borda pt-2 text-[11px]">
          {atrasada ? (
            <span className="inline-flex items-center gap-1 font-semibold text-erro"><AlertTriangle className="h-3 w-3" /> Ação atrasada · {dataBr(l.proxima_acao_em).slice(0, 5)}</span>
          ) : semAcao ? (
            <span className="inline-flex items-center gap-1 font-medium text-alerta"><AlertTriangle className="h-3 w-3" /> Sem próxima ação</span>
          ) : (
            <span className={cn('inline-flex items-center gap-1 text-texto-suave', l.proxima_acao_em === hoje && 'font-semibold text-alerta')}>
              <CalendarClock className="h-3 w-3" /> {l.proxima_acao_em === hoje ? 'Hoje' : dataBr(l.proxima_acao_em).slice(0, 5)}
            </span>
          )}
          {parado !== null && <span className="text-texto-fraco" title="Tempo nesta etapa">{parado === 0 ? 'hoje' : `${parado} d na etapa`}</span>}
        </div>
      )}
    </article>
  );
}
