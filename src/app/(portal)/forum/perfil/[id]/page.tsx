import { notFound } from 'next/navigation';

import { abrirForum } from '@/app/(portal)/forum/dados';
import { PerfilTela } from '@/app/(portal)/forum/perfil/[id]/PerfilTela';

export const metadata = { title: 'Perfil — Fórum da Meta' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aceita o id ou o @apelido (é o que as menções nos posts usam). */
export default async function PaginaPerfil({ params }: { params: Promise<{ id: string }> }) {
  const { eu, supabase } = await abrirForum();
  const bruto = decodeURIComponent((await params).id);

  let id = bruto;
  if (!UUID.test(bruto)) {
    const apelido = bruto.replace(/^@/, '').toLowerCase();
    const { data } = await supabase.from('profiles').select('id').eq('apelido', apelido).maybeSingle();
    if (!data) notFound();
    id = data.id as string;
  }

  return <PerfilTela eu={eu} usuarioId={id} />;
}
