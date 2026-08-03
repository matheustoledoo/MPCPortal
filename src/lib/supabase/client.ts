'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase do navegador.
 * Usa somente a chave pública. A service_role NUNCA aparece aqui.
 */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
