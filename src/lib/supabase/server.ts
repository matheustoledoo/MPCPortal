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

/**
 * Resultado de identificar o usuário da requisição.
 *
 * `indisponivel` existe para separar "não está logado" de "não consegui
 * perguntar". Tratar os dois como a mesma coisa manda para o login quem já
 * está autenticado — e, quando a causa é de rede, isso vira um laço infinito
 * entre `/login` e a página de destino.
 */
export type ResultadoPerfil =
  | { estado: 'autenticado'; perfil: Perfil }
  | { estado: 'sem-sessao' }
  | { estado: 'inativo'; perfil: Perfil }
  | { estado: 'indisponivel'; detalhe: string };

/** Erro de rede/TLS ao falar com o Supabase, e não recusa de credencial. */
export function ehFalhaDeRede(erro: unknown): boolean {
  if (!erro) return false;

  const alvo = erro as { name?: string; message?: string; status?: number; __isAuthError?: boolean };
  // O Supabase marca falhas de transporte com status 0 (nenhuma resposta HTTP).
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

/**
 * Identifica o usuário da requisição, distinguindo os quatro desfechos.
 * Nunca lança: quem chama decide o que fazer com cada estado.
 */
export async function obterResultadoPerfil(): Promise<ResultadoPerfil> {
  const supabase = await criarClienteServidor();

  let userId: string;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (ehFalhaDeRede(error)) return { estado: 'indisponivel', detalhe: error.message };
      return { estado: 'sem-sessao' };
    }
    if (!data.user) return { estado: 'sem-sessao' };
    userId = data.user.id;
  } catch (erro) {
    if (ehFalhaDeRede(erro)) {
      return { estado: 'indisponivel', detalhe: erro instanceof Error ? erro.message : String(erro) };
    }
    return { estado: 'sem-sessao' };
  }

  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      if (ehFalhaDeRede(error)) return { estado: 'indisponivel', detalhe: error.message };
      return { estado: 'sem-sessao' };
    }
    if (!data) return { estado: 'sem-sessao' };

    const perfil = data as Perfil;
    return perfil.ativo ? { estado: 'autenticado', perfil } : { estado: 'inativo', perfil };
  } catch (erro) {
    if (ehFalhaDeRede(erro)) {
      return { estado: 'indisponivel', detalhe: erro instanceof Error ? erro.message : String(erro) };
    }
    return { estado: 'sem-sessao' };
  }
}

/**
 * Perfil do usuário autenticado, ou null.
 * Mantido para chamadas que não precisam distinguir os motivos da ausência.
 */
export async function obterPerfilAtual(): Promise<Perfil | null> {
  const resultado = await obterResultadoPerfil();
  return resultado.estado === 'autenticado' ? resultado.perfil : null;
}
