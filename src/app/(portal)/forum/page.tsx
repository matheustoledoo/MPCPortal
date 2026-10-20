import { abrirForum } from '@/app/(portal)/forum/dados';
import { FeedForum } from '@/app/(portal)/forum/FeedForum';

export const metadata = { title: 'Fórum da Meta' };

export default async function PaginaForum({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const { eu } = await abrirForum();
  const { q, tag } = await searchParams;
  return <FeedForum eu={eu} busca={q?.trim() || undefined} tag={tag?.trim().toLowerCase() || undefined} />;
}
