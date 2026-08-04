'use client';

import { useState, type FormEvent } from 'react';

import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

import { Botao, Campo } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';

/** Traduz os erros do Supabase Auth para mensagens úteis em português. */
function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente novamente.';
  if (m.includes('network') || m.includes('fetch')) return 'Falha de conexão. Verifique sua internet.';

  // Falha no servidor de autenticação — tipicamente conta criada por SQL com
  // colunas de token em NULL. A migration 0009 corrige; sem uma mensagem
  // específica isso vira "não foi possível entrar" e custa horas de busca.
  if (m.includes('database error') || m.includes('querying schema')) {
    return 'O servidor de autenticação recusou a consulta. Rode a migration 0009 ou recrie o usuário com "npm run seed:usuarios".';
  }
  if (m.includes('invalid api key') || m.includes('no api key')) {
    return 'Chave do Supabase inválida. Confira NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local.';
  }

  return `Não foi possível entrar (${mensagem}).`;
}

export function FormularioLogin({ proximo }: { proximo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const supabase = criarClienteNavegador();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });

      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }

      // Usuário desativado ou sem perfil não entra, mesmo com senha correta.
      const { data: perfil } = await supabase
        .from('profiles')
        .select('ativo, area, role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!perfil) {
        await supabase.auth.signOut();
        setErro('Seu usuário ainda não tem perfil configurado. Procure o administrador.');
        return;
      }
      if (!perfil.ativo) {
        await supabase.auth.signOut();
        setErro('Seu acesso está desativado. Procure o administrador do escritório.');
        return;
      }

      await supabase
        .from('profiles')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', data.user.id);

      // O destino final é decidido no servidor, com base em área e função.
      router.replace(proximo && proximo.startsWith('/') ? proximo : '/');
      router.refresh();
    } catch {
      setErro('Erro inesperado ao entrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} className="mt-8 space-y-4" noValidate>
      <Campo
        rotulo="E-mail"
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder="nome@metaplanocontabil.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={carregando}
        iconeInicial={<Mail className="h-4 w-4" />}
      />

      <div className="relative">
        <Campo
          rotulo="Senha"
          type={mostrarSenha ? 'text' : 'password'}
          name="senha"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          disabled={carregando}
          iconeInicial={<Lock className="h-4 w-4" />}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setMostrarSenha((v) => !v)}
          className="absolute right-3 top-[38px] text-texto-fraco transition-colors hover:text-texto"
          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
        >
          {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {erro && (
        <div
          role="alert"
          className="animar-surgir rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro"
        >
          {erro}
        </div>
      )}

      <Botao type="submit" carregando={carregando} className="w-full" tamanho="lg">
        {carregando ? 'Entrando…' : 'Entrar'}
      </Botao>
    </form>
  );
}
