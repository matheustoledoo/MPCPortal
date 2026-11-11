import { redirect } from 'next/navigation';

import { ChatApp } from '@/app/(portal)/chat/ChatApp';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { ConversaChat, PessoaEquipe } from '@/types/banco';

export const metadata = { title: 'Mensagens' };

/**
 * Comunicação interna — apenas mensagens, no estilo do chat do Teams.
 * O histórico fica no banco: cada pessoa só enxerga as conversas de que
 * participa (RLS), e os arquivos só abrem para quem está na conversa.
 * `?c=<conversa>` abre uma conversa; `?com=<usuário>` abre a direta com alguém.
 */
export default async function PaginaChat({ searchParams }: { searchParams: Promise<{ c?: string; com?: string }> }) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaChat)) redirect('/sem-acesso');

  const { c, com } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: conversas }, { data: pessoas }] = await Promise.all([
    supabase.rpc('chat_minhas_conversas'),
    supabase.from('profiles').select('id, nome, area').eq('ativo', true).order('nome'),
  ]);

  return (
    <ChatApp
      meuId={perfil.id}
      souAdmin={ehAdmin(perfil)}
      conversasIniciais={(conversas ?? []) as ConversaChat[]}
      pessoas={((pessoas ?? []) as PessoaEquipe[]).filter((p) => p.id !== perfil.id)}
      abrirConversa={c ?? null}
      abrirCom={com ?? null}
    />
  );
}
