import { redirect } from 'next/navigation';

import { ListaIntegracoes, type PreenchimentoNovaIntegracao } from '@/app/(portal)/integracao-clientes/ListaIntegracoes';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Integracao, ResumoIntegracao } from '@/types/banco';

export const metadata = { title: 'Integração de Clientes' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista das integrações de clientes novos.
 *
 * `?evento=<id>` vem do calendário ("Abrir roteiro de integração"): abre a
 * integração ligada àquela reunião ou já prepara uma nova com os dados dela.
 * `?empresa=<id>` vem da planilha: mostra as integrações daquele cliente.
 */
export default async function PaginaIntegracoes({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; empresa?: string; nova?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaIntegracao)) redirect('/sem-acesso');

  const { evento: eventoId, empresa: empresaId, nova } = await searchParams;
  const supabase = await criarClienteServidor();

  if (eventoId) {
    const { data: ja } = await supabase.from('integracoes').select('id').eq('evento_id', eventoId).limit(1).maybeSingle();
    if (ja) redirect(`/integracao-clientes/${ja.id as string}`);
  }

  const [{ data: integracoes }, { data: resumo }, { data: evento }, { data: empresa }] = await Promise.all([
    supabase
      .from('integracoes')
      .select('id, ficha, empresa_id, evento_id, criado_por, criado_por_nome, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase.rpc('integracoes_resumo'),
    eventoId
      ? supabase.from('calendario_eventos').select('id, data, empresa, empresa_id, cnpj, contato, modalidade').eq('id', eventoId).maybeSingle()
      : Promise.resolve({ data: null }),
    empresaId && UUID.test(empresaId)
      ? supabase.from('legalizacao_empresas').select('id, razao_social, cnpj').eq('id', empresaId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // O que a "Nova integração" já traz preenchido (abrirIntegDoEvento do app antigo).
  let preenchimento: PreenchimentoNovaIntegracao | null = null;
  if (evento) {
    const e = evento as { id: string; data: string; empresa: string | null; empresa_id: string | null; cnpj: string | null; contato: string | null; modalidade: string | null };
    preenchimento = {
      empresa: e.empresa ?? '',
      empresaId: e.empresa_id,
      cnpj: e.cnpj ?? '',
      dataReuniao: e.data?.slice(0, 10) ?? '',
      modalidade: e.modalidade ?? '',
      canal: e.contato ?? '',
      eventoId: e.id,
    };
  } else if (empresa && nova) {
    const e = empresa as { id: string; razao_social: string; cnpj: string | null };
    preenchimento = { empresa: e.razao_social, empresaId: e.id, cnpj: e.cnpj ?? '' };
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Integração de Clientes"
        descricao="Roteiro da reunião de integração do cliente novo. A Qualidade abre e cada departamento preenche o seu roteiro; ao finalizar, o relatório em PDF fica liberado."
      />
      <div className="p-5 sm:p-7">
        <ListaIntegracoes
          meuNome={perfil.nome}
          integracoes={(integracoes ?? []) as Integracao[]}
          resumo={(resumo ?? []) as ResumoIntegracao[]}
          preenchimento={preenchimento}
          empresaFiltro={empresa ? { id: (empresa as { id: string }).id, nome: (empresa as { razao_social: string }).razao_social } : null}
        />
      </div>
    </>
  );
}
