'use client';

import { useState, type FormEvent } from 'react';

import { CheckCircle2, Mail } from 'lucide-react';

import { Botao, Campo } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';

export function FormularioRecuperacao() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const supabase = criarClienteNavegador();
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${site}/auth/callback?proximo=/redefinir-senha`,
      });

      // Mesmo com erro de e-mail inexistente, a resposta é idêntica:
      // não revelamos quais e-mails têm conta no portal.
      if (error && !error.message.toLowerCase().includes('user not found')) {
        setErro('Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.');
        return;
      }
      setEnviado(true);
    } catch {
      setErro('Erro inesperado. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <div className="mt-8 rounded-lg border border-green-200 bg-sucesso-suave p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sucesso" />
          <div className="text-sm">
            <p className="font-medium text-sucesso">E-mail enviado</p>
            <p className="mt-1 leading-relaxed text-texto-suave">
              Se existir uma conta ativa para <strong>{email}</strong>, o link de redefinição chegará
              em instantes. Confira também a caixa de spam.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="mt-8 space-y-4" noValidate>
      <Campo
        rotulo="E-mail"
        type="email"
        required
        autoComplete="email"
        placeholder="nome@metaplanocontabil.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={carregando}
        iconeInicial={<Mail className="h-4 w-4" />}
      />

      {erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro">
          {erro}
        </div>
      )}

      <Botao type="submit" carregando={carregando} className="w-full" tamanho="lg">
        Enviar link de recuperação
      </Botao>
    </form>
  );
}
