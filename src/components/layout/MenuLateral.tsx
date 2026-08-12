'use client';

import { useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Calculator,
  CalendarCheck,
  ChevronLeft,
  ClipboardList,
  FileSpreadsheet,
  FileStack,
  Home,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';

import { MarcaMPC } from '@/components/MarcaMPC';
import { Selo, cn } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { PERMISSOES, pode, rotuloArea, rotuloRole } from '@/lib/permissoes';
import type { PerfilComPermissoes } from '@/types/banco';

interface ItemMenu {
  rotulo: string;
  href: string;
  icone: typeof Home;
  /** Permissão exigida — a mesma chave que o admin marca no checkbox. */
  permissao: string;
  grupo: 'principal' | 'administracao' | 'areas' | 'conta';
  selo?: string;
}

/**
 * O menu é derivado das permissões, não de `role`/`area`. Conceder uma
 * permissão faz o item aparecer; revogar faz sumir — sem tocar em código.
 */
const ITENS: ItemMenu[] = [
  { rotulo: 'Início', href: '/inicio', icone: Home, grupo: 'principal', permissao: PERMISSOES.telaInicio },
  { rotulo: 'Dashboard', href: '/dashboard', icone: LayoutDashboard, grupo: 'principal', permissao: PERMISSOES.telaDashboard },
  { rotulo: 'Planilha Legalização', href: '/legalizacao', icone: FileSpreadsheet, grupo: 'principal', permissao: PERMISSOES.telaLegalizacao },
  { rotulo: 'Controle Geral', href: '/controle-geral', icone: ClipboardList, grupo: 'principal', permissao: PERMISSOES.telaProcessos },
  { rotulo: 'Planilha ADM', href: '/administrativo', icone: Receipt, grupo: 'principal', permissao: PERMISSOES.telaAdministrativo, selo: 'Restrito' },
  { rotulo: 'Atribuições', href: '/atribuicoes', icone: CalendarCheck, grupo: 'principal', permissao: PERMISSOES.telaAtribuicoes },
  { rotulo: 'Consultas por cidade', href: '/referencias', icone: Link2, grupo: 'principal', permissao: PERMISSOES.telaReferencias },
  { rotulo: 'Importações', href: '/importacoes', icone: FileStack, grupo: 'principal', permissao: PERMISSOES.telaImportacoes },

  { rotulo: 'Usuários', href: '/usuarios', icone: Users, grupo: 'administracao', permissao: PERMISSOES.gerenciarUsuarios },
  { rotulo: 'Auditoria', href: '/auditoria', icone: ScrollText, grupo: 'administracao', permissao: PERMISSOES.telaAuditoria },
  { rotulo: 'Configurações', href: '/configuracoes', icone: Settings, grupo: 'administracao', permissao: PERMISSOES.telaConfiguracoes },

  { rotulo: 'Fiscal', href: '/fiscal', icone: Calculator, grupo: 'areas', permissao: PERMISSOES.telaFiscal },
  { rotulo: 'Contábil', href: '/contabil', icone: Building2, grupo: 'areas', permissao: PERMISSOES.telaContabil },
  { rotulo: 'Departamento Pessoal', href: '/departamento-pessoal', icone: Users, grupo: 'areas', permissao: PERMISSOES.telaDp },
];

const TITULOS_GRUPO: Record<ItemMenu['grupo'], string | null> = {
  principal: null,
  administracao: 'Administração',
  areas: 'Outras áreas',
  conta: 'Conta',
};

export function MenuLateral({
  perfil,
  avisos = {},
}: {
  perfil: PerfilComPermissoes;
  /** Contagem por rota, ex.: `{ '/controle-geral': 3 }` para processos atrasados. */
  avisos?: Record<string, number>;
}) {
  const [abertoMobile, setAbertoMobile] = useState(false);
  const [recolhido, setRecolhido] = useState(false);

  return (
    <>
      {/* Barra superior — apenas em telas pequenas */}
      <header className="sem-impressao sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-superficie-elevada px-4 lg:hidden">
        <MarcaMPC tamanho="sm" />
        <button
          onClick={() => setAbertoMobile(true)}
          className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {abertoMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setAbertoMobile(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'sem-impressao fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-borda bg-superficie-elevada transition-transform duration-200',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          abertoMobile ? 'translate-x-0' : '-translate-x-full',
          recolhido && 'lg:w-[74px]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-borda px-4">
          {recolhido ? (
            <div className="mx-auto hidden lg:block">
              <MarcaMPC tamanho="sm" somenteSimbolo />
            </div>
          ) : (
            <MarcaMPC tamanho="sm" />
          )}

          <button
            onClick={() => setAbertoMobile(false)}
            className="rounded-lg p-1.5 text-texto-fraco hover:bg-superficie lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>

          <button
            onClick={() => setRecolhido((v) => !v)}
            className={cn(
              'hidden rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-superficie hover:text-texto lg:block',
              recolhido && 'absolute right-1.5',
            )}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', recolhido && 'rotate-180')} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Menu principal">
          {(['principal', 'administracao', 'areas'] as const).map((grupo) => {
            const itens = ITENS.filter(
              (item) => item.grupo === grupo && pode(perfil, item.permissao),
            );
            if (itens.length === 0) return null;

            return (
              <div key={grupo}>
                {TITULOS_GRUPO[grupo] && !recolhido && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">
                    {TITULOS_GRUPO[grupo]}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {itens.map((item) => (
                    <li key={item.href}>
                      <ItemNavegacao
                        item={item}
                        recolhido={recolhido}
                        aviso={avisos[item.href] ?? 0}
                        aoNavegar={() => setAbertoMobile(false)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div>
            {!recolhido && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-texto-fraco">
                Conta
              </p>
            )}
            <ul className="space-y-0.5">
              <li>
                <ItemNavegacao
                  item={{
                    rotulo: 'Meu perfil',
                    href: '/perfil',
                    icone: UserCircle,
                    grupo: 'conta',
                    permissao: '',
                  }}
                  recolhido={recolhido}
                  aoNavegar={() => setAbertoMobile(false)}
                />
              </li>
            </ul>
          </div>
        </nav>

        <RodapeMenu perfil={perfil} recolhido={recolhido} />
      </aside>
    </>
  );
}

function ItemNavegacao({
  item,
  recolhido,
  aviso = 0,
  aoNavegar,
}: {
  item: ItemMenu;
  recolhido: boolean;
  /** Pendência que merece atenção — hoje, processos com prazo vencido. */
  aviso?: number;
  aoNavegar: () => void;
}) {
  const pathname = usePathname();
  const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icone = item.icone;

  return (
    <Link
      href={item.href}
      onClick={aoNavegar}
      title={recolhido ? `${item.rotulo}${aviso > 0 ? ` — ${aviso} em atraso` : ''}` : undefined}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        ativo ? 'bg-marca-50 text-marca-800' : 'text-texto-suave hover:bg-superficie hover:text-texto',
        recolhido && 'lg:justify-center lg:px-2',
      )}
    >
      <span className="relative shrink-0">
        <Icone className={cn('h-4.5 w-4.5', ativo ? 'text-marca-600' : 'text-texto-fraco')} />
        {/* Recolhido não há espaço para o número: um ponto avisa que há algo. */}
        {aviso > 0 && recolhido && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-erro" aria-hidden />
        )}
      </span>
      {!recolhido && (
        <>
          <span className="flex-1 truncate">{item.rotulo}</span>
          {aviso > 0 && (
            <span
              className="shrink-0 rounded-full bg-erro px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
              title={`${aviso} com prazo vencido`}
            >
              {aviso > 99 ? '99+' : aviso}
            </span>
          )}
          {item.selo && (
            <Selo tom="alerta" className="shrink-0 text-[10px]">
              {item.selo}
            </Selo>
          )}
        </>
      )}
    </Link>
  );
}

function RodapeMenu({ perfil, recolhido }: { perfil: PerfilComPermissoes; recolhido: boolean }) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    // Load completo garante que o servidor deixe de ver a sessão encerrada.
    window.location.assign('/login');
  }

  const iniciais = perfil.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="shrink-0 border-t border-borda p-3">
      {!recolhido && (
        <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-800">
            {iniciais || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-texto">{perfil.nome}</p>
            <p className="flex items-center gap-1 truncate text-xs text-texto-fraco">
              {perfil.role === 'admin' && <ShieldCheck className="h-3 w-3 text-marca-600" />}
              {rotuloRole(perfil.role)} · {rotuloArea(perfil.area)}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={sair}
        disabled={saindo}
        title={recolhido ? 'Sair' : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-texto-suave transition-colors hover:bg-erro-suave hover:text-erro disabled:opacity-60',
          recolhido && 'lg:justify-center lg:px-2',
        )}
      >
        <LogOut className="h-4.5 w-4.5 shrink-0" />
        {!recolhido && <span>{saindo ? 'Saindo…' : 'Sair'}</span>}
      </button>
    </div>
  );
}
