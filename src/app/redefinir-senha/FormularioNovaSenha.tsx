'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Lock } from 'lucide-react';

import { Botao, Campo, Carregando } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';

export function FormularioNovaSenha() {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [sessaoValida, setSessaoValida] = useState<boolean | null>(null);

  // O link de recuperação cria uma sessão temporária; sem ela não há o que redefinir.
  useEffect(() => {
    const supabase = criarClienteNavegador();
    supabase.auth.getSession().then(({ data }) => setSessaoValida(Boolean(data.session)));
  }, []);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }

    setCarregando(true);
    try {
      const supabase = criarClienteNavegador();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro('Não foi possível alterar a senha. Solicite um novo link de recuperação.');
        return;
      }
      // Load completo: o servidor decide a rota inicial com o cookie novo.
      window.location.assign('/');
      return;
    } finally {
      setCarregando(false);
    }
  }

  if (sessaoValida === null) return <Carregando texto="Validando link…" />;

  if (!sessaoValida) {
    return (
      <div className="mt-8 rounded-lg border border-amber-200 bg-alerta-suave p-4 text-sm">
        <p className="font-medium text-alerta">Link inválido ou expirado</p>
        <p className="mt-1 leading-relaxed text-texto-suave">
          Peça um novo link em{' '}
          <a href="/recuperar-senha" className="font-medium text-marca-700 hover:underline">
            recuperar senha
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="mt-8 space-y-4" noValidate>
      <Campo
        rotulo="Nova senha"
        type="password"
        required
        autoComplete="new-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        disabled={carregando}
        iconeInicial={<Lock className="h-4 w-4" />}
      />
      <Campo
        rotulo="Confirmar nova senha"
        type="password"
        required
        autoComplete="new-password"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        disabled={carregando}
        iconeInicial={<Lock className="h-4 w-4" />}
      />

      {erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro">
          {erro}
        </div>
      )}

      <Botao type="submit" carregando={carregando} className="w-full" tamanho="lg">
        Salvar nova senha
      </Botao>
    </form>
  );
}
