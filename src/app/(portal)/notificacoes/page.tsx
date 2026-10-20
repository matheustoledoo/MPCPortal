import { redirect } from 'next/navigation';

import { CentralNotificacoes } from '@/app/(portal)/notificacoes/CentralNotificacoes';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { CategoriaNotificacao } from '@/types/banco';

export const metadata = { title: 'Notificações' };

/** A caixa de entrada pessoal. Cada um só enxerga as próprias (RLS). */
export default async function PaginaNotificacoes() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');

  const supabase = await criarClienteServidor();
  // Recalcula os prazos antes de desenhar a página.
  await supabase.rpc('sincronizar_minhas_notificacoes');
  const { data } = await supabase.from('notificacao_preferencias').select('categoria, ativo');
  const preferencias = Object.fromEntries((data ?? []).map((p) => [p.categoria as CategoriaNotificacao, Boolean(p.ativo)]));

  return (
    <>
      <CabecalhoPagina
        titulo="Notificações"
        descricao="O que está atrasado ou perto de vencer, o que colocaram no seu nome, menções e o Fórum — tudo num lugar."
      />
      <div className="p-5 sm:p-7">
        <CentralNotificacoes usuarioId={perfil.id} nome={perfil.nome} preferenciasIniciais={preferencias} />
      </div>
    </>
  );
}
