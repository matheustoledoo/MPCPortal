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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
