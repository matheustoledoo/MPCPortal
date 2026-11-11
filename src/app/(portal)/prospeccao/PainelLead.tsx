'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import {
  ArrowRightLeft,
  Building2,
  CalendarPlus,
  Check,
  FileText,
  Handshake,
  Mail,
  MapPin,
  MessageCircle,
  NotebookPen,
  Phone,
  Trash2,
  Users,
} from 'lucide-react';

import type { PermissoesProspeccao } from '@/app/(portal)/prospeccao/ProspeccaoApp';
import { SeletorPessoas } from '@/components/equipe/Pessoas';
import { AreaTexto, Botao, Campo, Carregando, Modal, ModalConfirmacao, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { CampoOpcoes } from '@/components/ui/CampoOpcoes';
import { hojeIso } from '@/lib/atribuicoes';
import { mascararCnpj, mascararTelefone } from '@/lib/mascaras';
import { tempoRelativo } from '@/lib/notificacoes';
import { CAMPOS_LEAD, TIPOS_ATIVIDADE, UFS, dataBr, linkWhatsApp, moeda, rotuloAtividade } from '@/lib/prospeccao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AtividadeLead, EtapaProspeccao, Lead, PessoaEquipe, TipoAtividadeLead } from '@/types/banco';

const ICONES: Record<TipoAtividadeLead, typeof Phone> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reuniao: Users,
  visita: MapPin,
  proposta: FileText,
  nota: NotebookPen,
  etapa: ArrowRightLeft,
};

type Ficha = Pick<
  Lead,
  'empresa' | 'cnpj' | 'segmento' | 'contato' | 'telefone' | 'whatsapp' | 'email' | 'cidade' | 'uf' | 'origem' | 'responsavel_id' | 'data_entrada' | 'observacoes' | 'etapa_id' | 'valor_estimado' | 'motivo_perda'
>;

const numero = (texto: string): number | null => {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(limpo);
  return limpo && Number.isFinite(n) ? n : null;
};

export function PainelLead({
  leadId,
  etapaInicial,
  ordemInicial,
  meuId,
  permissoes,
  etapas,
  todasEtapas,
  pessoas,
  aoFechar,
  aoCriar,
  aoMudar,
}: {
  leadId: string | null;
  etapaInicial: string;
  ordemInicial: number;
  meuId: string;
  permissoes: PermissoesProspeccao;
  etapas: EtapaProspeccao[];
  todasEtapas: EtapaProspeccao[];
  pessoas: PessoaEquipe[];
  aoFechar: () => void;
  aoCriar: (id: string) => void;
  aoMudar: () => void;
}) {
  const { avisar } = useAvisos();
  const [lead, setLead] = useState<Lead | null>(null);
  const [ficha, setFicha] = useState<Ficha>({
    empresa: '', cnpj: null, segmento: null, contato: null, telefone: null, whatsapp: null, email: null, cidade: null, uf: null,
    origem: null, responsavel_id: meuId, data_entrada: hojeIso(), observacoes: '', etapa_id: etapaInicial, valor_estimado: null, motivo_perda: null,
  });
  const [valorTexto, setValorTexto] = useState('');
  const [atividades, setAtividades] = useState<AtividadeLead[]>([]);
  const [carregando, setCarregando] = useState(Boolean(leadId));
  const [ausente, setAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [excluir, setExcluir] = useState(false);

  // Compositor de atividade
  const [modo, setModo] = useState<'registrar' | 'agendar'>('registrar');
  const [tipo, setTipo] = useState<Exclude<TipoAtividadeLead, 'etapa'>>('ligacao');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeIso());
  const [hora, setHora] = useState('');
  const [valorProposta, setValorProposta] = useState('');
  const [concluindo, setConcluindo] = useState<AtividadeLead | null>(null);
  const [resultado, setResultado] = useState('');

  const carregar = useCallback(async () => {
    if (!leadId) return;
    const supabase = criarClienteNavegador();
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.from('prospeccao_leads').select(CAMPOS_LEAD).eq('id', leadId).maybeSingle(),
      supabase.from('prospeccao_atividades').select('*').eq('lead_id', leadId).order('data', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (!l) setAusente(true);
    else {
      const atual = l as unknown as Lead;
      setLead(atual);
      setFicha(atual);
      setValorTexto(atual.valor_estimado != null ? String(atual.valor_estimado).replace('.', ',') : '');
      setAlterado(false);
    }
    setAtividades((a ?? []) as AtividadeLead[]);
    setCarregando(false);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const edita = permissoes.editar;
  const etapaAtual = todasEtapas.find((e) => e.id === ficha.etapa_id);
  const mudarFicha = (patch: Partial<Ficha>) => {
    setFicha((f) => ({ ...f, ...patch }));
    setAlterado(true);
  };

  async function salvar() {
    if (!ficha.empresa.trim()) {
      avisar('alerta', 'Informe o nome da empresa.');
      return;
    }
    if (ficha.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ficha.email)) {
      avisar('alerta', 'O e-mail informado não parece válido.');
      return;
    }
    if (etapaAtual?.tipo === 'perdida' && !ficha.motivo_perda) {
      avisar('alerta', 'Informe o motivo da perda.');
      return;
    }
    setSalvando(true);
    const supabase = criarClienteNavegador();
    const dados = { ...ficha, empresa: ficha.empresa.trim(), valor_estimado: numero(valorTexto), email: ficha.email?.trim().toLowerCase() || null };
    if (lead) {
      const { error } = await supabase.from('prospeccao_leads').update(dados).eq('id', lead.id);
      setSalvando(false);
      if (error) return avisar('erro', `Não foi possível salvar: ${error.message}`);
      avisar('sucesso', 'Lead atualizado.');
      aoMudar();
      void carregar();
    } else {
      const { data: criado, error } = await supabase.from('prospeccao_leads').insert({ ...dados, ordem: ordemInicial, criado_por: meuId }).select('id').single();
      setSalvando(false);
      if (error || !criado) return avisar('erro', `Não foi possível cadastrar: ${error?.message ?? 'erro desconhecido'}`);
      avisar('sucesso', 'Lead cadastrado. Registre o primeiro contato ou agende a próxima ação.');
      aoCriar((criado as { id: string }).id);
    }
  }

  async function adicionarAtividade() {
    if (!lead) return;
    if (modo === 'agendar' && !data) return avisar('alerta', 'Escolha a data da próxima ação.');
    if (modo === 'registrar' && !descricao.trim()) return avisar('alerta', 'Descreva o que aconteceu neste contato.');
    const agendar = modo === 'agendar';
    const { error } = await criarClienteNavegador().from('prospeccao_atividades').insert({
      lead_id: lead.id,
      tipo,
      descricao: descricao.trim(),
      data: agendar ? data : data || hojeIso(),
      hora: agendar && hora ? hora : null,
      agendada: agendar,
      concluida: !agendar,
      valor: tipo === 'proposta' ? numero(valorProposta) : null,
      responsavel_id: lead.responsavel_id ?? meuId,
    });
    if (error) return avisar('erro', `Não foi possível registrar: ${error.message}`);
    avisar('sucesso', agendar ? 'Ação agendada. Ela já está no calendário do responsável.' : 'Contato registrado no histórico.');
    setDescricao('');
    setHora('');
    setValorProposta('');
    setData(hojeIso());
    void carregar();
    aoMudar();
  }

  async function concluirAtividade() {
    if (!concluindo) return;
    const { error } = await criarClienteNavegador()
      .from('prospeccao_atividades')
      .update({ concluida: true, resultado: resultado.trim() || null })
      .eq('id', concluindo.id);
    if (error) return avisar('erro', `Não foi possível concluir: ${error.message}`);
    setConcluindo(null);
    setResultado('');
    void carregar();
    aoMudar();
  }

  async function apagarAtividade(a: AtividadeLead) {
    const { error } = await criarClienteNavegador().from('prospeccao_atividades').delete().eq('id', a.id);
    if (error) return avisar('erro', 'Só quem registrou (ou quem pode excluir na Prospecção) remove este item.');
    void carregar();
    aoMudar();
  }

  async function apagarLead() {
    if (!lead) return;
    const { error } = await criarClienteNavegador().from('prospeccao_leads').delete().eq('id', lead.id);
    if (error) return avisar('erro', `Não foi possível excluir: ${error.message}`);
    avisar('sucesso', 'Lead excluído.');
    aoFechar();
  }

  const pendentes = atividades.filter((a) => !a.concluida).sort((a, b) => a.data.localeCompare(b.data));
  const feitas = atividades.filter((a) => a.concluida);
  const propostas = atividades.filter((a) => a.tipo === 'proposta');
  const zap = linkWhatsApp(ficha.whatsapp || ficha.telefone);
  const hoje = hojeIso();

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        largura="xl"
        titulo={lead ? lead.empresa : 'Novo lead'}
        descricao={
          lead
            ? `No funil desde ${dataBr(lead.data_entrada)} · último contato ${lead.ultimo_contato_em ? dataBr(lead.ultimo_contato_em) : 'ainda não registrado'}`
            : 'Cadastre a oportunidade. O histórico e as próximas ações ficam disponíveis logo depois de salvar.'
        }
        rodape={
          <>
            {lead && permissoes.excluir && (
              <Botao variante="fantasma" className="mr-auto text-erro hover:bg-erro-suave hover:text-erro" onClick={() => setExcluir(true)}>
                <Trash2 className="h-4 w-4" /> Excluir lead
              </Botao>
            )}
            <Botao variante="secundario" onClick={aoFechar}>{alterado ? 'Descartar' : 'Fechar'}</Botao>
            {edita && (!lead || alterado) && (
              <Botao onClick={() => void salvar()} carregando={salvando}>{lead ? 'Salvar alterações' : 'Cadastrar lead'}</Botao>
            )}
          </>
        }
      >
        {carregando ? (
          <Carregando />
        ) : ausente ? (
          <p className="py-10 text-center text-sm text-texto-suave">Este lead não existe mais ou você não tem acesso a ele.</p>
        ) : (
          <div className={cn('grid gap-6', lead && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
            {/* Ficha */}
            <div className="space-y-4">
              {lead && etapaAtual?.tipo === 'ganha' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sucesso-suave px-3 py-2.5 text-sm text-sucesso">
                  <span className="flex items-center gap-2 font-medium"><Handshake className="h-4 w-4" /> Cliente convertido em {dataBr(lead.convertido_em)}</span>
                  {permissoes.integracao && (
                    <Link href="/integracao-clientes" className="text-xs font-semibold underline underline-offset-2">Abrir Integração de Clientes</Link>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Campo rotulo="Empresa *" value={ficha.empresa} disabled={!edita} autoFocus={!lead} maxLength={200} onChange={(e) => mudarFicha({ empresa: e.target.value })} iconeInicial={<Building2 className="h-4 w-4" />} />
                </div>
                <Campo rotulo="CNPJ" value={mascararCnpj(ficha.cnpj ?? '')} disabled={!edita} inputMode="numeric" placeholder="Quando disponível" onChange={(e) => mudarFicha({ cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) || null })} />
                <CampoOpcoes grupo="lead_segmento" rotulo="Segmento" valor={ficha.segmento} aoMudar={(v) => mudarFicha({ segmento: v })} podeGerenciar={permissoes.opcoes} desabilitado={!edita} permiteLivre />
                <Campo rotulo="Nome do contato" value={ficha.contato ?? ''} disabled={!edita} maxLength={160} onChange={(e) => mudarFicha({ contato: e.target.value || null })} />
                <Campo rotulo="E-mail" type="email" value={ficha.email ?? ''} disabled={!edita} maxLength={200} onChange={(e) => mudarFicha({ email: e.target.value || null })} />
                <Campo rotulo="Telefone" value={mascararTelefone(ficha.telefone ?? '')} disabled={!edita} inputMode="tel" onChange={(e) => mudarFicha({ telefone: e.target.value.replace(/\D/g, '').slice(0, 11) || null })} />
                <Campo rotulo="WhatsApp" value={mascararTelefone(ficha.whatsapp ?? '')} disabled={!edita} inputMode="tel" onChange={(e) => mudarFicha({ whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11) || null })} />
                <Campo rotulo="Cidade" value={ficha.cidade ?? ''} disabled={!edita} maxLength={120} onChange={(e) => mudarFicha({ cidade: e.target.value || null })} />
                <Selecao rotulo="Estado" value={ficha.uf ?? ''} disabled={!edita} onChange={(e) => mudarFicha({ uf: e.target.value || null })}>
                  <option value="">—</option>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </Selecao>
                <CampoOpcoes grupo="lead_origem" rotulo="Origem do lead" valor={ficha.origem} aoMudar={(v) => mudarFicha({ origem: v })} podeGerenciar={permissoes.opcoes} desabilitado={!edita} />
                <Campo rotulo="Data de entrada" type="date" value={ficha.data_entrada} disabled={!edita} onChange={(e) => mudarFicha({ data_entrada: e.target.value || hojeIso() })} />
                <Selecao rotulo="Etapa do funil" value={ficha.etapa_id} disabled={!edita} onChange={(e) => mudarFicha({ etapa_id: e.target.value })}>
                  {(etapas.some((e) => e.id === ficha.etapa_id) ? etapas : [...etapas, ...todasEtapas.filter((e) => e.id === ficha.etapa_id)]).map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </Selecao>
                <Campo
                  rotulo="Honorário mensal estimado (R$)"
                  value={valorTexto}
                  disabled={!edita}
                  inputMode="decimal"
                  placeholder="Ex.: 1.200,00"
                  onChange={(e) => { setValorTexto(e.target.value); setAlterado(true); }}
                />
                {etapaAtual?.tipo === 'perdida' && (
                  <div className="sm:col-span-2">
                    <CampoOpcoes grupo="lead_motivo_perda" rotulo="Motivo da perda *" valor={ficha.motivo_perda} aoMudar={(v) => mudarFicha({ motivo_perda: v })} podeGerenciar={permissoes.opcoes} desabilitado={!edita} />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <SeletorPessoas rotulo="Responsável pela prospecção" pessoas={pessoas} selecionadas={ficha.responsavel_id ? [ficha.responsavel_id] : []} multiplo={false} desabilitado={!edita} vazio="Sem responsável" aoMudar={(ids) => mudarFicha({ responsavel_id: ids[0] ?? null })} />
                </div>
                <div className="sm:col-span-2">
                  <AreaTexto rotulo="Observações" rows={3} value={ficha.observacoes} disabled={!edita} maxLength={4000} onChange={(e) => mudarFicha({ observacoes: e.target.value })} />
                </div>
              </div>

              {lead && (zap || ficha.telefone || ficha.email) && (
                <div className="flex flex-wrap gap-2">
                  {zap && <a href={zap} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-borda-forte bg-white px-3 py-1.5 text-xs font-medium text-texto hover:border-marca-300"><MessageCircle className="h-3.5 w-3.5 text-sucesso" /> Abrir WhatsApp</a>}
                  {ficha.telefone && <a href={`tel:${ficha.telefone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-borda-forte bg-white px-3 py-1.5 text-xs font-medium text-texto hover:border-marca-300"><Phone className="h-3.5 w-3.5 text-info" /> Ligar</a>}
                  {ficha.email && <a href={`mailto:${ficha.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-borda-forte bg-white px-3 py-1.5 text-xs font-medium text-texto hover:border-marca-300"><Mail className="h-3.5 w-3.5 text-marca-600" /> Enviar e-mail</a>}
                </div>
              )}
            </div>

            {/* Acompanhamento */}
            {lead && (
              <div className="min-w-0 space-y-5 lg:border-l lg:border-borda lg:pl-6">
                {edita && (
                  <section className="rounded-xl border border-borda bg-superficie p-3">
                    <div className="mb-3 flex rounded-lg bg-white p-0.5 ring-1 ring-borda" role="tablist">
                      {([['registrar', NotebookPen, 'Registrar contato'], ['agendar', CalendarPlus, 'Agendar próxima ação']] as const).map(([v, Icone, rotulo]) => (
                        <button key={v} role="tab" aria-selected={modo === v} onClick={() => setModo(v)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium', modo === v ? 'bg-marca-50 text-marca-800' : 'text-texto-suave hover:text-texto')}>
                          <Icone className="h-3.5 w-3.5" /> {rotulo}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Selecao aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                        {TIPOS_ATIVIDADE.filter((t) => modo === 'registrar' || t.valor !== 'nota').map((t) => (
                          <option key={t.valor} value={t.valor}>{modo === 'agendar' ? t.verbo : t.rotulo}</option>
                        ))}
                      </Selecao>
                      <Campo aria-label="Data" type="date" value={data} min={modo === 'agendar' ? hoje : undefined} max={modo === 'registrar' ? hoje : undefined} onChange={(e) => setData(e.target.value)} />
                      {modo === 'agendar' ? (
                        <Campo aria-label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                      ) : tipo === 'proposta' ? (
                        <Campo aria-label="Valor da proposta" placeholder="Valor (R$)" inputMode="decimal" value={valorProposta} onChange={(e) => setValorProposta(e.target.value)} />
                      ) : <span />}
                    </div>
                    {modo === 'agendar' && tipo === 'proposta' && (
                      <Campo className="mt-2" aria-label="Valor da proposta" placeholder="Valor da proposta (R$), se já souber" inputMode="decimal" value={valorProposta} onChange={(e) => setValorProposta(e.target.value)} />
                    )}
                    <AreaTexto className="mt-2 bg-white" rows={2} value={descricao} maxLength={2000} onChange={(e) => setDescricao(e.target.value)} placeholder={modo === 'agendar' ? 'O que precisa ser feito? (opcional)' : 'O que foi conversado, combinado ou enviado?'} aria-label="Descrição" />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-texto-fraco">{modo === 'agendar' ? 'Entra no calendário e notifica o responsável.' : 'Fica no histórico e atualiza o último contato.'}</p>
                      <Botao tamanho="sm" onClick={() => void adicionarAtividade()}>{modo === 'agendar' ? 'Agendar' : 'Registrar'}</Botao>
                    </div>
                  </section>
                )}

                {pendentes.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">Próximas ações</h3>
                    <ul className="space-y-2">
                      {pendentes.map((a) => {
                        const Icone = ICONES[a.tipo];
                        const atrasada = a.data < hoje;
                        return (
                          <li key={a.id} className={cn('flex items-start gap-2.5 rounded-lg border bg-white p-2.5', atrasada ? 'border-red-200' : 'border-borda')}>
                            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', atrasada ? 'bg-erro-suave text-erro' : 'bg-info-suave text-info')}><Icone className="h-3.5 w-3.5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-texto">
                                {rotuloAtividade(a.tipo)} · <span className={cn('tabular-nums', atrasada && 'text-erro')}>{dataBr(a.data)}{a.hora ? ` às ${a.hora.slice(0, 5)}` : ''}</span>
                                {atrasada && <Selo tom="erro" className="ml-2 text-[10px]">Atrasada</Selo>}
                              </p>
                              {a.descricao && <p className="mt-0.5 whitespace-pre-wrap text-xs text-texto-suave">{a.descricao}</p>}
                            </div>
                            {edita && (
                              <div className="flex shrink-0 gap-1">
                                <Botao variante="sutil" tamanho="sm" onClick={() => { setConcluindo(a); setResultado(''); }}><Check className="h-3.5 w-3.5" /> Concluir</Botao>
                                <button onClick={() => void apagarAtividade(a)} className="rounded p-1.5 text-texto-fraco hover:bg-erro-suave hover:text-erro" aria-label="Remover ação"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {propostas.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">Propostas</h3>
                    <ul className="divide-y divide-borda rounded-lg border border-borda bg-white">
                      {propostas.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-texto-suave"><span className="tabular-nums text-texto">{dataBr(p.data)}</span> · {p.concluida ? 'enviada' : 'a enviar'}{p.descricao ? ` · ${p.descricao}` : ''}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-texto">{moeda(p.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">Histórico de contatos e movimentações</h3>
                  <ol className="space-y-3 border-l-2 border-borda pl-4">
                    {feitas.map((a) => {
                      const Icone = ICONES[a.tipo];
                      return (
                        <li key={a.id} className="group relative">
                          <span className="absolute -left-[27px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-white text-marca-600 ring-2 ring-borda"><Icone className="h-3 w-3" /></span>
                          <p className="text-sm text-texto">
                            <strong className="font-medium">{rotuloAtividade(a.tipo)}</strong>
                            <span className="text-texto-fraco"> · {dataBr(a.data)} · {a.criado_por_nome ?? 'Sistema'}</span>
                            {a.valor != null && <span className="ml-1.5 font-semibold tabular-nums">{moeda(a.valor)}</span>}
                          </p>
                          {a.descricao && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-texto-suave">{a.descricao}</p>}
                          {a.resultado && <p className="mt-0.5 text-xs text-texto-suave"><span className="font-medium text-texto">Resultado:</span> {a.resultado}</p>}
                          {edita && a.tipo !== 'etapa' && (
                            <button onClick={() => void apagarAtividade(a)} className="absolute right-0 top-0 rounded p-1 text-texto-fraco opacity-0 hover:text-erro group-hover:opacity-100 focus:opacity-100" aria-label="Remover registro"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </li>
                      );
                    })}
                    {feitas.length === 0 && <li className="text-xs text-texto-fraco">Nenhum contato registrado ainda.</li>}
                  </ol>
                  <p className="mt-3 text-[11px] text-texto-fraco">Atualizado {tempoRelativo(lead.updated_at)}.</p>
                </section>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        aberto={Boolean(concluindo)}
        aoFechar={() => setConcluindo(null)}
        titulo="Concluir ação"
        descricao={concluindo ? `${rotuloAtividade(concluindo.tipo)} de ${dataBr(concluindo.data)}` : undefined}
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setConcluindo(null)}>Cancelar</Botao>
            <Botao onClick={() => void concluirAtividade()}>Concluir</Botao>
          </>
        }
      >
        <AreaTexto rotulo="Como foi? (opcional)" rows={3} value={resultado} maxLength={2000} onChange={(e) => setResultado(e.target.value)} placeholder="Resultado do contato, o que ficou combinado…" autoFocus />
        <p className="mt-2 text-xs text-texto-fraco">Depois, agende a próxima ação para o lead não ficar parado.</p>
      </Modal>

      <ModalConfirmacao
        aberto={excluir}
        aoFechar={() => setExcluir(false)}
        aoConfirmar={() => void apagarLead()}
        titulo="Excluir este lead?"
        mensagem="O lead, o histórico de contatos e as ações agendadas são removidos, inclusive do calendário. Se a oportunidade apenas não avançou, prefira movê-la para a etapa de perda com o motivo."
        rotuloConfirmar="Excluir lead"
      />
    </>
  );
}
