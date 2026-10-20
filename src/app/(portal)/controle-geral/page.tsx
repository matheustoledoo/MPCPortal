import { redirect } from 'next/navigation';

/**
 * O Controle Geral virou Controle Legalização. Links antigos (favoritos,
 * notificações já enviadas) continuam funcionando, com os mesmos filtros.
 */
export default async function RedirecionarControleGeral({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor ? [valor] : []) parametros.append(chave, v);
  }
  const consulta = parametros.toString();
  redirect(`/controle-legalizacao${consulta ? `?${consulta}` : ''}`);
}
