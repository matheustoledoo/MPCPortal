import { redirect } from 'next/navigation';

import { abrirForum } from '@/app/(portal)/forum/dados';
import { ConversaForum } from '@/app/(portal)/forum/post/[id]/ConversaForum';

export const metadata = { title: 'Post — Fórum da Meta' };

export default async function PaginaPost({ params }: { params: Promise<{ id: string }> }) {
  const { eu, supabase } = await abrirForum();
  const { id } = await params;

  // Link para uma resposta: abre a conversa inteira, rolando até ela.
  const { data } = await supabase.from('forum_posts').select('id, raiz_id').eq('id', id).maybeSingle();
  if (data?.raiz_id) redirect(`/forum/post/${data.raiz_id}#p-${id}`);

  return <ConversaForum eu={eu} raizId={id} />;
}
