import { FormularioNovaSenha } from '@/app/redefinir-senha/FormularioNovaSenha';
import { MarcaMPC } from '@/components/MarcaMPC';

export const metadata = { title: 'Definir nova senha' };

export default function PaginaRedefinirSenha() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <MarcaMPC tamanho="md" />

        <h1 className="mt-10 text-2xl font-semibold tracking-tight text-texto">Definir nova senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-texto-suave">
          Escolha uma senha com pelo menos 8 caracteres, combinando letras e números.
        </p>

        <FormularioNovaSenha />
      </div>
    </main>
  );
}
