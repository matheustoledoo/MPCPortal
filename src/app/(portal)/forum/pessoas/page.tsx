import { abrirForum } from '@/app/(portal)/forum/dados';
import { DiretorioPessoas } from '@/app/(portal)/forum/pessoas/DiretorioPessoas';

export const metadata = { title: 'Equipe — Fórum da Meta' };

export default async function PaginaPessoas() {
  const { eu } = await abrirForum();
  return <DiretorioPessoas eu={eu} />;
}
