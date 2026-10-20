import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Handshake,
  Heart,
  LayoutDashboard,
  Link2,
  MessageCircle,
  MessagesSquare,
  Search,
  UserCircle,
} from 'lucide-react';

import { NotificacoesInicio } from '@/app/(portal)/inicio/NotificacoesInicio';
import { MinhasAtribuicoes } from '@/components/atribuicoes/MinhasAtribuicoes';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Cartao, CabecalhoCartao, Selo, cn } from '@/components/ui';
import { COR_CATEGORIA, br } from '@/lib/calendario';
import { COLUNAS_GERAIS } from '@/lib/colunas';
import { PERMISSOES, pode, podeLerLegalizacao, rotuloArea, rotuloRole } from '@/lib/permissoes';
import { buscarProcessos, diasAtePrazo } from '@/lib/processos';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type {
  AtribuicaoDoUsuario,
  CategoriaCalendario,
  EstatisticasLegalizacao,
  Notificacao,
  PostForum,
  Processo,
} from '@/types/banco';

export const metadata = { title: 'Início' };

interface ItemAgenda {
  chave: string;
  titulo: string;
  prazo: string;
  departamento: string;
  categoria: CategoriaCalendario;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  concluido: boolean;
  inicio: boolean;
  ref: string;
}

function hojeIso(desloc = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + desloc);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saudacao(): string {
  const hora = Number(new Date().toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * O ponto de partida de cada pessoa: o que vence hoje e nos próximos dias,
 * as notificações, os processos no nome dela, as responsabilidades e o que
 * está acontecendo no Fórum. Cada bloco só aparece se a pessoa pode ver.
 */
export default async function PaginaInicio() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');

  const supabase = await criarClienteServidor();
  const podeVerBase = podeLerLegalizacao(perfil);
  const veCalendario = pode(perfil, PERMISSOES.telaCalendario);
  const veProcessos = pode(perfil, PERMISSOES.telaProcessos);
  const veForum = pode(perfil, PERMISSOES.telaForum);

  await supabase.rpc('sincronizar_minhas_notificacoes');

  const [estatisticas, atribuicoes, notificacoes, agenda, meusProcessos, posts] = await Promise.all([
    podeVerBase ? supabase.rpc('legalizacao_estatisticas') : Promise.resolve({ data: null }),
    supabase.rpc('minhas_atribuicoes'),
    supabase
      .from('notificacoes')
      .select('*')
      .is('arquivada_em', null)
      .is('concluida_em', null)
      .order('created_at', { ascending: false })
      .limit(12),
    veCalendario
      ? supabase.rpc('calendario_agenda', { p_inicio: hojeIso(-30), p_fim: hojeIso(7) })
      : Promise.resolve({ data: null }),
    veProcessos
      ? buscarProcessos(supabase, { recorte: 'abertos', responsavelId: perfil.id, ordenarPor: 'prazo', ascendente: true }).catch(() => [])
      : Promise.resolve([] as Processo[]),
    veForum ? supabase.rpc('forum_listar', { p_modo: 'todos', p_limite: 4 }) : Promise.resolve({ data: null }),
  ]);

  const stats = estatisticas.data as EstatisticasLegalizacao | null;
  const minhas = (atribuicoes.data ?? []) as AtribuicaoDoUsuario[];
  const rotulosColunas = Object.fromEntries(COLUNAS_GERAIS.map((c) => [c.campo, c.rotulo]));
  const primeiroNome = perfil.nome.split(' ')[0];
  const hoje = hojeIso();

  // Agenda: o que está no meu nome primeiro; depois o resto do departamento.
  const itensAgenda = ((agenda.data ?? []) as ItemAgenda[]).filter((o) => !o.concluido && !o.inicio);
  const atrasadosAgenda = itensAgenda.filter((o) => o.prazo < hoje);
  const hojeAgenda = itensAgenda.filter((o) => o.prazo === hoje);
  const proximosAgenda = itensAgenda.filter((o) => o.prazo > hoje);
  const ordenarMeus = (a: ItemAgenda, b: ItemAgenda) =>
    Number(b.responsavel_id === perfil.id) - Number(a.responsavel_id === perfil.id) || a.prazo.localeCompare(b.prazo);
  const blocoAgenda = [
    { titulo: 'Atrasados', itens: atrasadosAgenda.sort(ordenarMeus), tom: 'erro' as const },
    { titulo: 'Hoje', itens: hojeAgenda.sort(ordenarMeus), tom: 'alerta' as const },
    { titulo: 'Próximos 7 dias', itens: proximosAgenda.sort(ordenarMeus), tom: 'neutro' as const },
  ];

  const processos = meusProcessos as Processo[];
  const atrasadasAtribuicoes = minhas.filter((a) => a.situacao === 'atrasada').length;
  const listaNotificacoes = (notificacoes.data ?? []) as Notificacao[];
  const urgentes = listaNotificacoes.filter((n) => n.prioridade === 'urgente').length;
  const feed = (posts.data ?? []) as PostForum[];

  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  });

  const pendencias =
    atrasadosAgenda.filter((o) => o.responsavel_id === perfil.id).length +
    processos.filter((p) => p.prazo && diasAtePrazo(p.prazo) < 0).length +
    atrasadasAtribuicoes;

  const atalhos = [
    podeVerBase && { href: '/legalizacao', icone: FileSpreadsheet, titulo: 'Planilha Legalização', descricao: 'Filtrar, editar e importar.' },
    veProcessos && { href: '/controle-legalizacao', icone: ClipboardList, titulo: 'Controle Legalização', descricao: 'Processos nos órgãos.' },
    veCalendario && { href: '/calendario', icone: CalendarDays, titulo: 'Calendário', descricao: 'Obrigações e demandas do mês.' },
    pode(perfil, PERMISSOES.telaIntegracao) && { href: '/integracao-clientes', icone: Handshake, titulo: 'Integração', descricao: 'Roteiro do cliente novo.' },
    veForum && { href: '/forum', icone: MessagesSquare, titulo: 'Fórum da Meta', descricao: 'Fale com a equipe.' },
    pode(perfil, PERMISSOES.telaDashboard) && { href: '/dashboard', icone: LayoutDashboard, titulo: 'Dashboard', descricao: 'Números da carteira.' },
    pode(perfil, PERMISSOES.telaReferencias) && { href: '/referencias', icone: Link2, titulo: 'Consultas por cidade', descricao: 'Portais de todo o Brasil.' },
    pode(perfil, PERMISSOES.telaAtribuicoes) && { href: '/atribuicoes', icone: CalendarCheck, titulo: 'Atribuições', descricao: 'Quem cuida de quê.' },
    { href: '/perfil', icone: UserCircle, titulo: 'Meu perfil', descricao: 'Dados e senha.' },
  ].filter(Boolean) as { href: string; icone: typeof Search; titulo: string; descricao: string }[];

  return (
    <>
      <CabecalhoPagina
        titulo={`${saudacao()}, ${primeiroNome}`}
        descricao={
          <span>
            {dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)}
            {pendencias > 0
              ? ` · você tem ${pendencias} pendência(s) com prazo vencido.`
              : ' · nenhuma pendência vencida no seu nome. 🎉'}
          </span>
        }
        acoes={
          <div className="flex flex-wrap gap-2">
            <Selo tom="marca">{rotuloArea(perfil.area)}</Selo>
            <Selo>{rotuloRole(perfil.role)}</Selo>
            {urgentes > 0 && (
              <Link href="/notificacoes">
                <Selo tom="erro">
                  <AlertTriangle className="h-3 w-3" /> {urgentes} urgente(s)
                </Selo>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {veCalendario && (
            <Cartao>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-marca-600" /> Minha agenda
                  </span>
                }
                descricao="Obrigações e demandas do seu departamento ainda não concluídas. As suas aparecem primeiro."
                acoes={
                  <Link href="/calendario" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
                    Abrir calendário <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {itensAgenda.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-texto-suave">Nada pendente nos últimos 30 dias nem nos próximos 7.</p>
              ) : (
                <div className="divide-y divide-borda">
                  {blocoAgenda
                    .filter((b) => b.itens.length > 0)
                    .map((bloco) => (
                      <div key={bloco.titulo} className="px-5 py-3">
                        <p
                          className={cn(
                            'mb-2 text-[11px] font-semibold uppercase tracking-wide',
                            bloco.tom === 'erro' ? 'text-erro' : bloco.tom === 'alerta' ? 'text-alerta' : 'text-texto-fraco',
                          )}
                        >
                          {bloco.titulo} · {bloco.itens.length}
                        </p>
                        <ul className="space-y-1.5">
                          {bloco.itens.slice(0, 6).map((o) => (
                            <li key={o.chave}>
                              <Link
                                href={`/calendario?data=${o.prazo}&item=${encodeURIComponent(o.chave)}`}
                                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-superficie"
                              >
                                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: COR_CATEGORIA[o.categoria] }} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-texto group-hover:text-marca-800">{o.titulo}</span>
                                  <span className="block truncate text-xs text-texto-suave">
                                    {[o.departamento, o.ref, o.responsavel_nome ? `👤 ${o.responsavel_nome}` : 'sem responsável'].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                                {o.responsavel_id === perfil.id && <Selo tom="marca" className="text-[10px]">seu</Selo>}
                                <span className="shrink-0 text-xs tabular-nums text-texto-suave">{br(o.prazo).slice(0, 5)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {bloco.itens.length > 6 && <p className="mt-1 px-2 text-[11px] text-texto-fraco">+ {bloco.itens.length - 6} no calendário</p>}
                      </div>
                    ))}
                </div>
              )}
            </Cartao>
          )}

          <NotificacoesInicio iniciais={listaNotificacoes} usuarioId={perfil.id} nome={perfil.nome} />

          {veProcessos && (
            <Cartao>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-marca-600" /> Processos no meu nome
                  </span>
                }
                descricao="Em aberto no Controle Legalização, pelo prazo mais próximo."
                acoes={
                  <Link href={`/controle-legalizacao`} className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
                    Ver todos <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {processos.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-texto-suave">Nenhum processo aberto no seu nome.</p>
              ) : (
                <ul className="divide-y divide-borda">
                  {processos.slice(0, 6).map((p) => {
                    const dias = p.prazo ? diasAtePrazo(p.prazo) : null;
                    return (
                      <li key={p.id}>
                        <Link href={`/controle-legalizacao?processo=${p.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-superficie">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-texto">{p.empresa}</span>
                            <span className="block truncate text-xs text-texto-suave">
                              {[p.tipo_servico, p.orgao, p.status].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {dias !== null ? (
                            <Selo tom={dias < 0 ? 'erro' : dias <= 3 ? 'alerta' : 'neutro'}>
                              {dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'vence hoje' : `em ${dias}d`}
                            </Selo>
                          ) : (
                            <Selo>sem prazo</Selo>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Cartao>
          )}

          <MinhasAtribuicoes iniciais={minhas} rotulosColunas={rotulosColunas} />
        </div>

        <div className="space-y-6">
          <Cartao>
            <CabecalhoCartao titulo="Atalhos" descricao="Só o que você pode abrir." />
            <div className="grid grid-cols-2 gap-2 p-3">
              {atalhos.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex flex-col gap-1.5 rounded-lg border border-borda p-3 transition-colors hover:border-marca-300 hover:bg-marca-50/50"
                >
                  <a.icone className="h-4.5 w-4.5 text-marca-600" />
                  <span className="text-xs font-semibold text-texto">{a.titulo}</span>
                  <span className="text-[11px] leading-snug text-texto-suave">{a.descricao}</span>
                </Link>
              ))}
            </div>
            <p className="border-t border-borda px-4 py-2.5 text-[11px] text-texto-fraco">
              Dica: <kbd className="rounded border border-borda px-1 font-sans">Ctrl</kbd> +{' '}
              <kbd className="rounded border border-borda px-1 font-sans">K</kbd> busca qualquer coisa no portal.
            </p>
          </Cartao>

          {veForum && (
            <Cartao>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    <MessagesSquare className="h-4 w-4 text-marca-600" /> No Fórum da Meta
                  </span>
                }
                acoes={
                  <Link href="/forum" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {feed.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-texto-suave">Ninguém postou ainda.</p>
                  <Link href="/forum" className="mt-2 inline-block text-sm font-medium text-marca-700 hover:underline">
                    Seja a primeira pessoa a postar
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-borda">
                  {feed.map((p) => (
                    <li key={p.id}>
                      <Link href={`/forum/post/${p.id}`} className="block px-5 py-3 transition-colors hover:bg-superficie">
                        <p className="text-xs font-semibold text-texto">
                          {p.autor?.nome} <span className="font-normal text-texto-fraco">@{p.autor?.apelido}</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-texto-suave">{p.texto || (p.imagens.length ? '📷 Foto' : '')}</p>
                        <p className="mt-1 flex gap-3 text-[11px] text-texto-fraco">
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {p.curtidas}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" /> {p.respostas}
                          </span>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}

          {stats && (
            <Cartao>
              <CabecalhoCartao
                titulo={
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-marca-600" /> Base de Legalização
                  </span>
                }
              />
              <div className="grid grid-cols-3 gap-2 p-4 text-center">
                <Link href="/legalizacao" className="rounded-lg bg-superficie px-2 py-3 hover:bg-marca-50">
                  <p className="text-lg font-semibold tabular-nums text-texto">{stats.total_empresas}</p>
                  <p className="text-[11px] text-texto-suave">empresas</p>
                </Link>
                <Link href="/legalizacao?f.status=ATIVO" className="rounded-lg bg-superficie px-2 py-3 hover:bg-marca-50">
                  <p className="text-lg font-semibold tabular-nums text-sucesso">{stats.ativas}</p>
                  <p className="text-[11px] text-texto-suave">ativas</p>
                </Link>
                <Link href="/legalizacao?f.necessita_revisao=Sim" className="rounded-lg bg-superficie px-2 py-3 hover:bg-marca-50">
                  <p className={cn('text-lg font-semibold tabular-nums', stats.necessitam_revisao ? 'text-alerta' : 'text-texto')}>
                    {stats.necessitam_revisao}
                  </p>
                  <p className="text-[11px] text-texto-suave">para revisar</p>
                </Link>
              </div>
            </Cartao>
          )}

          {!podeVerBase && !veCalendario && !veProcessos && (
            <Cartao className="p-6">
              <h2 className="text-sm font-semibold text-texto">Seu acesso está sendo preparado</h2>
              <p className="mt-2 text-sm leading-relaxed text-texto-suave">
                O que aparece no portal segue exatamente o que o administrador liberou nas suas
                permissões. Assim que novas telas forem liberadas, elas surgem no menu e aqui.
              </p>
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
