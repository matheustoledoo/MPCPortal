'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';
import {
  Columns3,
  KeyRound,
  Layers,
  Lock,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { FormularioNovoUsuario } from '@/app/(portal)/usuarios/FormularioNovoUsuario';
import {
  Botao,
  Cartao,
  Campo,
  EstadoVazio,
  Modal,
  ModalConfirmacao,
  Selecao,
  Selo,
  cn,
  useAvisos,
} from '@/components/ui';
import { AREAS, ROLES, ehAdmin, podeConcederPermissoes, rotuloArea } from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Area, PerfilComPermissoes, PermissaoCatalogo, Perfil, Role } from '@/types/banco';

const TITULOS_GRUPO: Record<string, { rotulo: string; descricao: string }> = {
  telas: { rotulo: 'Telas que pode abrir', descricao: 'Cada item marcado vira uma entrada no menu.' },
  dados: { rotulo: 'O que pode fazer com os dados', descricao: 'Vale para a base de Legalização.' },
  administracao: { rotulo: 'Administração', descricao: 'Permite gerir outros usuários e atribuições.' },
};

export function PainelUsuarios({
  meuPerfil,
  usuariosIniciais,
  catalogo,
  permissoesPorUsuario,
  colunasPorUsuario,
  colunasDisponiveis,
}: {
  meuPerfil: PerfilComPermissoes;
  usuariosIniciais: Perfil[];
  catalogo: PermissaoCatalogo[];
  permissoesPorUsuario: Record<string, string[]>;
  colunasPorUsuario: Record<string, string[]>;
  colunasDisponiveis: { campo: string; rotulo: string }[];
}) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [usuarios, setUsuarios] = useState(usuariosIniciais);
  const [permissoes, setPermissoes] = useState(permissoesPorUsuario);
  const [colunas, setColunas] = useState(colunasPorUsuario);

  const [busca, setBusca] = useState('');
  const [filtroArea, setFiltroArea] = useState<string>('');
  const [selecionado, setSelecionado] = useState<Perfil | null>(null);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState<Perfil | null>(null);
  const [redefinindoSenha, setRedefinindoSenha] = useState<Perfil | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  const souAdmin = ehAdmin(meuPerfil);
  const possoConceder = podeConcederPermissoes(meuPerfil);

  const filtrados = usuarios.filter((u) => {
    const termo = busca.trim().toLowerCase();
    const casaBusca =
      !termo ||
      u.nome.toLowerCase().includes(termo) ||
      u.email.toLowerCase().includes(termo) ||
      rotuloArea(u.area).toLowerCase().includes(termo);
    return casaBusca && (!filtroArea || u.area === filtroArea);
  });

  async function atualizarPerfil(usuario: Perfil, mudancas: Partial<Perfil>) {
    setSalvando(true);
    try {
      const { error } = await supabase.from('profiles').update(mudancas).eq('id', usuario.id);
      if (error) throw new Error(error.message);

      setUsuarios((atuais) => atuais.map((u) => (u.id === usuario.id ? { ...u, ...mudancas } : u)));
      setSelecionado((atual) => (atual?.id === usuario.id ? { ...atual, ...mudancas } : atual));
      avisar('sucesso', `${usuario.nome} atualizado.`);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível atualizar.');
    } finally {
      setSalvando(false);
      setConfirmandoDesativar(null);
    }
  }

  async function alternarPermissao(usuario: Perfil, chave: string, marcar: boolean) {
    const anterior = permissoes[usuario.id] ?? [];
    // Atualização otimista: o checkbox responde na hora e reverte se falhar.
    setPermissoes((atuais) => ({
      ...atuais,
      [usuario.id]: marcar ? [...anterior, chave] : anterior.filter((c) => c !== chave),
    }));

    try {
      if (marcar) {
        const { error } = await supabase
          .from('usuario_permissoes')
          .insert({ usuario_id: usuario.id, chave, concedido_por: meuPerfil.id });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('usuario_permissoes')
          .delete()
          .eq('usuario_id', usuario.id)
          .eq('chave', chave);
        if (error) throw new Error(error.message);
      }
    } catch (e) {
      setPermissoes((atuais) => ({ ...atuais, [usuario.id]: anterior }));
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível salvar a permissão.');
    }
  }

  async function alternarColuna(usuario: Perfil, coluna: string, marcar: boolean) {
    const anterior = colunas[usuario.id] ?? [];
    setColunas((atuais) => ({
      ...atuais,
      [usuario.id]: marcar ? [...anterior, coluna] : anterior.filter((c) => c !== coluna),
    }));

    try {
      if (marcar) {
        const { error } = await supabase
          .from('usuario_colunas')
          .insert({ usuario_id: usuario.id, tabela: 'legalizacao_empresas', coluna });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('usuario_colunas')
          .delete()
          .eq('usuario_id', usuario.id)
          .eq('tabela', 'legalizacao_empresas')
          .eq('coluna', coluna);
        if (error) throw new Error(error.message);
      }
    } catch (e) {
      setColunas((atuais) => ({ ...atuais, [usuario.id]: anterior }));
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível salvar as colunas.');
    }
  }

  async function redefinirSenha() {
    if (!redefinindoSenha) return;
    setSalvando(true);
    try {
      const resposta = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuarioId: redefinindoSenha.id, novaSenha }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? 'Falha ao redefinir.');

      avisar('sucesso', `Senha de ${redefinindoSenha.nome} redefinida.`);
      setRedefinindoSenha(null);
      setNovaSenha('');
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível redefinir.');
    } finally {
      setSalvando(false);
    }
  }

  const gruposCatalogo = ['telas', 'dados', 'administracao'] as const;

  return (
    <div className="space-y-4">
      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Campo
              type="search"
              placeholder="Buscar por nome, e-mail ou time…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              iconeInicial={<Search className="h-4 w-4" />}
              aria-label="Buscar usuário"
            />
          </div>
          <div className="w-52">
            <Selecao
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              aria-label="Filtrar por time"
            >
              <option value="">Todos os times</option>
              {AREAS.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
          <Botao onClick={() => setCriando(true)}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </Botao>
        </div>
      </Cartao>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Lista */}
        <Cartao className="self-start">
          {filtrados.length === 0 ? (
            <EstadoVazio
              icone={<Users className="h-6 w-6" />}
              titulo="Nenhum usuário encontrado"
              descricao="Ajuste a busca ou crie o primeiro usuário do time."
              acao={
                <Botao tamanho="sm" onClick={() => setCriando(true)}>
                  Novo usuário
                </Botao>
              }
            />
          ) : (
            <ul className="divide-y divide-borda">
              {filtrados.map((usuario) => {
                const ativo = selecionado?.id === usuario.id;
                const total = (permissoes[usuario.id] ?? []).length;

                return (
                  <li key={usuario.id}>
                    <button
                      onClick={() => setSelecionado(usuario)}
                      className={cn(
                        'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
                        ativo ? 'bg-marca-50' : 'hover:bg-superficie',
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-800">
                        {usuario.nome.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-texto">
                          {usuario.role === 'admin' && (
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-marca-600" />
                          )}
                          {usuario.nome}
                          {usuario.id === meuPerfil.id && (
                            <span className="text-xs font-normal text-texto-fraco">(você)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-texto-suave">{usuario.email}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Selo tom="marca">{rotuloArea(usuario.area)}</Selo>
                        <span className="text-[11px] text-texto-fraco">
                          {usuario.role === 'admin' ? 'acesso total' : `${total} permissõe(s)`}
                        </span>
                      </div>
                      {!usuario.ativo && <Selo tom="erro">Inativo</Selo>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        {/* Detalhe / permissões */}
        {selecionado ? (
          <div className="space-y-4">
            <Cartao className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-texto">{selecionado.nome}</h2>
                  <p className="text-sm text-texto-suave">{selecionado.email}</p>
                </div>
                <div className="flex gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    onClick={() => setRedefinindoSenha(selecionado)}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Redefinir senha
                  </Botao>
                  {selecionado.ativo ? (
                    <Botao
                      variante="secundario"
                      tamanho="sm"
                      disabled={selecionado.id === meuPerfil.id}
                      title={selecionado.id === meuPerfil.id ? 'Você não pode desativar seu próprio acesso.' : undefined}
                      onClick={() => setConfirmandoDesativar(selecionado)}
                    >
                      Desativar
                    </Botao>
                  ) : (
                    <Botao tamanho="sm" onClick={() => void atualizarPerfil(selecionado, { ativo: true })}>
                      Reativar
                    </Botao>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Selecao
                  rotulo="Time"
                  value={selecionado.area}
                  onChange={(e) => void atualizarPerfil(selecionado, { area: e.target.value as Area })}
                  disabled={salvando}
                >
                  {AREAS.map((a) => (
                    <option key={a.valor} value={a.valor}>
                      {a.rotulo}
                    </option>
                  ))}
                </Selecao>

                <Selecao
                  rotulo="Função"
                  value={selecionado.role}
                  onChange={(e) => void atualizarPerfil(selecionado, { role: e.target.value as Role })}
                  disabled={salvando || selecionado.id === meuPerfil.id || (!souAdmin && selecionado.role === 'admin')}
                >
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor} disabled={r.valor === 'admin' && !souAdmin}>
                      {r.rotulo}
                    </option>
                  ))}
                </Selecao>
              </div>

              {selecionado.role === 'admin' && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-alerta-suave px-3.5 py-2.5 text-xs leading-relaxed text-alerta">
                  <strong>Administrador.</strong> Tem acesso irrestrito a todas as telas e dados,
                  independentemente dos checkboxes abaixo.
                </p>
              )}
            </Cartao>

            {/* Permissões */}
            <Cartao>
              <div className="border-b border-borda px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
                  <Layers className="h-4 w-4 text-marca-600" />
                  Permissões
                </h3>
                <p className="mt-0.5 text-xs text-texto-suave">
                  {possoConceder
                    ? 'Marque o que este usuário pode ver e fazer. Vale imediatamente.'
                    : 'Você não tem permissão para alterar concessões.'}
                </p>
              </div>

              <div className="divide-y divide-borda">
                {gruposCatalogo.map((grupo) => {
                  const itens = catalogo.filter((c) => c.grupo === grupo);
                  if (itens.length === 0) return null;

                  return (
                    <div key={grupo} className="px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
                        {TITULOS_GRUPO[grupo]?.rotulo ?? grupo}
                      </p>
                      <p className="mb-2.5 text-xs text-texto-fraco">{TITULOS_GRUPO[grupo]?.descricao}</p>

                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {itens.map((item) => {
                          const marcado =
                            selecionado.role === 'admin' ||
                            (permissoes[selecionado.id] ?? []).includes(item.chave);
                          // Confidencial só existe para admin — o banco recusa o resto.
                          // Para quem já é admin o checkbox fica travado marcado:
                          // o papel dá tudo, não há o que conceder ou revogar.
                          const bloqueado =
                            !possoConceder || selecionado.role === 'admin' || item.somente_admin;

                          return (
                            <label
                              key={item.chave}
                              title={item.descricao ?? undefined}
                              className={cn(
                                'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                                marcado ? 'border-marca-200 bg-marca-50' : 'border-borda hover:bg-superficie',
                                bloqueado && 'cursor-not-allowed opacity-60',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={marcado}
                                disabled={bloqueado}
                                onChange={(e) =>
                                  void alternarPermissao(selecionado, item.chave, e.target.checked)
                                }
                                className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-sm font-medium text-texto">
                                  {item.rotulo}
                                  {item.somente_admin && <Lock className="h-3 w-3 text-alerta" />}
                                </span>
                                {item.descricao && (
                                  <span className="mt-0.5 block text-[11px] leading-snug text-texto-suave">
                                    {item.descricao}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Cartao>

            {/* Colunas */}
            <Cartao>
              <div className="border-b border-borda px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
                  <Columns3 className="h-4 w-4 text-marca-600" />
                  Colunas que pode editar
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-texto-suave">
                  Deixe tudo desmarcado para liberar <strong>todas</strong> as colunas. Marcando
                  alguma, o usuário passa a editar somente as marcadas — as demais ficam apenas para
                  leitura.
                </p>
              </div>

              <div className="grid gap-1.5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                {colunasDisponiveis.map((coluna) => {
                  const marcado = (colunas[selecionado.id] ?? []).includes(coluna.campo);
                  return (
                    <label
                      key={coluna.campo}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                        marcado ? 'border-marca-200 bg-marca-50' : 'border-borda hover:bg-superficie',
                        !possoConceder && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={!possoConceder}
                        onChange={(e) => void alternarColuna(selecionado, coluna.campo, e.target.checked)}
                        className="h-4 w-4 rounded border-borda-forte text-marca-600"
                      />
                      <span className="truncate text-texto">{coluna.rotulo}</span>
                    </label>
                  );
                })}
              </div>

              <p className="border-t border-borda px-5 py-3 text-xs text-texto-suave">
                {(colunas[selecionado.id] ?? []).length === 0
                  ? 'Sem restrição: pode editar qualquer coluna da base.'
                  : `Restrito a ${(colunas[selecionado.id] ?? []).length} coluna(s).`}
              </p>
            </Cartao>
          </div>
        ) : (
          <Cartao>
            <EstadoVazio
              icone={<Users className="h-6 w-6" />}
              titulo="Selecione um usuário"
              descricao="Escolha alguém na lista para ver e ajustar o time, as telas e as colunas que pode editar."
            />
          </Cartao>
        )}
      </div>

      {/* Criar usuário */}
      <Modal
        aberto={criando}
        aoFechar={() => setCriando(false)}
        titulo="Novo usuário"
        descricao="A conta é criada já com senha definida. O usuário pode trocá-la depois."
        largura="lg"
      >
        <FormularioNovoUsuario
          catalogo={catalogo}
          souAdmin={souAdmin}
          aoCriar={(novo) => {
            setUsuarios((atuais) => [...atuais, novo.perfil].sort((a, b) => a.nome.localeCompare(b.nome)));
            setPermissoes((atuais) => ({ ...atuais, [novo.perfil.id]: novo.permissoes }));
            setSelecionado(novo.perfil);
            setCriando(false);
            router.refresh();
          }}
        />
      </Modal>

      {/* Redefinir senha */}
      <Modal
        aberto={Boolean(redefinindoSenha)}
        aoFechar={() => {
          setRedefinindoSenha(null);
          setNovaSenha('');
        }}
        titulo={`Redefinir senha de ${redefinindoSenha?.nome ?? ''}`}
        descricao="O usuário passa a entrar com a nova senha imediatamente."
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setRedefinindoSenha(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void redefinirSenha()} carregando={salvando} disabled={novaSenha.length < 8}>
              Redefinir
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Nova senha"
          type="text"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          dica="Mínimo de 8 caracteres. Anote e entregue ao usuário."
          placeholder="ex.: MetaPlano@2026"
        />
      </Modal>

      <ModalConfirmacao
        aberto={Boolean(confirmandoDesativar)}
        aoFechar={() => setConfirmandoDesativar(null)}
        aoConfirmar={() => confirmandoDesativar && void atualizarPerfil(confirmandoDesativar, { ativo: false })}
        titulo="Desativar acesso"
        rotuloConfirmar="Desativar"
        carregando={salvando}
        mensagem={
          <>
            <strong>{confirmandoDesativar?.nome}</strong> deixará de conseguir entrar no portal
            imediatamente. As permissões e o histórico são preservados.
          </>
        }
      />
    </div>
  );
}
