import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr';

import type { Perfil } from '@/types/banco';

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * A sessão vem dos cookies, então toda consulta roda sob a RLS do usuário.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component não pode escrever cookie: o middleware já renova a sessão.
          }
        },
      },
    },
  );
}

/** Perfil do usuário autenticado, ou null se não houver sessão válida. */
export async function obterPerfilAtual(): Promise<Perfil | null> {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return (data as Perfil | null) ?? null;
}
