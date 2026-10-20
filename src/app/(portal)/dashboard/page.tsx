import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CircleCheckBig,
  ClipboardList,
  FileSpreadsheet,
  MessagesSquare,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Cartao, CabecalhoCartao, Indicador, Selo } from '@/components/ui';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { formatarMoeda } from '@/lib/normalizacao';
import { ROTULO_VAZIAS } from '@/lib/planilha/filtros';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { EstatisticasFinanceiras, EstatisticasLegalizacao, EstatisticasProcessos } from '@/types/banco';

export const metadata = { title: 'Dashboard' };

/** Link para a planilha já filtrada por um valor de coluna (`?f.campo=valor`). */
function filtroPlanilha(campo: string, valor: string | null): string {
  const v = !valor || valor === 'Não informado' ? ROTULO_VAZIAS : valor;
  return `/legalizacao?f.${campo}=${encodeURIComponent(v)}`;
}

export default async function PaginaDashboard() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaDashboard)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const veProcessos = pode(perfil, PERMISSOES.telaProcessos);
  const vePlanilha = pode(perfil, PERMISSOES.telaLegalizacao);

  const [{ data: geraisBruto }, { data: financeirasBruto }, { count: usuarios }, { data: processosBruto }] = await Promise.all([
    supabase.rpc('legalizacao_estatisticas'),
    ehAdmin(perfil) ? supabase.rpc('admin_estatisticas_financeiras') : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    veProcessos ? supabase.rpc('processos_estatisticas') : Promise.resolve({ data: null }),
  ]);

  const stats = geraisBruto as EstatisticasLegalizacao | null;
  const financeiro = financeirasBruto as EstatisticasFinanceiras | null;
  const processos = processosBruto as EstatisticasProcessos | null;

  if (!stats) {
    return (
      <>
        <CabecalhoPagina titulo="Dashboard" />
        <div className="p-7 text-sm text-texto-suave">Não foi possível carregar os indicadores.</div>
      </>
    );
  }

  const hoje = new Date();
  const vencidos = stats.vencimentos_proximos.filter((v) => new Date(v.validade) < hoje);
  const aVencer = stats.vencimentos_proximos.filter((v) => new Date(v.validade) >= hoje);
  const maiorCidade = Math.max(1, ...stats.por_cidade.map((c) => c.total));
  const maiorRegime = Math.max(1, ...stats.por_tributacao.map((c) => c.total));

  // Indicador clicável só quando a pessoa pode abrir a planilha.
  const comLink = (href: string, conteudo: React.ReactNode) =>
    vePlanilha ? (
      <Link href={href} className="block rounded-xl transition-transform hover:-translate-y-0.5">
        {conteudo}
      </Link>
    ) : (
      conteudo
    );

  return (
    <>
      <CabecalhoPagina
        titulo={`Bom trabalho, ${perfil.nome.split(' ')[0]}`}
        descricao="Visão geral da base de Legalização e da carteira do escritório. Clique em qualquer número para abrir a planilha já filtrada."
      />

      <div className="space-y-6 p-5 sm:p-7">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {comLink(
            '/legalizacao',
            <Indicador
              rotulo="Empresas na base"
              valor={stats.total_empresas.toLocaleString('pt-BR')}
              detalhe={`${stats.ativas} ativas · ${stats.inativas} inativas`}
              icone={<Building2 className="h-4.5 w-4.5" />}
            />,
          )}
          {comLink(
            filtroPlanilha('alvara', 'SIM'),
            <Indicador
              rotulo="Com alvará"
              valor={stats.com_alvara.toLocaleString('pt-BR')}
              detalhe={`${stats.sem_alvara} sem alvará registrado`}
              icone={<CircleCheckBig className="h-4.5 w-4.5" />}
              tom="sucesso"
            />,
          )}
          {comLink(
            filtroPlanilha('necessita_revisao', 'Sim'),
            <Indicador
              rotulo="Precisam de revisão"
              valor={stats.necessitam_revisao.toLocaleString('pt-BR')}
              detalhe={`${stats.cnpj_invalido} com CNPJ inconsistente`}
              icone={<AlertTriangle className="h-4.5 w-4.5" />}
              tom={stats.necessitam_revisao > 0 ? 'alerta' : 'neutro'}
            />,
          )}
          {financeiro ? (
            <Link href="/administrativo" className="block rounded-xl transition-transform hover:-translate-y-0.5">
              <Indicador
                rotulo="Honorários / mês"
                valor={formatarMoeda(Number(financeiro.faturamento_mensal))}
                detalhe={`Ticket médio ${formatarMoeda(Number(financeiro.ticket_medio))}`}
                icone={<TrendingUp className="h-4.5 w-4.5" />}
                tom="marca"
              />
            </Link>
          ) : (
            <Indicador rotulo="Usuários do portal" valor={(usuarios ?? 0).toLocaleString('pt-BR')} icone={<Users className="h-4.5 w-4.5" />} />
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Cartao className="lg:col-span-2">
            <CabecalhoCartao
              titulo="Vencimentos de documentos"
              descricao="AVCB/CLCB, Vigilância Sanitária e responsáveis técnicos nos próximos 180 dias. Clique numa empresa para abri-la na planilha."
              acoes={
                vePlanilha && stats.vencimentos_proximos.length > 0 ? (
                  <Link href="/legalizacao?vencimentos=1" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
                    Ver todos na planilha <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : undefined
              }
            />
            {stats.vencimentos_proximos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texto-suave">Nenhum vencimento registrado no período.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {vencidos.length > 0 && (
                  <p className="border-b border-borda bg-erro-suave px-5 py-2 text-xs font-semibold text-erro">
                    {vencidos.length} documento(s) já vencido(s)
                  </p>
                )}
                <ul className="divide-y divide-borda">
                  {[...vencidos, ...aVencer].map((item, indice) => {
                    const data = new Date(item.validade);
                    const venceu = data < hoje;
                    const dias = Math.round((data.getTime() - hoje.getTime()) / 86400000);
                    const conteudo = (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-texto group-hover:text-marca-800">{item.razao_social}</p>
                          <p className="text-xs text-texto-suave">{item.documento}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-right">
                          <div>
                            <p className="text-sm tabular-nums text-texto">{data.toLocaleDateString('pt-BR')}</p>
                            <Selo tom={venceu ? 'erro' : dias <= 60 ? 'alerta' : 'neutro'}>
                              {venceu ? `vencido há ${Math.abs(dias)}d` : `em ${dias}d`}
                            </Selo>
                          </div>
                          {vePlanilha && <ArrowRight className="h-4 w-4 text-texto-fraco transition-transform group-hover:translate-x-0.5" />}
                        </div>
                      </>
                    );
                    return (
                      <li key={`${item.id}-${item.documento}-${indice}`}>
                        {vePlanilha ? (
                          <Link href={`/legalizacao?empresa=${item.id}`} className="group flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-marca-50/60">
                            {conteudo}
                          </Link>
                        ) : (
                          <div className="flex items-center justify-between gap-3 px-5 py-2.5">{conteudo}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Cartao>

          {processos ? (
            <Cartao>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-marca-600" />
                    Controle Legalização
                  </span>
                }
                descricao="Processos em andamento nos órgãos."
                acoes={
                  <Link href="/controle-legalizacao" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="grid grid-cols-2 gap-3 p-5">
                <MiniNumero rotulo="Em aberto" valor={processos.abertos} />
                <MiniNumero rotulo="Atrasados" valor={processos.atrasados} tom={processos.atrasados ? 'erro' : undefined} />
                <MiniNumero rotulo="Vencem em 3 dias" valor={processos.atencao} tom={processos.atencao ? 'alerta' : undefined} />
                <MiniNumero rotulo="Concluídos no mês" valor={processos.concluidos_mes} tom="sucesso" />
              </div>
              {processos.por_status.length > 0 && (
                <ul className="space-y-1.5 border-t border-borda px-5 py-4">
                  {processos.por_status.slice(0, 5).map((s) => (
                    <li key={s.valor} className="flex justify-between text-xs">
                      <span className="truncate text-texto-suave">{s.valor}</span>
                      <span className="font-semibold tabular-nums text-texto">{s.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ) : (
            <Cartao>
              <CabecalhoCartao titulo="Revisão da base" descricao="Cadastros que pedem conferência." />
              <div className="space-y-3 p-5 text-sm text-texto-suave">
                <p>
                  <strong className="text-texto">{stats.necessitam_revisao}</strong> empresa(s) marcadas para revisão e{' '}
                  <strong className="text-texto">{stats.cnpj_invalido}</strong> com CNPJ inconsistente.
                </p>
              </div>
            </Cartao>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <CabecalhoCartao titulo="Empresas por cidade" descricao="Dez municípios com maior volume. Clique para ver as empresas na planilha." />
            <ul className="divide-y divide-borda">
              {stats.por_cidade.map((item) => (
                <LinhaDistribuicao
                  key={item.cidade}
                  rotulo={item.cidade}
                  total={item.total}
                  maior={maiorCidade}
                  href={vePlanilha ? filtroPlanilha('cidade', item.cidade) : null}
                />
              ))}
            </ul>
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo="Regime tributário" descricao="Distribuição da carteira. Clique para ver as empresas na planilha." />
            <ul className="divide-y divide-borda">
              {stats.por_tributacao.map((item) => (
                <LinhaDistribuicao
                  key={item.tributacao}
                  rotulo={item.tributacao}
                  total={item.total}
                  maior={maiorRegime}
                  href={vePlanilha ? filtroPlanilha('tributacao', item.tributacao) : null}
                />
              ))}
            </ul>
          </Cartao>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {vePlanilha && (
            <AtalhoRapido href="/legalizacao" icone={<FileSpreadsheet className="h-5 w-5" />} titulo="Planilha Legalização" descricao="Consultar, filtrar e importar." />
          )}
          {ehAdmin(perfil) && (
            <AtalhoRapido href="/administrativo" icone={<Receipt className="h-5 w-5" />} titulo="Planilha ADM" descricao="Honorários e condições contratuais." />
          )}
          {pode(perfil, PERMISSOES.telaCalendario) && (
            <AtalhoRapido href="/calendario" icone={<CalendarDays className="h-5 w-5" />} titulo="Calendário de Obrigações" descricao="Vencimentos do mês por departamento." />
          )}
          {pode(perfil, PERMISSOES.telaForum) && (
            <AtalhoRapido href="/forum" icone={<MessagesSquare className="h-5 w-5" />} titulo="Fórum da Meta" descricao="O que a equipe está falando." />
          )}
        </section>
      </div>
    </>
  );
}

function MiniNumero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: 'erro' | 'alerta' | 'sucesso' }) {
  const cor = tom === 'erro' ? 'text-erro' : tom === 'alerta' ? 'text-alerta' : tom === 'sucesso' ? 'text-sucesso' : 'text-texto';
  return (
    <div className="rounded-lg bg-superficie px-3 py-2.5">
      <p className={`text-xl font-semibold tabular-nums ${cor}`}>{valor.toLocaleString('pt-BR')}</p>
      <p className="text-[11px] text-texto-suave">{rotulo}</p>
    </div>
  );
}

function LinhaDistribuicao({ rotulo, total, maior, href }: { rotulo: string; total: number; maior: number; href: string | null }) {
  const corpo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-texto group-hover:text-marca-800">{rotulo}</span>
          <span className="shrink-0 font-medium tabular-nums text-texto-suave">{total}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-marca-400 group-hover:bg-marca-600" style={{ width: `${(total / maior) * 100}%` }} />
        </div>
      </div>
      {href && <ArrowRight className="h-4 w-4 shrink-0 text-texto-fraco transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-marca-50/60">
          {corpo}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-5 py-2.5">{corpo}</div>
      )}
    </li>
  );
}

function AtalhoRapido({ href, icone, titulo, descricao }: { href: string; icone: React.ReactNode; titulo: string; descricao: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-borda bg-superficie-elevada p-4 transition-colors hover:border-marca-300 hover:bg-marca-50/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600 transition-colors group-hover:bg-marca-100">
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{titulo}</span>
        <span className="mt-0.5 block text-xs text-texto-suave">{descricao}</span>
      </span>
    </Link>
  );
}
