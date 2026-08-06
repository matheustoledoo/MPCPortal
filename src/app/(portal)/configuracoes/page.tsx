import { redirect } from 'next/navigation';

import { Database, ShieldCheck, Table2 } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { CabecalhoCartao, Cartao, Selo } from '@/components/ui';
import { COLUNAS_ADMINISTRATIVAS, COLUNAS_GERAIS } from '@/lib/colunas';
import { AREAS, PERMISSOES, ROLES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { PermissaoCatalogo } from '@/types/banco';

export const metadata = { title: 'Configurações' };

export default async function PaginaConfiguracoes() {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaConfiguracoes)) redirect('/sem-acesso');

  const supabase = await criarClienteServidor();

  const [
    { count: empresas },
    { count: administrativos },
    { count: usuarios },
    { count: eventos },
    { data: catalogo },
    { data: concessoes },
    { count: atribuicoes },
  ] = await Promise.all([
    supabase.from('legalizacao_empresas').select('id', { count: 'exact', head: true }),
    supabase.from('legalizacao_dados_administrativos').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
    supabase.from('permissoes_catalogo').select('*').order('ordem'),
    supabase.from('usuario_permissoes').select('chave'),
    supabase.from('atribuicoes').select('id', { count: 'exact', head: true }),
  ]);

  // Quantos usuários receberam cada permissão. Admins não aparecem aqui —
  // eles têm tudo pelo papel, sem precisar de linha em `usuario_permissoes`.
  const quantidadePorChave: Record<string, number> = {};
  for (const linha of concessoes ?? []) {
    const chave = linha.chave as string;
    quantidadePorChave[chave] = (quantidadePorChave[chave] ?? 0) + 1;
  }

  const permissoes = (catalogo ?? []) as PermissaoCatalogo[];

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Estrutura do sistema, permissões e catálogo de campos."
      />

      <div className="space-y-6 p-5 sm:p-7">
        <Cartao>
          <CabecalhoCartao
            titulo={
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-marca-600" />
                Banco de dados
              </span>
            }
            descricao="Volume atual por tabela."
          />
          <div className="grid gap-px bg-borda sm:grid-cols-4">
            <Metrica rotulo="legalizacao_empresas" valor={empresas ?? 0} />
            <Metrica rotulo="dados_administrativos" valor={administrativos ?? 0} confidencial />
            <Metrica rotulo="profiles" valor={usuarios ?? 0} />
            <Metrica rotulo="atribuicoes" valor={atribuicoes ?? 0} />
            <Metrica rotulo="audit_logs" valor={eventos ?? 0} />
          </div>
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo={
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-marca-600" />
                Catálogo de permissões
              </span>
            }
            descricao="O que existe para conceder e quantos usuários já receberam. Administradores têm tudo pelo papel e não entram nesta contagem."
          />
          {permissoes.length === 0 ? (
            <p className="px-5 py-6 text-sm leading-relaxed text-texto-suave">
              Nenhuma permissão cadastrada. Rode <code className="font-mono">npm run
              migrations:juntar</code> e aplique o arquivo gerado no SQL Editor do Supabase —
              a tabela <code className="font-mono">permissoes_catalogo</code> nasce na migration
              0010.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-superficie text-left">
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                      Permissão
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                      Chave
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                      Grupo
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                      Concedida a
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {permissoes.map((permissao) => (
                    <tr key={permissao.chave} className="hover:bg-superficie">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium text-texto">
                          {permissao.rotulo}
                          {permissao.somente_admin && <Selo tom="alerta">só admin</Selo>}
                        </span>
                        {permissao.descricao && (
                          <span className="mt-0.5 block text-xs text-texto-suave">
                            {permissao.descricao}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-texto-suave">
                        {permissao.chave}
                      </td>
                      <td className="px-4 py-2.5">
                        <Selo>{permissao.grupo}</Selo>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-texto-suave">
                        {permissao.somente_admin
                          ? '—'
                          : `${quantidadePorChave[permissao.chave] ?? 0} usuário(s)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-borda px-5 py-3 text-xs leading-relaxed text-texto-suave">
            As permissões marcadas como <strong>só admin</strong> não podem ser concedidas a
            nenhuma outra função: o gatilho{' '}
            <code className="font-mono">proteger_permissoes_de_admin</code> recusa a gravação no
            PostgreSQL, independentemente do que a interface envie.
          </p>
        </Cartao>

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <CabecalhoCartao
              titulo={
                <span className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-marca-600" />
                  Catálogo de campos
                </span>
              }
              descricao={`${COLUNAS_GERAIS.length} campos gerais e ${COLUNAS_ADMINISTRATIVAS.length} confidenciais.`}
            />
            <div className="max-h-96 overflow-y-auto">
              <ul className="divide-y divide-borda text-sm">
                {[...COLUNAS_GERAIS, ...COLUNAS_ADMINISTRATIVAS].map((coluna) => (
                  <li key={coluna.campo} className="flex items-start justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-texto">{coluna.rotulo}</p>
                      <p className="truncate text-xs text-texto-suave">{coluna.origem ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Selo>{coluna.tipo}</Selo>
                      {coluna.confidencial && <Selo tom="alerta">ADM</Selo>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Cartao>

          <div className="space-y-4">
            <Cartao>
              <CabecalhoCartao titulo="Times" descricao="Agrupamento operacional de cada usuário." />
              <ul className="divide-y divide-borda text-sm">
                {AREAS.map((area) => (
                  <li key={area.valor} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-texto">{area.rotulo}</span>
                    <code className="font-mono text-xs text-texto-suave">{area.valor}</code>
                  </li>
                ))}
              </ul>
            </Cartao>

            <Cartao>
              <CabecalhoCartao
                titulo="Funções"
                descricao="A função não decide mais o acesso — só admin é especial. O resto vem dos checkboxes."
              />
              <ul className="divide-y divide-borda text-sm">
                {ROLES.map((role) => (
                  <li key={role.valor} className="px-5 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-texto">{role.rotulo}</span>
                      <code className="font-mono text-xs text-texto-suave">{role.valor}</code>
                    </div>
                    <p className="mt-0.5 text-xs text-texto-suave">{role.descricao}</p>
                  </li>
                ))}
              </ul>
            </Cartao>
          </div>
        </div>
      </div>
    </>
  );
}

function Metrica({
  rotulo,
  valor,
  confidencial,
}: {
  rotulo: string;
  valor: number;
  confidencial?: boolean;
}) {
  return (
    <div className="bg-superficie-elevada px-5 py-4">
      <p className="flex items-center gap-1.5 font-mono text-xs text-texto-suave">
        {rotulo}
        {confidencial && <Selo tom="alerta" className="text-[9px]">ADM</Selo>}
      </p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-texto">
        {valor.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
