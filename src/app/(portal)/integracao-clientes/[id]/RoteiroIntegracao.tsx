'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, Check, CheckCircle2, FileDown, Lock, RotateCcw, Star, Trash2 } from 'lucide-react';

import { SituacaoDepartamentos } from '@/components/integracao/SituacaoDepartamentos';
import { AreaTexto, Botao, Campo, Cartao, ModalConfirmacao, cn, useAvisos } from '@/components/ui';
import { br } from '@/lib/calendario';
import { abrirParaImprimir, nomeDeArquivo } from '@/lib/impressao';
import {
  CANAL_ACESSORIAS,
  FICHA_BASE,
  INTEG_DEPTS,
  ROTEIROS,
  condicaoAtende,
  progressoRoteiro,
  tituloDepartamento,
  type CampoFicha,
  type DadosRoteiro,
  type DepartamentoIntegracao,
  type ItemRoteiro,
} from '@/lib/integracao';
import { relatorioIntegracaoHtml } from '@/lib/integracao-relatorio';
import { mascararCnpj } from '@/lib/mascaras';
import { formatarCnpj } from '@/lib/normalizacao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Departamento, Integracao, IntegracaoDepartamento, ResumoIntegracao } from '@/types/banco';

type Estado = { tipo: 'ok' | 'pendente' | 'salvando' } | { tipo: 'erro'; msg: string };
type ItemSalvo = NonNullable<DadosRoteiro['itens']>[string];

const ESPERA_AUTOSALVAR = 1200;
const copiar = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {})) as T;

/**
 * O roteiro da reunião de integração, como no app antigo: ficha comum a
 * todos, ficha e itens do departamento (marcar, responder, anotar), prazos
 * combinados, checklist de documentos, salvamento automático, finalizar,
 * reabrir (responsável do departamento) e relatório em PDF.
 */
export function RoteiroIntegracao({
  integracao,
  linhasIniciais,
  resumoInicial,
  evento,
  deptos,
  deptInicial,
  meuId,
  meuNome,
  podeReabrirTodos,
  podeReabrirMeu,
  podeExcluir,
}: {
  integracao: Integracao;
  linhasIniciais: IntegracaoDepartamento[];
  resumoInicial: ResumoIntegracao[];
  evento: { id: string; titulo: string; data: string } | null;
  deptos: DepartamentoIntegracao[];
  deptInicial: DepartamentoIntegracao | null;
  meuId: string;
  meuNome: string;
  podeReabrirTodos: boolean;
  podeReabrirMeu: Departamento | null;
  podeExcluir: boolean;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const { avisar } = useAvisos();
  const id = integracao.id;

  const [ficha, setFicha] = useState<Record<string, string>>(() => copiar(integracao.ficha));
  const [linhas, setLinhas] = useState<Partial<Record<DepartamentoIntegracao, IntegracaoDepartamento>>>(() =>
    Object.fromEntries(linhasIniciais.map((l) => [l.departamento, l])),
  );
  const [resumo, setResumo] = useState(resumoInicial);
  const [dept, setDept] = useState<DepartamentoIntegracao | null>(deptInicial);
  const [dados, setDados] = useState<DadosRoteiro>(() => copiar((deptInicial && linhas[deptInicial]?.dados) || {}) as DadosRoteiro);
  const [atendido, setAtendido] = useState(() => (deptInicial && linhas[deptInicial]?.atendido_por) || meuNome);
  const [estado, setEstado] = useState<Estado>({ tipo: 'ok' });
  const [confirmar, setConfirmar] = useState<'finalizar' | 'excluir' | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Fonte da verdade para o salvamento (o estado do React chega depois).
  const fichaRef = useRef(ficha);
  const fichaSuja = useRef<Record<string, string>>({});
  const dadosRef = useRef(dados);
  const atendidoRef = useRef(atendido);
  const deptRef = useRef(dept);
  const deptSujo = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fila = useRef<Promise<boolean>>(Promise.resolve(true));

  const linha = dept ? linhas[dept] : undefined;
  const finalizado = Boolean(linha?.finalizado);
  const roteiro = dept ? ROTEIROS[dept] : null;
  const progresso = dept ? progressoRoteiro(dept, dados) : { ok: 0, total: 0 };
  const podeReabrir = Boolean(dept && (podeReabrirTodos || podeReabrirMeu === dept));

  const atualizarResumo = useCallback(async () => {
    const { data } = await supabase.rpc('integracoes_resumo');
    if (data) setResumo((data as ResumoIntegracao[]).filter((r) => r.integracao_id === id));
  }, [supabase, id]);

  /* ------------------------------ Salvar ------------------------------ */

  const salvarAgora = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = fichaSuja.current;
    const sujo = deptSujo.current;
    const d = deptRef.current;
    if (!Object.keys(patch).length && !sujo) return true;
    fichaSuja.current = {};
    deptSujo.current = false;
    setEstado({ tipo: 'salvando' });
    try {
      if (Object.keys(patch).length) {
        const { error } = await supabase.rpc('integracao_atualizar_ficha', { p_id: id, p_campos: patch });
        if (error) throw new Error(error.message);
      }
      if (sujo && d) {
        const { data, error } = await supabase
          .from('integracao_departamentos')
          .upsert(
            { integracao_id: id, departamento: d, dados: dadosRef.current, atendido_por: atendidoRef.current.trim() || null },
            { onConflict: 'integracao_id,departamento' },
          )
          .select('*')
          .single();
        if (error) throw new Error(error.code === '42501' ? 'Este roteiro já foi finalizado. Só o responsável do departamento pode reabri-lo.' : error.message);
        setLinhas((l) => ({ ...l, [d]: data as IntegracaoDepartamento }));
        if (!linhas[d]) void atualizarResumo();
      }
      setEstado(timer.current ? { tipo: 'pendente' } : { tipo: 'ok' });
      return true;
    } catch (e) {
      fichaSuja.current = { ...patch, ...fichaSuja.current };
      if (sujo) deptSujo.current = true;
      setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : 'Não foi possível salvar. Confira a internet.' });
      return false;
    }
  }, [supabase, id, linhas, atualizarResumo]);

  /** Um salvamento por vez, na ordem. */
  const salvar = useCallback(() => {
    fila.current = fila.current.then(salvarAgora, salvarAgora);
    return fila.current;
  }, [salvarAgora]);

  const agendar = useCallback(() => {
    setEstado({ tipo: 'pendente' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void salvar();
    }, ESPERA_AUTOSALVAR);
  }, [salvar]);

  // Não deixa sair com alteração por salvar.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (timer.current || deptSujo.current || Object.keys(fichaSuja.current).length) {
        void salvar();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [salvar]);

  /* ----------------------------- Mudanças ----------------------------- */

  function mudarFicha(campo: string, valor: string) {
    if (fichaRef.current[campo] === valor) return;
    fichaRef.current = { ...fichaRef.current, [campo]: valor };
    fichaSuja.current[campo] = valor;
    setFicha(fichaRef.current);
    agendar();
  }

  function mudarDados(fn: (d: DadosRoteiro) => void) {
    const novo = copiar(dadosRef.current);
    fn(novo);
    dadosRef.current = novo;
    setDados(novo);
    deptSujo.current = true;
    agendar();
  }

  /** `integCampo()`: responder ou preencher um item já o marca como tratado. */
  function mudarItem(itemId: string, campo: 'ok' | 'r' | 'nota' | `c.${string}`, valor: boolean | string | string[]) {
    mudarDados((d) => {
      d.itens ??= {};
      const x: ItemSalvo = (d.itens[itemId] ??= {});
      if (campo === 'ok') x.ok = Boolean(valor);
      else if (campo === 'r') x.r = valor as string | string[];
      else if (campo === 'nota') x.nota = String(valor);
      else (x.c ??= {})[campo.slice(2)] = String(valor);
      if (campo !== 'ok' && campo !== 'nota' && !x.ok && (Array.isArray(valor) ? valor.length : String(valor).trim())) x.ok = true;
    });
  }

  function mudarAtendido(v: string) {
    atendidoRef.current = v;
    setAtendido(v);
    deptSujo.current = true;
    agendar();
  }

  function carregarDepartamento(d: DepartamentoIntegracao | null, mapa = linhas) {
    const l = d ? mapa[d] : undefined;
    deptRef.current = d;
    dadosRef.current = copiar(l?.dados ?? {}) as DadosRoteiro;
    atendidoRef.current = l?.atendido_por || meuNome;
    setDept(d);
    setDados(dadosRef.current);
    setAtendido(atendidoRef.current);
  }

  async function trocarDepartamento(d: DepartamentoIntegracao) {
    if (d === dept) return;
    if (!(await salvar())) return;
    carregarDepartamento(d);
    window.history.replaceState(null, '', `/integracao-clientes/${id}?dept=${encodeURIComponent(d)}`);
  }

  /* --------------------------- Tempo real ----------------------------- */

  useEffect(() => {
    const canal = supabase
      .channel(`integracao:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integracao_departamentos', filter: `integracao_id=eq.${id}` }, (p) => {
        const nova = p.new as IntegracaoDepartamento | undefined;
        if (!nova?.departamento) return;
        const d = nova.departamento as DepartamentoIntegracao;
        setLinhas((l) => ({ ...l, [d]: nova }));
        // Outra pessoa mexeu no roteiro aberto e não há nada meu por salvar.
        if (d === deptRef.current && !deptSujo.current && !timer.current) {
          dadosRef.current = copiar(nova.dados) as DadosRoteiro;
          setDados(dadosRef.current);
          if (nova.atendido_por) {
            atendidoRef.current = nova.atendido_por;
            setAtendido(nova.atendido_por);
          }
        }
        void atualizarResumo();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'integracoes', filter: `id=eq.${id}` }, (p) => {
        const f = (p.new as Integracao | undefined)?.ficha;
        if (!f) return;
        fichaRef.current = { ...f, ...fichaSuja.current };
        setFicha(fichaRef.current);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'integracoes', filter: `id=eq.${id}` }, () => {
        avisar('alerta', 'Esta integração foi excluída por outra pessoa.');
        router.push('/integracao-clientes');
      })
      .subscribe();
    // A situação dos departamentos que a pessoa não vê chega pelo resumo.
    const relogio = setInterval(() => void atualizarResumo(), 30_000);
    const aoFocar = () => void atualizarResumo();
    window.addEventListener('focus', aoFocar);
    return () => {
      void supabase.removeChannel(canal);
      clearInterval(relogio);
      window.removeEventListener('focus', aoFocar);
    };
  }, [supabase, id, atualizarResumo, avisar, router]);

  /* ----------------------------- Ações -------------------------------- */

  async function finalizar() {
    if (!dept) return;
    setConfirmar(null);
    if (!(await salvar())) return;
    setOcupado(true);
    const agora = new Date().toISOString();
    const { data, error } = await supabase
      .from('integracao_departamentos')
      .upsert(
        {
          integracao_id: id,
          departamento: dept,
          dados: dadosRef.current,
          atendido_por: atendidoRef.current.trim() || meuNome,
          finalizado: true,
          finalizado_em: agora,
          finalizado_por: meuId,
          finalizado_por_nome: meuNome,
        },
        { onConflict: 'integracao_id,departamento' },
      )
      .select('*')
      .single();
    setOcupado(false);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    setLinhas((l) => ({ ...l, [dept]: data as IntegracaoDepartamento }));
    void atualizarResumo();
    avisar('sucesso', `Roteiro ${tituloDepartamento(dept)} finalizado. O relatório em PDF está liberado.`);
  }

  async function reabrir() {
    if (!dept) return;
    setOcupado(true);
    const { data, error } = await supabase
      .from('integracao_departamentos')
      .update({ finalizado: false })
      .eq('integracao_id', id)
      .eq('departamento', dept)
      .select('*')
      .single();
    setOcupado(false);
    if (error) {
      avisar('erro', error.code === '42501' ? 'Só o responsável do departamento pode reabrir este roteiro.' : error.message);
      return;
    }
    setLinhas((l) => ({ ...l, [dept]: data as IntegracaoDepartamento }));
    void atualizarResumo();
  }

  async function excluir() {
    setOcupado(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    fichaSuja.current = {};
    deptSujo.current = false;
    const { error } = await supabase.from('integracoes').delete().eq('id', id);
    setOcupado(false);
    setConfirmar(null);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    avisar('sucesso', 'Integração excluída.');
    router.push('/integracao-clientes');
    router.refresh();
  }

  function baixarPdf() {
    if (!dept || !linha) return;
    const html = relatorioIntegracaoHtml({
      depto: dept,
      ficha: fichaRef.current,
      dados: dadosRef.current,
      atendidoPor: atendidoRef.current,
      finalizadoPor: linha.finalizado_por_nome ?? '',
      finalizadoEm: linha.finalizado_em,
      resumo,
      integracaoId: id,
      geradoPor: meuNome,
    });
    const nome = nomeDeArquivo(`Integração ${tituloDepartamento(dept)} - ${fichaRef.current.empresa || 'Cliente'}`);
    if (!abrirParaImprimir(nome, html)) avisar('erro', 'O navegador bloqueou a aba do relatório. Permita pop-ups para o portal.');
  }

  async function voltar() {
    await salvar();
    router.push('/integracao-clientes');
  }

  /* ----------------------------- Tela --------------------------------- */

  const textoEstado =
    estado.tipo === 'pendente' ? 'Alterações não salvas…' : estado.tipo === 'salvando' ? 'Salvando…' : estado.tipo === 'erro' ? estado.msg : 'Salvo ✓';

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      {/* Cabeçalho */}
      <Cartao className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <Botao variante="secundario" tamanho="sm" onClick={() => void voltar()}>
            <ArrowLeft className="h-3.5 w-3.5" /> Lista de integrações
          </Botao>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-texto">{ficha.empresa || 'Sem nome'}</h1>
            <p className="text-sm text-texto-suave">
              {[ficha.cnpj ? `CNPJ ${formatarCnpj(ficha.cnpj)}` : '', ficha.dataReuniao ? `Reunião em ${br(ficha.dataReuniao)}` : ''].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {integracao.empresa_id && (
                <Link href={`/legalizacao?empresa=${integracao.empresa_id}`} className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline">
                  <Building2 className="h-3.5 w-3.5" /> Ver na Planilha Legalização
                </Link>
              )}
              {evento && (
                <Link href={`/calendario?item=${encodeURIComponent(`e:${evento.id}:${evento.data.slice(0, 10)}`)}`} className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline">
                  <CalendarDays className="h-3.5 w-3.5" /> {evento.titulo} · {br(evento.data)}
                </Link>
              )}
            </div>
          </div>
        </div>

        {deptos.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-borda pt-4">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">Roteiro</span>
            {deptos.map((d) => (
              <button
                key={d}
                onClick={() => void trocarDepartamento(d)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  dept === d ? 'bg-marca-600 font-semibold text-white ring-marca-600' : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
                )}
                aria-pressed={dept === d}
              >
                {tituloDepartamento(d)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <SituacaoDepartamentos resumo={resumo} integracaoId={id} atual={dept} aoEscolher={deptos.length > 1 ? (d) => deptos.includes(d) && void trocarDepartamento(d) : undefined} />
        </div>
      </Cartao>

      {!dept && (
        <div className="rounded-xl border border-dashed border-borda-forte bg-superficie px-4 py-3 text-sm text-texto-suave">
          O seu departamento não tem roteiro de integração. Peça o acesso &quot;Calendário de todos os departamentos&quot; para ver os roteiros de todos.
        </div>
      )}

      {finalizado && dept && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-sucesso-suave px-4 py-3 text-sm text-texto">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sucesso" />
          <p>
            Roteiro <strong>{tituloDepartamento(dept)}</strong> finalizado
            {linha?.finalizado_por_nome ? ` por ${linha.finalizado_por_nome}` : ''}
            {linha?.finalizado_em ? ` em ${new Date(linha.finalizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}. O relatório em PDF está liberado no
            rodapé.{podeReabrir ? ' Para corrigir algo, use "Reabrir".' : ''}
          </p>
        </div>
      )}

      <fieldset disabled={finalizado} className="space-y-4 disabled:opacity-90">
        <Secao titulo="Ficha do cliente" detalhe="comum a todos os departamentos">
          <div className="grid gap-4 sm:grid-cols-2">
            {FICHA_BASE.map((c) => (
              <CampoRoteiro key={c.id} campo={c} valor={ficha[c.id] ?? ''} aoMudar={(v) => mudarFicha(c.id, v)} />
            ))}
          </div>
        </Secao>

        {roteiro && dept && (
          <>
            {roteiro.ficha.length > 0 && (
              <Secao titulo={`Ficha — ${tituloDepartamento(dept)}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {roteiro.ficha.map((c) => (
                    <CampoRoteiro key={c.id} campo={c} valor={dados.ficha?.[c.id] ?? ''} aoMudar={(v) => mudarDados((d) => void ((d.ficha ??= {})[c.id] = v))} />
                  ))}
                </div>
              </Secao>
            )}

            {roteiro.secoes.map((s) => (
              <Secao key={s.titulo} titulo={s.titulo}>
                <div className="divide-y divide-borda">
                  {s.itens.map((i) => (
                    <ItemDoRoteiro key={i.id} item={i} salvo={dados.itens?.[i.id] ?? {}} aoMudar={(campo, v) => mudarItem(i.id, campo, v)} />
                  ))}
                </div>
              </Secao>
            ))}

            {dept === 'Qualidade' && (
              <Secao titulo="Passagem para os departamentos" detalhe="atualiza sozinho conforme cada departamento finaliza">
                <SituacaoDepartamentos resumo={resumo} integracaoId={id} departamentos={INTEG_DEPTS.filter((x) => x !== 'Qualidade')} />
              </Secao>
            )}

            {roteiro.prazos.length > 0 && (
              <Secao titulo="Prazos combinados">
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-texto-suave">
                      <tr>
                        <th className="px-1 py-2">Quem envia</th>
                        <th className="px-1 py-2">O quê</th>
                        <th className="w-36 px-1 py-2">Prazo</th>
                        <th className="px-1 py-2">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {roteiro.prazos.map((p) => {
                        const v = dados.prazos?.[p.id] ?? {};
                        return (
                          <tr key={p.id}>
                            <td className="px-1 py-2 text-xs font-medium text-texto-suave">{p.q}</td>
                            <td className="px-1 py-2">{p.oq}</td>
                            <td className="px-1 py-2">
                              <input
                                className="h-9 w-full rounded-lg border border-borda-forte bg-white px-2 text-sm"
                                maxLength={80}
                                placeholder="Dia ____"
                                value={v.prazo ?? p.p}
                                onChange={(e) => mudarDados((d) => void ((d.prazos ??= {})[p.id] = { ...(d.prazos[p.id] ?? {}), prazo: e.target.value }))}
                              />
                            </td>
                            <td className="px-1 py-2">
                              <input
                                className="h-9 w-full rounded-lg border border-borda-forte bg-white px-2 text-sm"
                                maxLength={200}
                                value={v.obs ?? p.obs}
                                onChange={(e) => mudarDados((d) => void ((d.prazos ??= {})[p.id] = { ...(d.prazos[p.id] ?? {}), obs: e.target.value }))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Secao>
            )}

            <Secao titulo="Combinados e próximos passos">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <AreaTexto
                    rotulo="Acordos fora do roteiro, prazos especiais e pendências"
                    maxLength={5000}
                    rows={4}
                    value={dados.combinados ?? ''}
                    onChange={(e) => mudarDados((d) => void (d.combinados = e.target.value))}
                  />
                </div>
                <Campo
                  rotulo="Agendar retorno de acompanhamento em"
                  type="date"
                  value={dados.retorno ?? ''}
                  onChange={(e) => mudarDados((d) => void (d.retorno = e.target.value))}
                />
                <Campo rotulo="Atendido por" maxLength={80} value={atendido} onChange={(e) => mudarAtendido(e.target.value)} />
              </div>
              <p className="mt-3 text-xs text-texto-fraco">{CANAL_ACESSORIAS}</p>
            </Secao>

            {roteiro.checklist.length > 0 && (
              <Secao titulo="Checklist de documentos" detalhe="marque o que já foi recebido">
                <div className="space-y-4">
                  {roteiro.checklist.map((g) => {
                    const vale = condicaoAtende(g, ficha);
                    return (
                      <div key={g.grupo} className={cn(!vale && 'opacity-55')}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">
                          {g.grupo}
                          {!vale && ' · não se aplica pelo início na Meta Plano'}
                        </p>
                        <ul className="space-y-1">
                          {g.itens.map(([docId, t, obs]) => (
                            <li key={docId}>
                              <label className="flex items-start gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-superficie">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600"
                                  checked={Boolean(dados.docs?.[docId])}
                                  onChange={(e) => mudarDados((d) => void ((d.docs ??= {})[docId] = e.target.checked))}
                                />
                                <span>
                                  {t}
                                  {obs && <span className="text-texto-fraco"> · {obs}</span>}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Secao>
            )}
          </>
        )}
      </fieldset>

      {/* Rodapé fixo */}
      <div className="sticky bottom-0 z-20 -mx-1">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-borda bg-superficie-elevada/95 px-4 py-3 shadow-lg backdrop-blur">
          {dept && (
            <span className="text-sm text-texto-suave">
              Obrigatórios tratados:{' '}
              <strong className={progresso.ok === progresso.total ? 'text-sucesso' : 'text-texto'}>
                {progresso.ok}/{progresso.total}
              </strong>
            </span>
          )}
          <span className={cn('text-xs', estado.tipo === 'erro' ? 'font-medium text-erro' : 'text-texto-fraco')}>{textoEstado}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {podeExcluir && (
              <Botao variante="fantasma" className="text-erro hover:bg-erro-suave" onClick={() => setConfirmar('excluir')} disabled={ocupado}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Botao>
            )}
            {dept &&
              (finalizado ? (
                <>
                  {podeReabrir ? (
                    <Botao variante="secundario" onClick={() => void reabrir()} carregando={ocupado}>
                      <RotateCcw className="h-4 w-4" /> Reabrir
                    </Botao>
                  ) : (
                    <span className="inline-flex items-center gap-1 self-center text-xs text-texto-fraco">
                      <Lock className="h-3.5 w-3.5" /> Só o responsável do departamento reabre
                    </span>
                  )}
                  <Botao onClick={baixarPdf}>
                    <FileDown className="h-4 w-4" /> Baixar relatório (PDF)
                  </Botao>
                </>
              ) : (
                <Botao onClick={() => (progresso.ok < progresso.total ? setConfirmar('finalizar') : void finalizar())} carregando={ocupado}>
                  <Check className="h-4 w-4" /> Finalizar roteiro
                </Botao>
              ))}
          </div>
        </div>
      </div>

      <ModalConfirmacao
        aberto={confirmar === 'finalizar'}
        aoFechar={() => setConfirmar(null)}
        aoConfirmar={() => void finalizar()}
        titulo="Finalizar com obrigatórios em aberto?"
        mensagem={
          <>
            Faltam <strong>{progresso.total - progresso.ok}</strong> item(ns) obrigatório(s) ★ sem marcar. Depois de finalizado, só o responsável do departamento consegue
            reabrir.
          </>
        }
        rotuloConfirmar="Finalizar mesmo assim"
        perigoso={false}
        carregando={ocupado}
      />
      <ModalConfirmacao
        aberto={confirmar === 'excluir'}
        aoFechar={() => setConfirmar(null)}
        aoConfirmar={() => void excluir()}
        titulo="Excluir integração"
        mensagem={
          <>
            A integração de <strong>{ficha.empresa || 'cliente sem nome'}</strong> sai do portal com os roteiros de <strong>todos</strong> os departamentos. Não dá para
            desfazer.
          </>
        }
        rotuloConfirmar="Excluir"
        carregando={ocupado}
      />
    </div>
  );
}

function Secao({ titulo, detalhe, children }: { titulo: string; detalhe?: string; children: React.ReactNode }) {
  return (
    <Cartao className="p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-texto">
        {titulo} {detalhe && <small className="font-normal text-texto-fraco">· {detalhe}</small>}
      </h2>
      {children}
    </Cartao>
  );
}

/** `campoHtml()`: texto, data, CNPJ com máscara, área de texto ou opções. */
function CampoRoteiro({ campo, valor, aoMudar }: { campo: CampoFicha; valor: string; aoMudar: (v: string) => void }) {
  const nome = useId();
  const largo = campo.full || campo.area ? 'sm:col-span-2' : '';
  if (campo.t === 'radio' && campo.op)
    return (
      <div className={largo}>
        <span className="mb-1.5 block text-sm font-medium text-texto-suave">{campo.l}</span>
        <div className="flex flex-wrap gap-1.5">
          {campo.op.map((o) => (
            <label
              key={o}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca-500',
                valor === o ? 'bg-marca-600 font-medium text-white ring-marca-600' : 'bg-white text-texto ring-borda-forte hover:ring-marca-300',
              )}
            >
              <input type="radio" name={nome} value={o} checked={valor === o} onChange={() => aoMudar(o)} className="sr-only" />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  if (campo.area)
    return (
      <div className={largo}>
        <AreaTexto rotulo={campo.l} maxLength={3000} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      </div>
    );
  return (
    <div className={largo}>
      <Campo
        rotulo={campo.l}
        type={campo.t === 'date' ? 'date' : 'text'}
        inputMode={campo.cnpj ? 'numeric' : undefined}
        maxLength={campo.cnpj ? 18 : 300}
        placeholder={campo.cnpj ? '00.000.000/0000-00' : undefined}
        value={valor}
        onChange={(e) => aoMudar(campo.cnpj ? mascararCnpj(e.target.value) : e.target.value)}
      />
    </div>
  );
}

/** `itemHtml()`: tratado, opções, campos, orientação e anotações. */
function ItemDoRoteiro({
  item,
  salvo,
  aoMudar,
}: {
  item: ItemRoteiro;
  salvo: ItemSalvo;
  aoMudar: (campo: 'ok' | 'r' | 'nota' | `c.${string}`, valor: boolean | string | string[]) => void;
}) {
  const nome = useId();
  const marcadas = Array.isArray(salvo.r) ? salvo.r : [];
  return (
    <div className={cn('-mx-2 rounded-lg px-2 py-3 transition-colors', salvo.ok && 'bg-sucesso-suave/40')}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4.5 w-4.5 rounded border-borda-forte text-marca-600" checked={Boolean(salvo.ok)} onChange={(e) => aoMudar('ok', e.target.checked)} />
        <span className={cn('text-sm font-semibold text-texto', salvo.ok && 'text-sucesso')}>
          <span className="tabular-nums text-texto-fraco">{item.n}</span>&nbsp; {item.t}
          {item.e ? <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Obrigatório" /> : null}
        </span>
      </label>

      <div className="mt-2 space-y-2.5 pl-7">
        {item.op && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.opl && <span className="mr-1 text-xs font-medium text-texto-suave">{item.opl}</span>}
            {item.op.map((o) => {
              const ativa = item.multi ? marcadas.includes(o) : salvo.r === o;
              return (
                <label
                  key={o}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca-500',
                    ativa ? 'bg-marca-600 font-medium text-white ring-marca-600' : 'bg-white text-texto ring-borda-forte hover:ring-marca-300',
                  )}
                >
                  <input
                    type={item.multi ? 'checkbox' : 'radio'}
                    name={nome}
                    value={o}
                    checked={ativa}
                    onChange={(e) => aoMudar('r', item.multi ? (e.target.checked ? [...marcadas, o] : marcadas.filter((x) => x !== o)) : o)}
                    className="sr-only"
                  />
                  {item.multi && ativa ? '✓ ' : ''}
                  {o}
                </label>
              );
            })}
          </div>
        )}

        {item.campos && (
          <div className="grid gap-3 sm:grid-cols-2">
            {item.campos.map((c) => (
              <CampoRoteiro key={c.id} campo={c} valor={salvo.c?.[c.id] ?? c.d ?? ''} aoMudar={(v) => aoMudar(`c.${c.id}`, v)} />
            ))}
          </div>
        )}

        {item.o && (
          <p className="rounded-lg bg-info-suave/60 px-3 py-2 text-xs leading-relaxed text-texto-suave">
            <span className="font-semibold text-info">Orientar:</span> {item.o}
          </p>
        )}

        <textarea
          className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm placeholder:text-texto-fraco hover:border-marca-300 focus:border-marca-500"
          rows={1}
          maxLength={3000}
          placeholder="Anotações"
          value={salvo.nota ?? ''}
          onChange={(e) => aoMudar('nota', e.target.value)}
        />
      </div>
    </div>
  );
}
