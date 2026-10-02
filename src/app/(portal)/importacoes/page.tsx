import { redirect } from 'next/navigation';

import { FileStack } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { CabecalhoCartao, Cartao, EstadoVazio, Indicador, Selo } from '@/components/ui';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Divergencia, LogImportacao } from '@/types/banco';

export const metadata = { title: 'Importações' };

interface ResumoImportacao {
  empresas_unicas?: number;
  presentes_em_ambas?: number;
  somente_planilha_saude?: number;
  somente_planilha_adm?: number;
  duplicadas_no_arquivo_saude?: number;
  duplicadas_no_arquivo_adm?: number;
  divergencias?: number;
  registros_importados?: number;
  registros_administrativos?: number;
  necessitam_revisao_manual?: number;
  cnpj_invalidos?: number;
  motivos_revisao?: Record<string, number>;
  arquivos?: {
    nome: string;
    aba: string;
    linhas_lidas: number;
    linhas_descartadas: number;
    linhas_validas: number;
    colunas: string[];
    colunas_confidenciais?: string[];
  }[];
}

export default async function PaginaImportacoes() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaImportacoes)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  const [{ data: logs }, { data: divergencias }] = await Promise.all([
    supabase.from('import_logs').select('*').order('iniciado_em', { ascending: false }).limit(10),
    supabase.from('import_divergencias').select('*').eq('resolvido', false).limit(200),
  ]);

  const historico = (logs ?? []) as LogImportacao[];
  const ultima = historico[0];
  const resumo = (ultima?.resumo ?? {}) as ResumoImportacao;
  const conflitos = (divergencias ?? []) as Divergencia[];

  if (!ultima) {
    return (
      <>
        <CabecalhoPagina titulo="Importações" />
        <div className="p-5 sm:p-7">
          <Cartao>
            <EstadoVazio
              icone={<FileStack className="h-6 w-6" />}
              titulo="Nenhuma importação registrada"
              descricao="Execute `npm run import:planilhas` para consolidar as planilhas de trabalho."
            />
          </Cartao>
        </div>
      </>
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Importações"
        descricao="Relatório da consolidação entre a Planilha Saúde e o Adm.xlsx."
        acoes={
          <Selo tom={ultima.status === 'concluido' ? 'sucesso' : 'alerta'}>
            {ultima.status === 'concluido' ? 'Concluída' : ultima.status}
          </Selo>
        }
      />

      <div className="space-y-6 p-5 sm:p-7">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Indicador
            rotulo="Empresas consolidadas"
            valor={(resumo.empresas_unicas ?? 0).toLocaleString('pt-BR')}
            detalhe="registros únicos na base"
          />
          <Indicador
            rotulo="Nas duas planilhas"
            valor={(resumo.presentes_em_ambas ?? 0).toLocaleString('pt-BR')}
            detalhe="mescladas sem duplicar"
            tom="sucesso"
          />
          <Indicador
            rotulo="Exclusivas de cada fonte"
            valor={`${resumo.somente_planilha_saude ?? 0} + ${resumo.somente_planilha_adm ?? 0}`}
            detalhe="Saúde + Adm.xlsx"
            tom="info"
          />
          <Indicador
            rotulo="Revisão manual"
            valor={(resumo.necessitam_revisao_manual ?? 0).toLocaleString('pt-BR')}
            detalhe={`${resumo.divergencias ?? 0} divergência(s) entre fontes`}
            tom={(resumo.necessitam_revisao_manual ?? 0) > 0 ? 'alerta' : 'neutro'}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {(resumo.arquivos ?? []).map((arquivo) => (
            <Cartao key={arquivo.nome}>
              <CabecalhoCartao
                titulo={arquivo.nome}
                descricao={`Aba "${arquivo.aba}" · ${arquivo.colunas.length} colunas`}
              />
              <div className="space-y-2.5 p-5 text-sm">
                <Linha rotulo="Linhas lidas" valor={arquivo.linhas_lidas} />
                <Linha rotulo="Linhas descartadas" valor={arquivo.linhas_descartadas} />
                <Linha rotulo="Linhas válidas" valor={arquivo.linhas_validas} destaque />
                <div className="pt-2">
                  <p className="mb-1.5 text-xs font-semibold text-texto-suave">Colunas detectadas</p>
                  <div className="flex flex-wrap gap-1">
                    {arquivo.colunas.map((coluna) => (
                      <Selo
                        key={coluna}
                        tom={arquivo.colunas_confidenciais?.includes(coluna) ? 'alerta' : 'neutro'}
                      >
                        {coluna.replace(/\n/g, ' ')}
                      </Selo>
                    ))}
                  </div>
                  {arquivo.colunas_confidenciais && (
                    <p className="mt-2 text-xs leading-relaxed text-texto-suave">
                      Em âmbar: colunas confidenciais movidas para{' '}
                      <code className="font-mono">legalizacao_dados_administrativos</code>.
                    </p>
                  )}
                </div>
              </div>
            </Cartao>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <CabecalhoCartao titulo="Qualidade dos dados" descricao="Verificações automáticas na importação." />
            <div className="space-y-2.5 p-5 text-sm">
              <Linha rotulo="Registros importados" valor={resumo.registros_importados ?? 0} destaque />
              <Linha rotulo="Blocos administrativos" valor={resumo.registros_administrativos ?? 0} />
              <Linha
                rotulo="Duplicadas na Planilha Saúde"
                valor={resumo.duplicadas_no_arquivo_saude ?? 0}
              />
              <Linha rotulo="Duplicadas no Adm.xlsx" valor={resumo.duplicadas_no_arquivo_adm ?? 0} />
              <Linha rotulo="CNPJ com DV inválido" valor={resumo.cnpj_invalidos ?? 0} />
            </div>
            {resumo.motivos_revisao && Object.keys(resumo.motivos_revisao).length > 0 && (
              <div className="border-t border-borda px-5 py-4">
                <p className="mb-2 text-xs font-semibold text-texto-suave">Motivos de revisão</p>
                <ul className="space-y-1 text-xs text-texto-suave">
                  {Object.entries(resumo.motivos_revisao).map(([motivo, quantidade]) => (
                    <li key={motivo} className="flex justify-between gap-3">
                      <span>{motivo}</span>
                      <span className="shrink-0 font-medium tabular-nums text-texto">{quantidade}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Cartao>

          <Cartao>
            <CabecalhoCartao
              titulo="Divergências entre fontes"
              descricao="Nenhum valor é descartado: o Adm.xlsx prevalece e a diferença fica registrada."
            />
            {conflitos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texto-suave">
                Nenhuma divergência pendente. As duas planilhas estavam consistentes nos campos comuns
                (razão social, código, cidade e data de início).
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-superficie">
                    <tr className="border-b border-borda text-left">
                      <th className="px-4 py-2 font-semibold text-texto-suave">Empresa</th>
                      <th className="px-3 py-2 font-semibold text-texto-suave">Campo</th>
                      <th className="px-3 py-2 font-semibold text-texto-suave">Saúde</th>
                      <th className="px-3 py-2 font-semibold text-texto-suave">Adm (aplicado)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {conflitos.map((item) => (
                      <tr key={item.id}>
                        <td className="max-w-[180px] truncate px-4 py-2">{item.razao_social}</td>
                        <td className="px-3 py-2 font-mono">{item.campo}</td>
                        <td className="px-3 py-2 text-texto-suave">{item.valor_planilha_saude}</td>
                        <td className="px-3 py-2 font-medium">{item.valor_planilha_adm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </section>

        <Cartao>
          <CabecalhoCartao titulo="Histórico de execuções" />
          <ul className="divide-y divide-borda">
            {historico.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-texto">
                    {new Date(log.iniciado_em).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-texto-suave">{log.executado_por_desc ?? '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-texto-suave">
                    {(log.resumo as ResumoImportacao)?.registros_importados ?? 0} registros
                  </span>
                  <Selo tom={log.status === 'concluido' ? 'sucesso' : log.status === 'erro' ? 'erro' : 'alerta'}>
                    {log.status}
                  </Selo>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-texto-suave">{rotulo}</span>
      <span
        className={
          destaque ? 'font-semibold tabular-nums text-marca-800' : 'font-medium tabular-nums text-texto'
        }
      >
        {valor.toLocaleString('pt-BR')}
      </span>
    </div>
  );
}
