'use client';

import { useMemo, useState } from 'react';

import { Search, ShieldCheck, UserCog } from 'lucide-react';

import {
  Botao,
  Cartao,
  Campo,
  EstadoVazio,
  ModalConfirmacao,
  Selecao,
  Selo,
  useAvisos,
} from '@/components/ui';
import { AREAS, ROLES, rotuloArea } from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Area, Perfil, Role } from '@/types/banco';

export function GerenciadorUsuarios({
  usuariosIniciais,
  meuId,
}: {
  usuariosIniciais: Perfil[];
  meuId: string;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [usuarios, setUsuarios] = useState(usuariosIniciais);
  const [busca, setBusca] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState<Perfil | null>(null);

  const filtrados = usuarios.filter((usuario) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return (
      usuario.nome.toLowerCase().includes(termo) ||
      usuario.email.toLowerCase().includes(termo) ||
      rotuloArea(usuario.area).toLowerCase().includes(termo)
    );
  });

  async function atualizar(usuario: Perfil, mudancas: Partial<Perfil>) {
    setSalvandoId(usuario.id);
    try {
      const { error } = await supabase.from('profiles').update(mudancas).eq('id', usuario.id);
      if (error) throw new Error(error.message);

      setUsuarios((atuais) =>
        atuais.map((u) => (u.id === usuario.id ? { ...u, ...mudancas } : u)),
      );
      avisar('sucesso', `${usuario.nome} atualizado.`);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível atualizar.');
    } finally {
      setSalvandoId(null);
      setConfirmandoDesativar(null);
    }
  }

  return (
    <div className="space-y-4">
      <Cartao className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Campo
              type="search"
              placeholder="Buscar por nome, e-mail ou área…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              iconeInicial={<Search className="h-4 w-4" />}
              aria-label="Buscar usuário"
            />
          </div>
          <p className="text-sm text-texto-suave">
            <strong className="text-texto">{filtrados.length}</strong> de {usuarios.length} usuários
          </p>
        </div>
      </Cartao>

      <Cartao>
        {filtrados.length === 0 ? (
          <EstadoVazio
            icone={<UserCog className="h-6 w-6" />}
            titulo="Nenhum usuário encontrado"
            descricao="Ajuste a busca ou crie novos usuários pelo script de seed / painel do Supabase Auth."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-borda bg-superficie text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Área
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Função
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Situação
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                    Último acesso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {filtrados.map((usuario) => {
                  const euMesmo = usuario.id === meuId;
                  const ocupado = salvandoId === usuario.id;

                  return (
                    <tr key={usuario.id} className="hover:bg-superficie">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {usuario.role === 'admin' && (
                            <ShieldCheck className="h-4 w-4 shrink-0 text-marca-600" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-texto">
                              {usuario.nome}
                              {euMesmo && <span className="ml-1.5 text-xs text-texto-fraco">(você)</span>}
                            </p>
                            <p className="truncate text-xs text-texto-suave">{usuario.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Selecao
                          value={usuario.area}
                          onChange={(e) => void atualizar(usuario, { area: e.target.value as Area })}
                          disabled={ocupado}
                          className="h-8 text-xs"
                          aria-label={`Área de ${usuario.nome}`}
                        >
                          {AREAS.map((area) => (
                            <option key={area.valor} value={area.valor}>
                              {area.rotulo}
                            </option>
                          ))}
                        </Selecao>
                      </td>

                      <td className="px-4 py-3">
                        <Selecao
                          value={usuario.role}
                          onChange={(e) => void atualizar(usuario, { role: e.target.value as Role })}
                          disabled={ocupado || euMesmo}
                          title={euMesmo ? 'Você não pode alterar a própria função.' : undefined}
                          className="h-8 text-xs"
                          aria-label={`Função de ${usuario.nome}`}
                        >
                          {ROLES.map((role) => (
                            <option key={role.valor} value={role.valor}>
                              {role.rotulo}
                            </option>
                          ))}
                        </Selecao>
                      </td>

                      <td className="px-4 py-3">
                        {usuario.ativo ? (
                          <Botao
                            variante="fantasma"
                            tamanho="sm"
                            disabled={ocupado || euMesmo}
                            onClick={() => setConfirmandoDesativar(usuario)}
                            title={euMesmo ? 'Você não pode desativar o próprio acesso.' : undefined}
                          >
                            <Selo tom="sucesso">Ativo</Selo>
                          </Botao>
                        ) : (
                          <Botao
                            variante="fantasma"
                            tamanho="sm"
                            disabled={ocupado}
                            onClick={() => void atualizar(usuario, { ativo: true })}
                          >
                            <Selo tom="erro">Inativo</Selo>
                          </Botao>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs tabular-nums text-texto-suave">
                        {usuario.ultimo_acesso
                          ? new Date(usuario.ultimo_acesso).toLocaleString('pt-BR')
                          : 'nunca'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao className="p-5">
        <h3 className="text-sm font-semibold text-texto">Como criar um novo usuário</h3>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-texto-suave">
          <li>
            Rode <code className="rounded bg-superficie px-1 py-0.5 font-mono text-xs">npm run seed:usuarios</code>{' '}
            ou crie o usuário em <strong>Authentication → Users</strong> no painel do Supabase.
          </li>
          <li>
            O gatilho <code className="rounded bg-superficie px-1 py-0.5 font-mono text-xs">handle_new_user</code>{' '}
            cria o perfil automaticamente, lendo <code className="font-mono text-xs">nome</code>,{' '}
            <code className="font-mono text-xs">area</code> e <code className="font-mono text-xs">role</code> dos
            metadados.
          </li>
          <li>Ajuste área e função nesta tela, se necessário. Cada mudança fica registrada na auditoria.</li>
        </ol>
      </Cartao>

      <ModalConfirmacao
        aberto={Boolean(confirmandoDesativar)}
        aoFechar={() => setConfirmandoDesativar(null)}
        aoConfirmar={() =>
          confirmandoDesativar && void atualizar(confirmandoDesativar, { ativo: false })
        }
        titulo="Desativar acesso"
        rotuloConfirmar="Desativar"
        carregando={salvandoId === confirmandoDesativar?.id}
        mensagem={
          <>
            <strong>{confirmandoDesativar?.nome}</strong> deixará de conseguir entrar no portal
            imediatamente. O histórico e a auditoria são preservados.
          </>
        }
      />
    </div>
  );
}
