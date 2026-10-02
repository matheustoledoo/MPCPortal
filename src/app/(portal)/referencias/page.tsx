import { redirect } from 'next/navigation';

import { ExternalLink, FileCheck2, ListChecks } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { CabecalhoCartao, Cartao, Selo } from '@/components/ui';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { CidadeLink, DocumentoNecessario, ItemChecklist } from '@/types/banco';

export const metadata = { title: 'Consultas por cidade' };

/**
 * Traz para o portal o conteúdo das abas auxiliares da planilha original
 * (Caminhos, Docs Necessários, Status e Conferência), que antes era consultado
 * manualmente em arquivo.
 */
export default async function PaginaReferencias() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaReferencias)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  const [{ data: cidades }, { data: documentos }, { data: checklist }] = await Promise.all([
    supabase.from('legalizacao_cidades_links').select('*').order('cidade'),
    supabase.from('legalizacao_documentos_necessarios').select('*').order('ordem'),
    supabase.from('legalizacao_checklist_referencia').select('*').order('bloco').order('ordem'),
  ]);

  const listaCidades = (cidades ?? []) as CidadeLink[];
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
        descricao="Portais das prefeituras, checklist de documentos e modelos de parecer extraídos da planilha de trabalho."
      />

      <div className="space-y-6 p-5 sm:p-7">
        <Cartao>
          <CabecalhoCartao
            titulo="Portais das prefeituras"
            descricao={`${listaCidades.length} municípios com link direto para ISSQN/Alvará e consulta cadastral.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-borda bg-superficie text-left">
                  <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Cidade
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Contribuinte Mobiliário
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Consulta CFM/CCM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {listaCidades.map((cidade) => (
                  <tr key={cidade.id} className="hover:bg-superficie">
                    <td className="px-5 py-2.5 font-medium text-texto">{cidade.cidade}</td>
                    <td className="px-4 py-2.5">
                      <LinkExterno url={cidade.url_contribuinte_mobiliario} />
                      {cidade.url_contribuinte_2025 && (
                        <div className="mt-1">
                          <LinkExterno url={cidade.url_contribuinte_2025} rotulo="2ª via (2025)" />
                        </div>
                      )}
                      {cidade.observacao && (
                        <p className="mt-1 text-xs leading-relaxed text-texto-suave">{cidade.observacao}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <LinkExterno url={cidade.url_consulta_cfm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>

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
                  <span className="shrink-0 tabular-nums font-medium text-texto-fraco">
                    {String(documento.ordem).padStart(2, '0')}
                  </span>
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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    {bloco}
                  </p>
                  <ul className="space-y-1.5">
                    {itens.map((item) => (
                      <li key={item.id} className="rounded-lg border border-borda p-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-texto">{item.item}</span>
                          {item.status && <Selo tom={tomStatus(item.status)}>{item.status}</Selo>}
                        </div>
                        {item.acao && <p className="mt-1 leading-relaxed text-texto-suave">{item.acao}</p>}
                        {item.responsavel_tecnico && (
                          <p className="mt-1 text-texto-suave">RT: {item.responsavel_tecnico}</p>
                        )}
                        {item.observacao && (
                          <p className="mt-1 italic text-texto-fraco">{item.observacao}</p>
                        )}
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

function LinkExterno({ url, rotulo }: { url: string | null; rotulo?: string }) {
  if (!url) return <span className="text-texto-fraco">—</span>;

  let anfitriao = url;
  try {
    anfitriao = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* URL fora do padrão: mostra o texto original */
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-marca-700 hover:underline"
    >
      <span className="max-w-[260px] truncate">{rotulo ?? anfitriao}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
