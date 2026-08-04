import { NextResponse, type NextRequest } from 'next/server';

import { criarClienteServidor } from '@/lib/supabase/server';

/**
 * Troca o código do link de e-mail (recuperação de senha, convite) por uma
 * sessão válida e encaminha o usuário para o destino solicitado.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const proximoBruto = searchParams.get('proximo') ?? '/';

  // Só aceita caminho relativo: evita redirecionamento para domínio externo.
  const proximo = proximoBruto.startsWith('/') && !proximoBruto.startsWith('//') ? proximoBruto : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_expirado`);
  }

  return NextResponse.redirect(`${origin}${proximo}`);
}
