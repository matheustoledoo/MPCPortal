import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

/**
 * Primeira barreira de proteção de rotas.
 *
 * Responsabilidades:
 *  - renovar o cookie de sessão a cada navegação (evita sessão expirada silenciosa);
 *  - bloquear rotas do portal para quem não está autenticado;
 *  - impedir que um usuário logado volte para a tela de login.
 *
 * A checagem fina de área/função acontece no layout do portal (com o perfil
 * carregado) e, definitivamente, nas políticas de RLS do banco.
 */

const ROTAS_PUBLICAS = ['/login', '/recuperar-senha', '/redefinir-senha', '/auth'];

/** Distingue falha de rede/TLS de recusa de credencial. */
function ehFalhaDeRede(erro: unknown): boolean {
  if (!erro) return false;
  const alvo = erro as { name?: string; message?: string; status?: number; __isAuthError?: boolean };
  if (alvo.__isAuthError && alvo.status === 0) return true;
  if (alvo.name === 'AuthRetryableFetchError') return true;
  const texto = `${alvo.name ?? ''} ${alvo.message ?? ''}`.toLowerCase();
  return (
    texto.includes('fetch failed') ||
    texto.includes('econnrefused') ||
    texto.includes('enotfound') ||
    texto.includes('etimedout') ||
    texto.includes('certificate') ||
    texto.includes('self-signed') ||
    texto.includes('unable to verify')
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let user = null;
  let indisponivel = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && ehFalhaDeRede(error)) indisponivel = true;
    else user = data?.user ?? null;
  } catch (erro) {
    if (ehFalhaDeRede(erro)) indisponivel = true;
    else throw erro;
  }

  /**
   * Servidor de autenticação inacessível (proxy corporativo, TLS, offline).
   *
   * Aqui NÃO se redireciona para o login: "não consegui verificar" é diferente
   * de "não está logado". Tratar como o mesmo caso jogava o usuário recém
   * autenticado de volta ao login num laço — o cookie existia, mas o servidor
   * não conseguia validá-lo.
   *
   * A requisição segue e a própria página mostra o diagnóstico. Não há risco
   * de vazamento: sem alcançar o Supabase, nenhuma consulta traz dados, e a
   * RLS continua sendo a barreira real.
   */
  if (indisponivel) {
    response.headers.set('x-portalmpc-auth', 'indisponivel');
    return response;
  }

  const { pathname } = request.nextUrl;
  const ehPublica = ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota));

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserva o destino para retomar a navegação depois do login.
    if (pathname !== '/') url.searchParams.set('proximo', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
