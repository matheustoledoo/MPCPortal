import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { FormularioRecuperacao } from '@/app/recuperar-senha/FormularioRecuperacao';
import { MarcaMPC } from '@/components/MarcaMPC';

export const metadata = { title: 'Recuperar senha' };

export default function PaginaRecuperarSenha() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <MarcaMPC tamanho="md" />

        <h1 className="mt-10 text-2xl font-semibold tracking-tight text-texto">Recuperar senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-texto-suave">
          Informe seu e-mail corporativo. Se houver uma conta ativa, enviaremos um link para você
          definir uma nova senha.
        </p>

        <FormularioRecuperacao />

        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Link>
      </div>
    </main>
  );
}
