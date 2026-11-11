import { redirect } from 'next/navigation';

import { EditorTabelas } from '@/app/(portal)/ferramentas/tabelas/EditorTabelas';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PERMISSOES, ehAdmin, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { TabelaFerramenta } from '@/types/banco';

export const metadata = { title: 'Tabelas das ferramentas' };

/** Só administradores: é aqui que alíquotas, faixas e limites são atualizados. */
export default async function PaginaTabelas() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaFerramentas) || !ehAdmin(perfil)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('ferramentas_tabelas').select('id, chave, vigencia_inicio, titulo, dados, fonte, fonte_url, observacao, conferido_em, updated_at').order('chave').order('vigencia_inicio', { ascending: false });

  return (
    <>
      <CabecalhoPagina
        titulo="Tabelas e vigências"
        descricao="As calculadoras leem estas tabelas. Para atualizar uma regra, crie uma nova vigência com a fonte legal — o histórico anterior fica preservado."
      />
      <div className="p-5 sm:p-7">
        <EditorTabelas tabelasIniciais={(data ?? []) as TabelaFerramenta[]} />
      </div>
    </>
  );
}
