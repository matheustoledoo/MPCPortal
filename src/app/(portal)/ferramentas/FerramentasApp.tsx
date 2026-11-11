'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  Briefcase,
  Calculator,
  CalendarRange,
  Check,
  ClipboardCopy,
  ExternalLink,
  FileCheck2,
  History,
  Info,
  Landmark,
  Printer,
  RotateCcw,
  Save,
  Scale,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { Botao, Campo, Cartao, CabecalhoCartao, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { hojeIso } from '@/lib/atribuicoes';
import { criarCalendarioFeriados } from '@/lib/calendario';
import { dataBr } from '@/lib/ferramentas/calculos';
import { FERRAMENTAS, GRUPOS_FERRAMENTAS, tabelasVigentes, valoresPadrao, type Ferramenta, type Resultado, type Valores } from '@/lib/ferramentas/definicoes';
import { abrirParaImprimir, agoraBr, esc } from '@/lib/impressao';
import { tempoRelativo } from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CalculoSalvo, EventoCalendario, TabelaFerramenta } from '@/types/banco';

const ICONES: Record<string, typeof Calculator> = {
  inss: Landmark, irrf: Landmark, 'salario-liquido': Wallet, 'pro-labore': Briefcase, fgts: Wallet, ferias: CalendarRange, 'decimo-terceiro': Wallet, rescisao: FileCheck2,
  simples: Calculator, mei: Calculator, presumido: Calculator, comparador: Scale, projecao: TrendingUp, acrescimos: AlertTriangle, 'dias-uteis': CalendarRange, validador: Check,
};

const TONS_DESTAQUE = { marca: 'bg-marca-700 text-white', sucesso: 'bg-sucesso text-white', alerta: 'bg-alerta text-white', erro: 'bg-erro text-white', neutro: 'bg-white text-texto ring-1 ring-borda' };

function mascaraMoeda(texto: string): string {
  const d = texto.replace(/\D/g, '');
  if (!d) return '';
  return (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FerramentasApp({
  tabelas,
  calculosIniciais,
  feriados,
  abrir,
  podeEditarTabelas,
}: {
  tabelas: TabelaFerramenta[];
  calculosIniciais: CalculoSalvo[];
  feriados: EventoCalendario[];
  abrir: string | null;
  podeEditarTabelas: boolean;
}) {
  const router = useRouter();
  const [ativa, setAtiva] = useState<string | null>(FERRAMENTAS.some((f) => f.id === abrir) ? abrir : null);
  const [busca, setBusca] = useState('');
  const [calculos, setCalculos] = useState(calculosIniciais);
  const hoje = hojeIso();
  const vigentes = useMemo(() => tabelasVigentes(tabelas, hoje), [tabelas, hoje]);
  const calendario = useMemo(() => criarCalendarioFeriados(feriados), [feriados]);

  function escolher(id: string | null) {
    setAtiva(id);
    router.replace(id ? `/ferramentas?f=${id}` : '/ferramentas', { scroll: false });
  }

  const ferramenta = FERRAMENTAS.find((f) => f.id === ativa);
  if (ferramenta) {
    return (
      <Calculadora
        key={ferramenta.id}
        ferramenta={ferramenta}
        tabelas={vigentes}
        ehUtil={calendario.ehUtil}
        hoje={hoje}
        calculos={calculos.filter((c) => c.ferramenta === ferramenta.id)}
        aoSalvar={(c) => setCalculos((l) => [c, ...l])}
        aoRemover={(id) => setCalculos((l) => l.filter((c) => c.id !== id))}
        aoVoltar={() => escolher(null)}
      />
    );
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = FERRAMENTAS.filter((f) => !termo || `${f.titulo} ${f.descricao} ${f.grupo}`.toLowerCase().includes(termo));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] max-w-md flex-1">
          <Campo value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ferramenta…" iconeInicial={<Search className="h-4 w-4" />} aria-label="Buscar ferramenta" />
        </div>
        {podeEditarTabelas && (
          <Link href="/ferramentas/tabelas" className="ml-auto inline-flex h-9.5 items-center gap-2 rounded-lg border border-borda-forte bg-white px-4 text-sm font-medium text-texto shadow-sm hover:border-marca-300">
            <Settings2 className="h-4 w-4" /> Tabelas e vigências
          </Link>
        )}
      </div>

      {GRUPOS_FERRAMENTAS.map((grupo) => {
        const itens = visiveis.filter((f) => f.grupo === grupo);
        if (itens.length === 0) return null;
        return (
          <section key={grupo}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-texto-fraco">{grupo}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {itens.map((f) => {
                const Icone = ICONES[f.id] ?? Calculator;
                const usos = calculos.filter((c) => c.ferramenta === f.id).length;
                return (
                  <li key={f.id}>
                    <button onClick={() => escolher(f.id)} className="flex h-full w-full flex-col rounded-xl border border-borda bg-superficie-elevada p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-marca-300 hover:shadow-md">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-50 text-marca-700"><Icone className="h-5 w-5" /></span>
                      <span className="mt-3 text-sm font-semibold text-texto">{f.titulo}</span>
                      <span className="mt-1 text-xs leading-relaxed text-texto-suave">{f.descricao}</span>
                      {usos > 0 && <span className="mt-auto pt-3 text-[11px] text-texto-fraco">{usos} cálculo(s) guardado(s)</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {visiveis.length === 0 && <Cartao className="p-10 text-center text-sm text-texto-suave">Nenhuma ferramenta com “{busca}”.</Cartao>}

      <p className="flex items-start gap-2 rounded-xl border border-borda bg-superficie px-4 py-3 text-xs leading-relaxed text-texto-suave">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        As calculadoras usam as tabelas oficiais cadastradas no portal, com a fonte legal e a data em que foram conferidas. São ferramentas de apoio: cada uma lista o que NÃO considera. Em caso de divergência, vale a legislação e o sistema oficial (folha, PGDAS-D, Sicalc).
      </p>
    </div>
  );
}

function Calculadora({
  ferramenta,
  tabelas,
  ehUtil,
  hoje,
  calculos,
  aoSalvar,
  aoRemover,
  aoVoltar,
}: {
  ferramenta: Ferramenta;
  tabelas: Record<string, TabelaFerramenta>;
  ehUtil: (d: Date) => boolean;
  hoje: string;
  calculos: CalculoSalvo[];
  aoSalvar: (c: CalculoSalvo) => void;
  aoRemover: (id: string) => void;
  aoVoltar: () => void;
}) {
  const { avisar } = useAvisos();
  const [valores, setValores] = useState<Valores>(() => valoresPadrao(ferramenta));
  const [salvando, setSalvando] = useState(false);

  const faltam = ferramenta.tabelas.filter((chave) => !tabelas[chave]);
  const resultado = useMemo(() => {
    if (faltam.length) return null;
    try {
      return ferramenta.calcular(valores, tabelas, { ehUtil, hoje });
    } catch {
      return { erro: 'Não foi possível calcular com a tabela cadastrada. Peça ao administrador para conferir os dados em “Tabelas e vigências”.' };
    }
  }, [ferramenta, valores, tabelas, ehUtil, hoje, faltam.length]);
  const pronto = resultado && !('erro' in resultado) ? resultado : null;
  const campos = ferramenta.campos.filter((cp) => !cp.visivel || cp.visivel(valores));

  const textoEntrada = () =>
    campos
      .map((cp) => {
        const v = valores[cp.id];
        const opcoes = cp.opcoes ?? cp.opcoesDe?.(tabelas) ?? [];
        const mostrado = cp.tipo === 'booleano' ? (v ? 'Sim' : 'Não') : cp.tipo === 'selecao' ? (opcoes.find((o) => o.valor === v)?.rotulo ?? String(v)) : cp.tipo === 'data' ? dataBr(String(v || '')) : cp.tipo === 'moeda' && v ? `R$ ${String(v)}` : String(v ?? '');
        return mostrado ? `${cp.rotulo}: ${mostrado}` : null;
      })
      .filter(Boolean) as string[];

  function textoCompleto(r: Resultado): string {
    return [
      `${ferramenta.titulo} — PortalMPC (${agoraBr()})`,
      '',
      ...textoEntrada(),
      '',
      ...r.linhas.map((l) => (l.tipo === 'titulo' ? `\n${l.rotulo.toUpperCase()}` : `${l.rotulo}: ${l.valor}`)),
      '',
      'Como foi calculado:',
      ...r.passos.map((p) => `- ${p}`),
      ...(r.avisos.length ? ['', 'Atenção:', ...r.avisos.map((a) => `- ${a}`)] : []),
      '',
      'Base legal:',
      ...ferramenta.tabelas.map((ch) => `- ${tabelas[ch].titulo}: ${tabelas[ch].fonte} (vigência desde ${dataBr(tabelas[ch].vigencia_inicio)})`),
      '',
      'Não considera:',
      ...ferramenta.limitacoes.map((l) => `- ${l}`),
    ].join('\n');
  }

  async function copiar() {
    if (!pronto) return;
    try {
      await navigator.clipboard.writeText(textoCompleto(pronto));
      avisar('sucesso', 'Resultado copiado.');
    } catch {
      avisar('erro', 'O navegador não permitiu copiar. Use Imprimir.');
    }
  }

  function imprimir() {
    if (!pronto) return;
    const linhas = pronto.linhas
      .map((l) => (l.tipo === 'titulo' ? `<tr><th colspan="2" style="text-align:left;padding-top:10px">${esc(l.rotulo)}</th></tr>` : `<tr><td>${esc(l.rotulo)}</td><td style="text-align:right;${l.tipo === 'total' ? 'font-weight:700' : ''}">${esc(l.valor)}</td></tr>`))
      .join('');
    const corpo = `
      <h1>${esc(ferramenta.titulo)}</h1>
      <p class="sub">PortalMPC · Meta Plano Contábil · ${esc(agoraBr())}</p>
      <h2>Dados informados</h2><ul>${textoEntrada().map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <h2>Resultado</h2><table>${linhas}</table>
      <h2>Como foi calculado</h2><ul>${pronto.passos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      ${pronto.avisos.length ? `<h2>Atenção</h2><ul>${pronto.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <h2>Base legal</h2><ul>${ferramenta.tabelas.map((ch) => `<li>${esc(tabelas[ch].titulo)} — ${esc(tabelas[ch].fonte)} (vigência desde ${esc(dataBr(tabelas[ch].vigencia_inicio))})</li>`).join('')}</ul>
      <h2>O que este cálculo não considera</h2><ul>${ferramenta.limitacoes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    if (!abrirParaImprimir(ferramenta.titulo, corpo)) avisar('alerta', 'Permita pop-ups para imprimir ou salvar em PDF.');
  }

  async function guardar() {
    if (!pronto) return;
    setSalvando(true);
    const titulo = pronto.destaques.map((x) => `${x.rotulo}: ${x.valor}`).join(' · ').slice(0, 200);
    const { data, error } = await criarClienteNavegador()
      .from('ferramentas_calculos')
      .insert({ ferramenta: ferramenta.id, titulo, entrada: valores, resultado: { destaques: pronto.destaques, linhas: pronto.linhas } })
      .select('id, ferramenta, titulo, entrada, resultado, created_at')
      .single();
    setSalvando(false);
    if (error || !data) return avisar('erro', `Não foi possível guardar: ${error?.message ?? ''}`);
    aoSalvar(data as CalculoSalvo);
    avisar('sucesso', 'Cálculo guardado no seu histórico.');
  }

  async function remover(id: string) {
    const { error } = await criarClienteNavegador().from('ferramentas_calculos').delete().eq('id', id);
    if (error) return avisar('erro', error.message);
    aoRemover(id);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={aoVoltar} className="inline-flex items-center gap-1.5 text-sm font-medium text-texto-suave hover:text-texto"><ArrowLeft className="h-4 w-4" /> Todas as ferramentas</button>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" tamanho="sm" onClick={() => setValores(valoresPadrao(ferramenta))}><RotateCcw className="h-4 w-4" /> Limpar</Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => void copiar()} disabled={!pronto}><ClipboardCopy className="h-4 w-4" /> Copiar</Botao>
          <Botao variante="secundario" tamanho="sm" onClick={imprimir} disabled={!pronto}><Printer className="h-4 w-4" /> Imprimir / PDF</Botao>
          <Botao tamanho="sm" onClick={() => void guardar()} disabled={!pronto} carregando={salvando}><Save className="h-4 w-4" /> Guardar cálculo</Botao>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <Cartao>
            <CabecalhoCartao titulo={ferramenta.titulo} descricao={ferramenta.descricao} />
            <div className="space-y-4 p-5">
              {campos.map((cp) => {
                const v = valores[cp.id];
                const mudar = (novo: string | boolean) => setValores((atual) => ({ ...atual, [cp.id]: novo }));
                if (cp.tipo === 'booleano') {
                  return (
                    <label key={cp.id} className="flex cursor-pointer items-start gap-2.5 text-sm text-texto">
                      <input type="checkbox" checked={v === true} onChange={(e) => mudar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-marca-600)]" />
                      <span>{cp.rotulo}{cp.dica && <span className="mt-0.5 block text-xs text-texto-fraco">{cp.dica}</span>}</span>
                    </label>
                  );
                }
                if (cp.tipo === 'selecao') {
                  const opcoes = cp.opcoes ?? cp.opcoesDe?.(tabelas) ?? [];
                  return (
                    <div key={cp.id}>
                      <Selecao rotulo={cp.rotulo} value={String(v)} onChange={(e) => mudar(e.target.value)}>
                        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                      </Selecao>
                      {cp.dica && <p className="mt-1.5 text-xs text-texto-fraco">{cp.dica}</p>}
                    </div>
                  );
                }
                return (
                  <Campo
                    key={cp.id}
                    rotulo={cp.rotulo}
                    dica={cp.dica}
                    type={cp.tipo === 'data' ? 'date' : 'text'}
                    inputMode={cp.tipo === 'moeda' || cp.tipo === 'numero' ? 'numeric' : cp.tipo === 'percentual' ? 'decimal' : undefined}
                    value={String(v ?? '')}
                    placeholder={cp.tipo === 'moeda' ? '0,00' : cp.tipo === 'percentual' ? '0,00' : undefined}
                    onChange={(e) => mudar(cp.tipo === 'moeda' ? mascaraMoeda(e.target.value) : cp.tipo === 'numero' ? e.target.value.replace(/\D/g, '').slice(0, 5) : cp.tipo === 'percentual' ? e.target.value.replace(/[^\d,.]/g, '').slice(0, 8) : e.target.value.slice(0, 40))}
                    iconeInicial={cp.tipo === 'moeda' ? <span className="text-xs font-medium">R$</span> : undefined}
                  />
                );
              })}
            </div>
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo={<span className="flex items-center gap-2"><History className="h-4 w-4 text-marca-600" /> Últimos cálculos</span>} descricao="Só você vê o seu histórico. Clique para recarregar os dados." />
            <ul className="divide-y divide-borda">
              {calculos.slice(0, 8).map((c) => (
                <li key={c.id} className="group flex items-center gap-2 px-5 py-2.5">
                  <button onClick={() => setValores({ ...valoresPadrao(ferramenta), ...(c.entrada as Valores) })} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-texto">{c.titulo}</span>
                    <span className="block text-xs text-texto-fraco">{tempoRelativo(c.created_at)}</span>
                  </button>
                  <button onClick={() => void remover(c.id)} className="rounded p-1.5 text-texto-fraco opacity-0 hover:bg-erro-suave hover:text-erro group-hover:opacity-100 focus:opacity-100" aria-label="Remover do histórico"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
              {calculos.length === 0 && <li className="px-5 py-6 text-center text-sm text-texto-fraco">Use “Guardar cálculo” para manter um resultado aqui.</li>}
            </ul>
          </Cartao>
        </div>

        <div className="space-y-5">
          {faltam.length > 0 ? (
            <Cartao className="p-6 text-sm text-texto-suave">
              <p className="flex items-center gap-2 font-semibold text-erro"><AlertTriangle className="h-4 w-4" /> Tabela não cadastrada</p>
              <p className="mt-2">Esta ferramenta depende de: <strong>{faltam.join(', ')}</strong>. Um administrador precisa cadastrar a tabela vigente em “Tabelas e vigências”. O portal não calcula com valores presumidos.</p>
            </Cartao>
          ) : resultado && 'erro' in resultado ? (
            <Cartao className="flex items-start gap-3 p-6 text-sm text-erro"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {resultado.erro}</Cartao>
          ) : !pronto ? (
            <Cartao className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-50 text-marca-600"><Calculator className="h-6 w-6" /></span>
              <p className="text-sm font-medium text-texto">Preencha os dados ao lado</p>
              <p className="max-w-sm text-sm text-texto-suave">O resultado aparece aqui na hora, com o passo a passo e a base legal.</p>
            </Cartao>
          ) : (
            <>
              <div className={cn('grid gap-3', pronto.destaques.length > 1 && 'sm:grid-cols-2')}>
                {pronto.destaques.map((x) => (
                  <div key={x.rotulo} className={cn('rounded-xl px-5 py-4 shadow-sm', TONS_DESTAQUE[x.tom ?? 'marca'])}>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-80">{x.rotulo}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums first-letter:uppercase">{x.valor}</p>
                  </div>
                ))}
              </div>

              {pronto.avisos.length > 0 && (
                <ul className="space-y-2">
                  {pronto.avisos.map((a) => (
                    <li key={a} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-alerta-suave px-4 py-3 text-sm text-texto"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alerta" /> {a}</li>
                  ))}
                </ul>
              )}

              <Cartao>
                <CabecalhoCartao titulo="Demonstrativo" />
                <table className="w-full text-sm">
                  <tbody>
                    {pronto.linhas.map((l, i) =>
                      l.tipo === 'titulo' ? (
                        <tr key={i}><th colSpan={2} className="px-5 pb-1 pt-4 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">{l.rotulo}</th></tr>
                      ) : (
                        <tr key={i} className={cn('border-b border-borda last:border-0', l.tipo === 'total' && 'bg-superficie font-semibold')}>
                          <td className="px-5 py-2.5 text-texto">{l.rotulo}</td>
                          <td className={cn('whitespace-nowrap px-5 py-2.5 text-right tabular-nums', l.tipo === 'desconto' ? 'text-erro' : l.tipo === 'provento' ? 'text-texto' : 'text-texto')}>{l.valor}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </Cartao>

              <Cartao>
                <CabecalhoCartao titulo="Como foi calculado" />
                <ol className="space-y-2 p-5 text-sm leading-relaxed text-texto-suave">
                  {pronto.passos.map((p, i) => (
                    <li key={i} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-50 text-[10px] font-semibold text-marca-700">{i + 1}</span><span>{p}</span></li>
                  ))}
                </ol>
              </Cartao>
            </>
          )}

          {ferramenta.tabelas.length > 0 && faltam.length === 0 && (
            <Cartao>
              <CabecalhoCartao titulo={<span className="flex items-center gap-2"><BookMarked className="h-4 w-4 text-marca-600" /> Base legal e vigência</span>} descricao="Tabelas usadas neste cálculo." />
              <ul className="divide-y divide-borda">
                {ferramenta.tabelas.map((chave) => {
                  const tb = tabelas[chave];
                  return (
                    <li key={chave} className="px-5 py-3">
                      <p className="text-sm font-medium text-texto">{tb.titulo}</p>
                      <p className="mt-0.5 text-xs text-texto-suave">{tb.fonte}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Selo tom="neutro" className="text-[10px]">Vigência desde {dataBr(tb.vigencia_inicio)}</Selo>
                        {tb.conferido_em && <Selo tom="sucesso" className="text-[10px]">Conferida em {dataBr(tb.conferido_em)}</Selo>}
                        {tb.fonte_url && <a href={tb.fonte_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-marca-700 hover:underline">Fonte oficial <ExternalLink className="h-3 w-3" /></a>}
                      </p>
                      {tb.observacao && <p className="mt-1.5 text-xs leading-relaxed text-texto-fraco">{tb.observacao}</p>}
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          )}

          <Cartao className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-texto"><Info className="h-4 w-4 text-info" /> O que este cálculo não considera</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-texto-suave">
              {ferramenta.limitacoes.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
