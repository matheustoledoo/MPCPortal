import { redirect } from 'next/navigation';

import { FileCheck2, ListChecks } from 'lucide-react';

import { ConsultasBrasil, type EstadoResumo, type LinkReferencia } from '@/app/(portal)/referencias/ConsultasBrasil';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { CabecalhoCartao, Cartao, Selo } from '@/components/ui';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { DocumentoNecessario, ItemChecklist } from '@/types/banco';

export const metadata = { title: 'Consultas por cidade' };

/**
 * Consultas de todo o Brasil — os 5.571 municípios e as 27 UFs do IBGE —,
 * mais o checklist de documentos e os modelos de parecer que vieram das
 * abas auxiliares da planilha original.
 */
export default async function PaginaReferencias({
  searchParams,
}: {
  searchParams: Promise<{ municipio?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaReferencias)) redirect('/sem-acesso');

  const { municipio } = await searchParams;
  const supabase = await criarClienteServidor();

  const [{ data: estados }, { data: links }, { data: documentos }, { data: checklist }] = await Promise.all([
    supabase.rpc('referencias_estados'),
    supabase.from('referencias_links').select('*').in('escopo', ['nacional', 'estado']).order('ordem').order('titulo'),
    supabase.from('legalizacao_documentos_necessarios').select('*').order('ordem'),
    supabase.from('legalizacao_checklist_referencia').select('*').order('bloco').order('ordem'),
  ]);

  const listaDocumentos = (documentos ?? []) as DocumentoNecessario[];
  const listaChecklist = (checklist ?? []) as ItemChecklist[];
  const blocos = listaChecklist.reduce<Record<string, ItemChecklist[]>>((mapa, item) => {
    (mapa[item.bloco] ??= []).push(item);
    return mapa;
  }, {});

  return (
    <>
      <CabecalhoPagina
        titulo="Consultas por cidade"
        descricao="Todas as cidades e estados do Brasil, com os portais que a equipe usa. Filtre por estado, pesquise e cadastre links novos."
      />

      <div className="space-y-6 p-5 sm:p-7">
        <ConsultasBrasil
          estados={(estados ?? []) as EstadoResumo[]}
          linksIniciais={(links ?? []) as LinkReferencia[]}
          podeEditar={pode(perfil, PERMISSOES.editarReferencias)}
          podeVerPlanilha={pode(perfil, PERMISSOES.telaLegalizacao)}
          municipioInicial={municipio}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <CabecalhoCartao
              titulo={
                <span className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-marca-600" />
                  Documentos necessários
                </span>
              }
              descricao="Checklist para andamento dos processos de legalização."
            />
            <ol className="divide-y divide-borda">
              {listaDocumentos.map((documento) => (
                <li key={documento.id} className="flex gap-3 px-5 py-2.5 text-sm">
                  <span className="shrink-0 tabular-nums font-medium text-texto-fraco">{String(documento.ordem).padStart(2, '0')}</span>
                  <span className="leading-relaxed text-texto">{documento.descricao}</span>
                </li>
              ))}
            </ol>
          </Cartao>

          <Cartao>
            <CabecalhoCartao
              titulo={
                <span className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-marca-600" />
                  Modelos de parecer
                </span>
              }
              descricao="Diagnósticos por órgão usados como referência na conferência."
            />
            <div className="max-h-[520px] space-y-4 overflow-y-auto p-5">
              {Object.entries(blocos).map(([bloco, itens]) => (
                <div key={bloco}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">{bloco}</p>
                  <ul className="space-y-1.5">
                    {itens.map((item) => (
                      <li key={item.id} className="rounded-lg border border-borda p-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-texto">{item.item}</span>
                          {item.status && <Selo tom={tomStatus(item.status)}>{item.status}</Selo>}
                        </div>
                        {item.acao && <p className="mt-1 leading-relaxed text-texto-suave">{item.acao}</p>}
                        {item.responsavel_tecnico && <p className="mt-1 text-texto-suave">RT: {item.responsavel_tecnico}</p>}
                        {item.observacao && <p className="mt-1 italic text-texto-fraco">{item.observacao}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function tomStatus(status: string): 'sucesso' | 'erro' | 'alerta' | 'neutro' {
  const v = status.toUpperCase();
  if (v === 'OK') return 'sucesso';
  if (v.includes('NÃO LOCALIZADO')) return 'erro';
  if (v.includes('VENCIDO')) return 'alerta';
  return 'neutro';
}
