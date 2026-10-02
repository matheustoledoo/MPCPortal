import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheckBig,
  FileSpreadsheet,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Cartao, CabecalhoCartao, Indicador, Selo } from '@/components/ui';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { formatarMoeda } from '@/lib/normalizacao';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { EstatisticasFinanceiras, EstatisticasLegalizacao } from '@/types/banco';

export const metadata = { title: 'Dashboard' };

export default async function PaginaDashboard() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaDashboard)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  const [{ data: geraisBruto }, { data: financeirasBruto }, { count: usuarios }] = await Promise.all([
    supabase.rpc('legalizacao_estatisticas'),
    ehAdmin(perfil)
      ? supabase.rpc('admin_estatisticas_financeiras')
      : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const stats = geraisBruto as EstatisticasLegalizacao | null;
  const financeiro = financeirasBruto as EstatisticasFinanceiras | null;

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

  return (
    <>
      <CabecalhoPagina
        titulo={`Bom trabalho, ${perfil.nome.split(' ')[0]}`}
        descricao="Visão geral da base de Legalização e da carteira do escritório."
      />

      <div className="space-y-6 p-5 sm:p-7">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Indicador
            rotulo="Empresas na base"
            valor={stats.total_empresas.toLocaleString('pt-BR')}
            detalhe={`${stats.ativas} ativas · ${stats.inativas} inativas`}
            icone={<Building2 className="h-4.5 w-4.5" />}
          />
          <Indicador
            rotulo="Com alvará"
            valor={stats.com_alvara.toLocaleString('pt-BR')}
            detalhe={`${stats.sem_alvara} sem alvará registrado`}
            icone={<CircleCheckBig className="h-4.5 w-4.5" />}
            tom="sucesso"
          />
          <Indicador
            rotulo="Precisam de revisão"
            valor={stats.necessitam_revisao.toLocaleString('pt-BR')}
            detalhe={`${stats.cnpj_invalido} com CNPJ inconsistente`}
            icone={<AlertTriangle className="h-4.5 w-4.5" />}
            tom={stats.necessitam_revisao > 0 ? 'alerta' : 'neutro'}
          />
          {financeiro ? (
            <Indicador
              rotulo="Honorários / mês"
              valor={formatarMoeda(Number(financeiro.faturamento_mensal))}
              detalhe={`Ticket médio ${formatarMoeda(Number(financeiro.ticket_medio))}`}
              icone={<TrendingUp className="h-4.5 w-4.5" />}
              tom="marca"
            />
          ) : (
            <Indicador
              rotulo="Usuários do portal"
              valor={(usuarios ?? 0).toLocaleString('pt-BR')}
              icone={<Users className="h-4.5 w-4.5" />}
            />
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Cartao className="lg:col-span-2">
            <CabecalhoCartao
              titulo="Vencimentos de documentos"
              descricao="AVCB/CLCB, Vigilância Sanitária e responsáveis técnicos nos próximos 180 dias."
            />
            {stats.vencimentos_proximos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texto-suave">
                Nenhum vencimento registrado no período.
              </p>
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
                    return (
                      <li
                        key={`${item.id}-${item.documento}-${indice}`}
                        className="flex items-center justify-between gap-3 px-5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-texto">{item.razao_social}</p>
                          <p className="text-xs text-texto-suave">{item.documento}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm tabular-nums text-texto">
                            {data.toLocaleDateString('pt-BR')}
                          </p>
                          <Selo tom={venceu ? 'erro' : dias <= 60 ? 'alerta' : 'neutro'}>
                            {venceu ? `vencido há ${Math.abs(dias)}d` : `em ${dias}d`}
                          </Selo>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo="Origem dos registros" descricao="Rastreabilidade da importação." />
            <div className="space-y-3 p-5">
              {Object.entries(stats.por_origem).map(([origem, quantidade]) => {
                const percentual = Math.round((quantidade / stats.total_empresas) * 100);
                const rotulos: Record<string, string> = {
                  ambas: 'Nas duas planilhas',
                  planilha_saude: 'Somente Planilha Saúde',
                  planilha_adm: 'Somente Adm.xlsx',
                  manual: 'Cadastro manual',
                };
                return (
                  <div key={origem}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-texto-suave">{rotulos[origem] ?? origem}</span>
                      <span className="font-medium tabular-nums text-texto">{quantidade}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-marca-500" style={{ width: `${percentual}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Cartao>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <CabecalhoCartao titulo="Empresas por cidade" descricao="Dez municípios com maior volume." />
            <ul className="divide-y divide-borda">
              {stats.por_cidade.map((item) => (
                <li key={item.cidade} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-texto">{item.cidade}</span>
                  <span className="tabular-nums font-medium text-texto-suave">{item.total}</span>
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo="Regime tributário" descricao="Distribuição da carteira." />
            <ul className="divide-y divide-borda">
              {stats.por_tributacao.map((item) => (
                <li key={item.tributacao} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-texto">{item.tributacao}</span>
                  <span className="tabular-nums font-medium text-texto-suave">{item.total}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <AtalhoRapido
            href="/legalizacao"
            icone={<FileSpreadsheet className="h-5 w-5" />}
            titulo="Planilha Legalização"
            descricao="Consultar e editar a base geral."
          />
          {ehAdmin(perfil) && (
            <AtalhoRapido
              href="/administrativo"
              icone={<Receipt className="h-5 w-5" />}
              titulo="Planilha ADM"
              descricao="Honorários e condições contratuais."
            />
          )}
          <AtalhoRapido
            href="/importacoes"
            icone={<CalendarClock className="h-5 w-5" />}
            titulo="Relatório de importação"
            descricao="Números da consolidação das planilhas."
          />
        </section>
      </div>
    </>
  );
}

function AtalhoRapido({
  href,
  icone,
  titulo,
  descricao,
}: {
  href: string;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
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
