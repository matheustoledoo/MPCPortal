'use client';

import { useEffect, useState } from 'react';

import { AlertTriangle, CalendarClock, CircleDollarSign, Handshake, Target, TrendingUp, UserPlus, XCircle } from 'lucide-react';

import { Campo, Carregando, Cartao, CabecalhoCartao, EstadoErro, Indicador, Selecao, cn } from '@/components/ui';
import { hojeIso } from '@/lib/atribuicoes';
import { dataBr, moeda, moedaCompacta, rotuloAtividade } from '@/lib/prospeccao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { IndicadoresProspeccao, TipoAtividadeLead } from '@/types/banco';

/**
 * Cores das séries do gráfico mensal — validadas (daltonismo e contraste) e
 * sempre acompanhadas de legenda e do número no tooltip; nunca só pela cor.
 */
const SERIES = [
  { chave: 'novos', rotulo: 'Novos leads', cor: '#2f62c9' },
  { chave: 'convertidos', rotulo: 'Convertidos', cor: '#2e8a57' },
  { chave: 'perdidos', rotulo: 'Perdidos', cor: '#c2410c' },
] as const;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function periodo(p: string): { inicio: string; fim: string } {
  const hoje = new Date();
  const fim = hojeIso();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (p === 'mes') return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim };
  if (p === 'trimestre') return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)), fim };
  if (p === 'ano') return { inicio: `${hoje.getFullYear()}-01-01`, fim };
  return { inicio: '2000-01-01', fim };
}

export function PainelComercial({ versao, aoAbrirLead }: { versao: number; aoAbrirLead: (id: string) => void }) {
  const [intervalo, setIntervalo] = useState('trimestre');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [dados, setDados] = useState<IndicadoresProspeccao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const p = intervalo === 'personalizado' ? { inicio: de || '2000-01-01', fim: ate || hojeIso() } : periodo(intervalo);
    void criarClienteNavegador()
      .rpc('prospeccao_indicadores', { p_inicio: p.inicio, p_fim: p.fim })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro(error.message);
        else {
          setErro(null);
          setDados(data as IndicadoresProspeccao);
        }
      });
    return () => {
      ativo = false;
    };
  }, [intervalo, de, ate, versao]);

  if (erro) return <Cartao><EstadoErro mensagem={erro} /></Cartao>;
  if (!dados) return <Cartao><Carregando texto="Calculando indicadores…" /></Cartao>;

  const maiorFunil = Math.max(1, ...dados.funil.map((f) => f.total));
  const maiorMes = Math.max(1, ...dados.por_mes.flatMap((m) => [m.novos, m.convertidos, m.perdidos]));
  const hoje = hojeIso();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Selecao rotulo="Período dos indicadores" value={intervalo} onChange={(e) => setIntervalo(e.target.value)}>
            <option value="mes">Este mês</option>
            <option value="trimestre">Últimos 3 meses</option>
            <option value="ano">Este ano</option>
            <option value="tudo">Desde o início</option>
            <option value="personalizado">Personalizado…</option>
          </Selecao>
        </div>
        {intervalo === 'personalizado' && (
          <>
            <div className="w-40"><Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div className="w-40"><Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          </>
        )}
        <p className="pb-2 text-xs text-texto-fraco">Novos, convertidos, perdidos e taxa de conversão seguem o período; funil e pendências mostram a situação de agora.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Leads no funil" valor={dados.em_aberto} detalhe={`${dados.total} cadastrado(s) no total`} icone={<Target className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Novos no período" valor={dados.novos} tom="info" icone={<UserPlus className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Convertidos" valor={dados.convertidos} tom="sucesso" detalhe={dados.valor_ganho > 0 ? `${moeda(dados.valor_ganho)} em honorários/mês` : undefined} icone={<Handshake className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Perdidos" valor={dados.perdidos} tom={dados.perdidos ? 'erro' : 'neutro'} icone={<XCircle className="h-4.5 w-4.5" />} />
        <Indicador
          rotulo="Taxa de conversão"
          valor={dados.taxa_conversao == null ? '—' : `${String(dados.taxa_conversao).replace('.', ',')}%`}
          detalhe={dados.taxa_conversao == null ? 'Sem negócios fechados no período' : 'convertidos ÷ (convertidos + perdidos)'}
          tom="marca"
          icone={<TrendingUp className="h-4.5 w-4.5" />}
        />
        <Indicador rotulo="Em negociação" valor={moedaCompacta(dados.valor_em_aberto)} detalhe="honorário mensal estimado" tom="neutro" icone={<CircleDollarSign className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Ações atrasadas" valor={dados.atrasadas} detalhe={`${dados.pendentes} ação(ões) pendente(s)`} tom={dados.atrasadas ? 'erro' : 'neutro'} icone={<AlertTriangle className="h-4.5 w-4.5" />} />
        <Indicador rotulo="Sem próxima ação" valor={dados.sem_proxima_acao} detalhe="leads em aberto sem retorno agendado" tom={dados.sem_proxima_acao ? 'alerta' : 'neutro'} icone={<CalendarClock className="h-4.5 w-4.5" />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Cartao>
          <CabecalhoCartao titulo="Leads por etapa do funil" descricao="Quantidade atual em cada etapa e honorário estimado somado." />
          <ul className="space-y-3 p-5">
            {dados.funil.map((f) => (
              <li key={f.etapa_id} title={`${f.nome}: ${f.total} lead(s) · ${moeda(f.valor)}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate text-texto"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.cor }} aria-hidden />{f.nome}</span>
                  <span className="shrink-0 tabular-nums text-texto-suave"><strong className="font-semibold text-texto">{f.total}</strong>{f.valor > 0 ? ` · ${moedaCompacta(f.valor)}` : ''}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-marca-600 transition-all" style={{ width: `${f.total ? Math.max(2, (f.total / maiorFunil) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
            {dados.funil.length === 0 && <li className="text-sm text-texto-fraco">Nenhuma etapa ativa.</li>}
          </ul>
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Evolução nos últimos 6 meses"
            descricao="Entradas, conversões e perdas por mês."
            acoes={
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-texto-suave">
                {SERIES.map((s) => (
                  <li key={s.chave} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.cor }} aria-hidden />{s.rotulo}</li>
                ))}
              </ul>
            }
          />
          <div className="p-5">
            <div className="flex h-44 items-end gap-3 border-b border-borda" role="img" aria-label="Gráfico de barras: novos leads, convertidos e perdidos por mês. Os valores estão na tabela abaixo.">
              {dados.por_mes.map((m) => (
                <div key={m.mes} className="flex h-full flex-1 items-end justify-center gap-[2px]">
                  {SERIES.map((s) => {
                    const v = m[s.chave];
                    return (
                      <div
                        key={s.chave}
                        title={`${MESES[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(2, 4)} · ${s.rotulo}: ${v}`}
                        className="w-full max-w-5 rounded-t transition-all hover:opacity-80"
                        style={{ height: `${v ? Math.max(3, (v / maiorMes) * 100) : 0}%`, backgroundColor: s.cor }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <table className="mt-2 w-full table-fixed text-center text-[11px] tabular-nums text-texto-suave">
              <thead>
                <tr>{dados.por_mes.map((m) => <th key={m.mes} className="font-medium text-texto">{MESES[Number(m.mes.slice(5)) - 1]}/{m.mes.slice(2, 4)}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  {dados.por_mes.map((m) => (
                    <td key={m.mes} title="novos · convertidos · perdidos">{m.novos} · {m.convertidos} · {m.perdidos}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-center text-[10px] text-texto-fraco">novos · convertidos · perdidos</p>
          </div>
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Resultados por responsável" descricao="Carteira atual e fechamentos no período." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
                  <th className="px-5 py-2.5">Responsável</th>
                  <th className="px-3 py-2.5 text-right">Leads</th>
                  <th className="px-3 py-2.5 text-right">Em aberto</th>
                  <th className="px-3 py-2.5 text-right">Convertidos</th>
                  <th className="px-5 py-2.5 text-right">Perdidos</th>
                </tr>
              </thead>
              <tbody>
                {dados.por_responsavel.map((r) => (
                  <tr key={r.id ?? 'sem'} className="border-b border-borda last:border-0">
                    <td className="px-5 py-2.5 font-medium text-texto">{r.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.em_aberto}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-sucesso">{r.convertidos}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-texto-suave">{r.perdidos}</td>
                  </tr>
                ))}
                {dados.por_responsavel.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-texto-fraco">Sem leads cadastrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </Cartao>

        <div className="grid gap-5 sm:grid-cols-2">
          <BarrasSimples titulo="Origem dos leads" itens={dados.por_origem.map((o) => ({ rotulo: o.rotulo, total: o.total, detalhe: `${o.convertidos} convertido(s)` }))} vazio="Sem leads cadastrados." />
          <BarrasSimples titulo="Motivos de perda" itens={dados.motivos_perda.map((m) => ({ rotulo: m.rotulo, total: m.total }))} vazio="Nenhuma oportunidade perdida." />
        </div>
      </div>

      <Cartao>
        <CabecalhoCartao titulo="Próximos retornos e pendências" descricao="Ações agendadas ainda não concluídas, da mais antiga para a mais distante." />
        <ul className="divide-y divide-borda">
          {dados.proximos.map((p) => (
            <li key={p.id}>
              <button onClick={() => aoAbrirLead(p.lead_id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-left text-sm hover:bg-superficie">
                <span className={cn('w-28 shrink-0 tabular-nums', p.data < hoje ? 'font-semibold text-erro' : p.data === hoje ? 'font-semibold text-alerta' : 'text-texto-suave')}>
                  {dataBr(p.data)}{p.hora ? ` ${p.hora.slice(0, 5)}` : ''}
                </span>
                <span className="min-w-0 flex-1 truncate"><strong className="font-medium text-texto">{p.empresa}</strong> <span className="text-texto-suave">· {rotuloAtividade(p.tipo as TipoAtividadeLead)}{p.descricao ? ` — ${p.descricao}` : ''}</span></span>
                <span className="shrink-0 text-xs text-texto-fraco">{p.responsavel ?? 'Sem responsável'}</span>
              </button>
            </li>
          ))}
          {dados.proximos.length === 0 && <li className="px-5 py-8 text-center text-sm text-texto-fraco">Nenhuma ação pendente.</li>}
        </ul>
      </Cartao>
    </div>
  );
}

function BarrasSimples({ titulo, itens, vazio }: { titulo: string; itens: { rotulo: string; total: number; detalhe?: string }[]; vazio: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.total));
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo} />
      <ul className="space-y-2.5 p-5">
        {itens.slice(0, 8).map((i) => (
          <li key={i.rotulo} title={`${i.rotulo}: ${i.total}${i.detalhe ? ` · ${i.detalhe}` : ''}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-texto">{i.rotulo}</span>
              <span className="shrink-0 font-semibold tabular-nums text-texto">{i.total}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-marca-600" style={{ width: `${Math.max(3, (i.total / maior) * 100)}%` }} /></div>
          </li>
        ))}
        {itens.length === 0 && <li className="text-sm text-texto-fraco">{vazio}</li>}
      </ul>
    </Cartao>
  );
}
