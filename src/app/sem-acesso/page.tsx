import Link from 'next/link';

import { ShieldX } from 'lucide-react';

import { MarcaMPC } from '@/components/MarcaMPC';
import { Cartao } from '@/components/ui';
import { obterPerfilAtual } from '@/lib/supabase/server';
import { rotuloArea } from '@/lib/permissoes';

export const metadata = { title: 'Acesso negado' };

export default async function PaginaSemAcesso() {
  const perfil = await obterPerfilAtual();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <MarcaMPC tamanho="md" />
        </div>

        <Cartao className="mt-10 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-erro-suave text-erro">
            <ShieldX className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-lg font-semibold text-texto">Acesso não autorizado</h1>

          <p className="mt-2 text-sm leading-relaxed text-texto-suave">
            {!perfil
              ? 'Sua sessão não é válida. Entre novamente para continuar.'
              : !perfil.ativo
                ? 'Seu acesso ao PortalMPC está desativado. Procure o administrador do escritório.'
                : `Seu perfil (${rotuloArea(perfil.area)}) não tem permissão para abrir esta página.`}
          </p>

          {perfil?.ativo && (
            <p className="mt-4 rounded-lg border border-borda bg-superficie px-3.5 py-2.5 text-xs leading-relaxed text-texto-suave">
              As permissões do PortalMPC são aplicadas no banco de dados. Mesmo acessando a URL
              diretamente, os dados restritos não são entregues.
            </p>
          )}

          <div className="mt-7 flex justify-center gap-2">
            <Link
              href="/"
              className="inline-flex h-9.5 items-center rounded-lg bg-marca-700 px-4 text-sm font-medium text-white transition-colors hover:bg-marca-800"
            >
              Ir para minha área
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9.5 items-center rounded-lg border border-borda-forte bg-white px-4 text-sm font-medium text-texto transition-colors hover:bg-superficie"
            >
              Entrar com outra conta
            </Link>
          </div>
        </Cartao>
      </div>
    </main>
  );
}
