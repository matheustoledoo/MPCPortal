import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ShieldCheck } from 'lucide-react';

import { FormularioLogin } from '@/app/login/FormularioLogin';
import { MarcaMPC } from '@/components/MarcaMPC';
import { obterPerfilAtual } from '@/lib/supabase/server';
import { rotaInicial } from '@/lib/permissoes';

export const metadata = { title: 'Entrar' };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (perfil) redirect(rotaInicial(perfil));

  const { proximo } = await searchParams;

  return (
    <main className="flex min-h-screen">
      {/* Painel institucional — recolhido em telas pequenas */}
      <section className="relative hidden w-1/2 flex-col justify-between bg-marca-800 p-12 text-white lg:flex xl:w-[55%]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden
        />
        <MarcaMPC tamanho="md" invertido />

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            A gestão do escritório em um só lugar.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-marca-100">
            O PortalMPC substitui as planilhas de trabalho por uma base única, com histórico de
            alterações, controle de acesso por área e permissões aplicadas no próprio banco de dados.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
            <div>
              <dt className="text-xs uppercase tracking-wide text-marca-200">Módulo ativo</dt>
              <dd className="mt-1 text-lg font-semibold">Legalização</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-marca-200">Áreas previstas</dt>
              <dd className="mt-1 text-lg font-semibold">5</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-marca-200">Auditoria</dt>
              <dd className="mt-1 text-lg font-semibold">Completa</dd>
            </div>
          </dl>
        </div>

        <p className="relative flex items-center gap-2 text-sm text-marca-200">
          <ShieldCheck className="h-4 w-4" />
          Acesso restrito a colaboradores autorizados.
        </p>
      </section>

      {/* Formulário */}
      <section className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 xl:w-[45%]">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <MarcaMPC tamanho="md" />
          </div>

          <div className="mt-8 lg:mt-0">
            <h2 className="text-2xl font-semibold tracking-tight text-texto">Entrar no portal</h2>
            <p className="mt-2 text-sm text-texto-suave">
              Use o e-mail corporativo cadastrado pelo administrador.
            </p>
          </div>

          <FormularioLogin proximo={proximo} />

          <p className="mt-8 border-t border-borda pt-6 text-xs leading-relaxed text-texto-fraco">
            Ainda não tem acesso? Solicite ao administrador do escritório a criação do seu usuário,
            informando a área em que você atua.
          </p>

          <p className="mt-4 text-center text-xs text-texto-fraco">
            <Link href="/recuperar-senha" className="font-medium text-marca-700 hover:underline">
              Esqueci minha senha
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
