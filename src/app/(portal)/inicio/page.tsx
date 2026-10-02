import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ArrowRight,
  Building2,
  CalendarCheck,
  FileSpreadsheet,
  Link2,
  UserCircle,
} from 'lucide-react';

import { MinhasAtribuicoes } from '@/components/atribuicoes/MinhasAtribuicoes';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Cartao, Indicador, Selo } from '@/components/ui';
import { COLUNAS_GERAIS } from '@/lib/colunas';
import {
  PERMISSOES,
  pode,
  podeLerLegalizacao,
  rotuloArea,
  rotuloRole,
} from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { AtribuicaoDoUsuario, EstatisticasLegalizacao } from '@/types/banco';

export const metadata = { title: 'Início' };

export default async function PaginaInicio() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');

  const supabase = await criarClienteServidor();
  const podeVerBase = podeLerLegalizacao(perfil);

  const [estatisticas, atribuicoes] = await Promise.all([
    podeVerBase ? supabase.rpc('legalizacao_estatisticas') : Promise.resolve({ data: null }),
    // Se a migration 0011 ainda não estiver aplicada, a RPC não existe:
    // o erro é ignorado e a seção simplesmente some, sem derrubar a página.
    supabase.rpc('minhas_atribuicoes'),
  ]);

  const stats = estatisticas.data as EstatisticasLegalizacao | null;
  const minhas = (atribuicoes.data ?? []) as AtribuicaoDoUsuario[];

  const rotulosColunas = Object.fromEntries(COLUNAS_GERAIS.map((c) => [c.campo, c.rotulo]));
  const primeiroNome = perfil.nome.split(' ')[0];
  const atrasadas = minhas.filter((a) => a.situacao === 'atrasada').length;

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${primeiroNome}`}
        descricao={
          atrasadas > 0
            ? `Você tem ${atrasadas} responsabilidade(s) com o prazo vencido.`
            : 'Seu ponto de partida no PortalMPC.'
        }
        acoes={
          <div className="flex gap-2">
            <Selo tom="marca">{rotuloArea(perfil.area)}</Selo>
            <Selo>{rotuloRole(perfil.role)}</Selo>
          </div>
        }
      />

      <div className="space-y-6 p-5 sm:p-7">
        <MinhasAtribuicoes iniciais={minhas} rotulosColunas={rotulosColunas} />

        {stats && (
          <section className="grid gap-4 sm:grid-cols-3">
            <Indicador
              rotulo="Empresas na base"
              valor={stats.total_empresas.toLocaleString('pt-BR')}
              icone={<Building2 className="h-4.5 w-4.5" />}
            />
            <Indicador
              rotulo="Ativas"
              valor={stats.ativas.toLocaleString('pt-BR')}
              tom="sucesso"
              detalhe={`${stats.inativas} inativas`}
            />
            <Indicador
              rotulo="Precisam de revisão"
              valor={stats.necessitam_revisao.toLocaleString('pt-BR')}
              tom={stats.necessitam_revisao > 0 ? 'alerta' : 'neutro'}
              detalhe="cadastro com inconsistência"
            />
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {podeVerBase && (
            <Atalho
              href="/legalizacao"
              icone={<FileSpreadsheet className="h-5 w-5" />}
              titulo="Planilha Legalização"
              descricao="Consultar, filtrar e editar as empresas da carteira."
            />
          )}
          {pode(perfil, PERMISSOES.telaReferencias) && (
            <Atalho
              href="/referencias"
              icone={<Link2 className="h-5 w-5" />}
              titulo="Consultas por cidade"
              descricao="Portais das prefeituras e checklist de documentos."
            />
          )}
          {pode(perfil, PERMISSOES.telaAtribuicoes) && (
            <Atalho
              href="/atribuicoes"
              icone={<CalendarCheck className="h-5 w-5" />}
              titulo="Atribuições"
              descricao="Quem cuida de cada parte da base — e até quando."
            />
          )}
          <Atalho
            href="/perfil"
            icone={<UserCircle className="h-5 w-5" />}
            titulo="Meu perfil"
            descricao="Seus dados e alteração de senha."
          />
        </section>

        {!podeVerBase && (
          <Cartao className="p-6">
            <h2 className="text-sm font-semibold text-texto">Sua área ainda está em construção</h2>
            <p className="mt-2 text-sm leading-relaxed text-texto-suave">
              O módulo de <strong>{rotuloArea(perfil.area)}</strong> será desenvolvido nas próximas
              etapas do projeto. Por enquanto seu acesso segue exatamente o que o administrador
              marcou nas permissões — os dados de Legalização não aparecem sem essa liberação.
            </p>
          </Cartao>
        )}
      </div>
    </>
  );
}

function Atalho({
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
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-texto">{titulo}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-texto-suave">{descricao}</span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-texto-fraco transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
