'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';

import { MarcaMPC } from '@/components/MarcaMPC';
import { BuscaGlobal } from '@/components/layout/BuscaGlobal';
import { EVENTO_ABRIR_MENU, itensDoMenu } from '@/components/layout/MenuLateral';
import { SinoNotificacoes } from '@/components/layout/SinoNotificacoes';
import type { PerfilComPermissoes } from '@/types/banco';

/**
 * Faixa fixa no topo de todas as telas: busca global (Ctrl+K) e o sininho
 * de notificações. No celular também abre o menu.
 */
export function BarraSuperior({ perfil }: { perfil: PerfilComPermissoes }) {
  const iniciais = perfil.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header className="sem-impressao sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie-elevada/95 px-4 backdrop-blur sm:px-6">
      <button
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))}
        className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="lg:hidden">
        <MarcaMPC tamanho="sm" somenteSimbolo />
      </div>

      <div className="flex min-w-0 flex-1 justify-center lg:justify-start">
        <BuscaGlobal telas={itensDoMenu(perfil)} />
      </div>

      <div className="flex items-center gap-1.5">
        <SinoNotificacoes usuarioId={perfil.id} nome={perfil.nome} />
        <Link
          href="/perfil"
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-800 transition-colors hover:bg-marca-200 sm:flex"
          title={`${perfil.nome} — meu perfil`}
        >
          {iniciais || '?'}
        </Link>
      </div>
    </header>
  );
}
