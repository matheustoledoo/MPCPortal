'use client';

import { useMemo, useState, type FormEvent } from 'react';

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';

import {
  AreaTexto,
  Botao,
  Campo,
  Cartao,
  EstadoErro,
  EstadoVazio,
  Modal,
  ModalConfirmacao,
  Selecao,
  Selo,
  cn,
  useAvisos,
} from '@/components/ui';
import {
  TONS_SITUACAO,
  diasAte,
  formatarData,
  hojeIso,
  situacaoDe,
  textoPrazo,
} from '@/lib/atribuicoes';
import {
  AREAS,
  PERIODICIDADES,
  podeGerenciarAtribuicoes,
  rotuloArea,
  rotuloPeriodicidade,
} from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type {
  Area,
  AtribuicaoComResponsavel,
  Perfil,
  Periodicidade,
  PerfilComPermissoes,
} from '@/types/banco';

type Pessoa = Pick<Perfil, 'id' | 'nome' | 'email' | 'area' | 'role' | 'ativo'>;

interface Rascunho {
  id: string | null;
  titulo: string;
  descricao: string;
  responsavel_id: string;
  area: Area;
  colunas: string[];
  periodicidade: Periodicidade;
  proximo_prazo: string;
  alerta_dias_antes: number;
}

function rascunhoVazio(area: Area): Rascunho {
  return {
    id: null,
    titulo: '',
    descricao: '',
    responsavel_id: '',
    area,
    colunas: [],
    periodicidade: 'mensal',
    proximo_prazo: hojeIso(30),
    alerta_dias_antes: 5,
  };
}

export function PainelAtribuicoes({
  meuPerfil,
  atribuicoesIniciais,
  pessoas,
  colunasDisponiveis,
  erroCarregamento,
}: {
  meuPerfil: PerfilComPermissoes;
  atribuicoesIniciais: AtribuicaoComResponsavel[];
  pessoas: Pessoa[];
  colunasDisponiveis: { campo: string; rotulo: string }[];
  erroCarregamento: string | null;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [itens, setItens] = useState(atribuicoesIniciais);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'minhas' | 'atrasadas' | 'inativas'>('todas');
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<AtribuicaoComResponsavel | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const podeGerir = podeGerenciarAtribuicoes(meuPerfil);
  const rotuloColuna = (campo: string) =>
    colunasDisponiveis.find((c) => c.campo === campo)?.rotulo ?? campo;

  const visiveis = itens.filter((a) => {
    const termo = busca.trim().toLowerCase();
    const casaBusca =
      !termo ||
      a.titulo.toLowerCase().includes(termo) ||
      (a.responsavel?.nome ?? '').toLowerCase().includes(termo) ||
      a.colunas.some((c) => rotuloColuna(c).toLowerCase().includes(termo));
    if (!casaBusca) return false;

    if (filtro === 'minhas') return a.ativa && a.responsavel_id === meuPerfil.id;
    if (filtro === 'atrasadas') return a.ativa && diasAte(a.proximo_prazo) < 0;
    if (filtro === 'inativas') return !a.ativa;
    return a.ativa;
  });

  async function concluir(atribuicao: AtribuicaoComResponsavel) {
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc('concluir_atribuicao', {
        p_atribuicao: atribuicao.id,
        p_observacao: null,
      });
      if (error) throw new Error(error.message);

      const atualizada = data as unknown as AtribuicaoComResponsavel;
      setItens((atuais) =>
        atuais.map((a) =>
          a.id === atribuicao.id ? { ...a, ...atualizada, responsavel: a.responsavel } : a,
        ),
      );
      avisar(
        'sucesso',
        atualizada.ativa
          ? `Ciclo concluído. Próximo prazo: ${formatarData(atualizada.proximo_prazo)}.`
          : 'Atribuição avulsa concluída e encerrada.',
      );
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!rascunho) return;
    setErroForm(null);

    if (rascunho.titulo.trim().length < 3) return setErroForm('Descreva a atribuição em poucas palavras.');
    if (!rascunho.responsavel_id) return setErroForm('Escolha o responsável.');
    if (!rascunho.proximo_prazo) return setErroForm('Informe o próximo prazo.');

    setSalvando(true);
    try {
      const registro = {
        titulo: rascunho.titulo.trim(),
        descricao: rascunho.descricao.trim() || null,
        responsavel_id: rascunho.responsavel_id,
        area: rascunho.area,
        tabela: 'legalizacao_empresas',
        colunas: rascunho.colunas,
        periodicidade: rascunho.periodicidade,
        proximo_prazo: rascunho.proximo_prazo,
        alerta_dias_antes: rascunho.alerta_dias_antes,
      };

      const consulta = rascunho.id
        ? supabase.from('atribuicoes').update(registro).eq('id', rascunho.id).select('*').single()
        : supabase
            .from('atribuicoes')
            .insert({ ...registro, criado_por: meuPerfil.id })
            .select('*')
            .single();

      const { data, error } = await consulta;
      if (error) throw new Error(error.message);

      const dono = pessoas.find((p) => p.id === rascunho.responsavel_id) ?? null;
      const salva = {
        ...(data as unknown as AtribuicaoComResponsavel),
        responsavel: dono
          ? { id: dono.id, nome: dono.nome, email: dono.email, area: dono.area }
          : null,
      };

      setItens((atuais) =>
        rascunho.id ? atuais.map((a) => (a.id === rascunho.id ? salva : a)) : [...atuais, salva],
      );
      avisar('sucesso', rascunho.id ? 'Atribuição atualizada.' : 'Atribuição criada.');
      setRascunho(null);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('atribuicoes').delete().eq('id', excluindo.id);
      if (error) throw new Error(error.message);
      setItens((atuais) => atuais.filter((a) => a.id !== excluindo.id));
      avisar('sucesso', 'Atribuição removida.');
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível remover.');
    } finally {
      setSalvando(false);
      setExcluindo(null);
    }
  }

  if (erroCarregamento) {
    return (
      <Cartao>
        <EstadoErro
          mensagem={
            `${erroCarregamento}. Se a mensagem citar "atribuicoes", a migration 0011 ainda ` +
            'não foi aplicada no banco.'
          }
        />
      </Cartao>
    );
  }

  const minhasAtrasadas = itens.filter(
    (a) => a.ativa && a.responsavel_id === meuPerfil.id && diasAte(a.proximo_prazo) < 0,
  ).length;

  return (
    <div className="space-y-4">
      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Campo
              type="search"
              placeholder="Buscar por título, responsável ou coluna…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              iconeInicial={<Search className="h-4 w-4" />}
              aria-label="Buscar atribuição"
            />
          </div>
          <div className="w-52">
            <Selecao
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as typeof filtro)}
              aria-label="Filtrar atribuições"
            >
              <option value="todas">Todas as ativas</option>
              <option value="minhas">Somente as minhas</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="inativas">Encerradas</option>
            </Selecao>
          </div>
          {podeGerir && (
            <Botao onClick={() => setRascunho(rascunhoVazio(meuPerfil.area))}>
              <Plus className="h-4 w-4" />
              Nova atribuição
            </Botao>
          )}
        </div>

        {minhasAtrasadas > 0 && (
          <p className="mt-3 rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro">
            Você tem <strong>{minhasAtrasadas}</strong> atribuição(ões) com o prazo vencido.
          </p>
        )}
      </Cartao>

      {visiveis.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<ClipboardList className="h-6 w-6" />}
            titulo="Nenhuma atribuição por aqui"
            descricao={
              podeGerir
                ? 'Crie a primeira: escolha o responsável, as colunas que ele mantém e a frequência.'
                : 'Quando alguém definir uma responsabilidade para o seu time, ela aparece aqui.'
            }
            acao={
              podeGerir ? (
                <Botao tamanho="sm" onClick={() => setRascunho(rascunhoVazio(meuPerfil.area))}>
                  Nova atribuição
                </Botao>
              ) : undefined
            }
          />
        </Cartao>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visiveis.map((a) => {
            const dias = diasAte(a.proximo_prazo);
            const situacao = situacaoDe(dias, a.alerta_dias_antes);
            const souResponsavel = a.responsavel_id === meuPerfil.id;

            return (
              <Cartao key={a.id} className={cn('p-4', souResponsavel && 'border-marca-200')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-texto">{a.titulo}</h3>
                    {a.descricao && (
                      <p className="mt-1 text-xs leading-relaxed text-texto-suave">{a.descricao}</p>
                    )}
                  </div>
                  {a.ativa ? (
                    <Selo tom={TONS_SITUACAO[situacao]}>{textoPrazo(dias)}</Selo>
                  ) : (
                    <Selo>Encerrada</Selo>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 shrink-0 text-texto-fraco" />
                    <dt className="sr-only">Responsável</dt>
                    <dd className="truncate text-texto-suave">
                      <span className="font-medium text-texto">
                        {a.responsavel?.nome ?? 'sem responsável'}
                      </span>
                      {souResponsavel && <span className="text-texto-fraco"> (você)</span>}
                      {a.responsavel && ` · ${rotuloArea(a.responsavel.area)}`}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-texto-fraco" />
                    <dt className="sr-only">Prazo</dt>
                    <dd className="text-texto-suave">
                      {rotuloPeriodicidade(a.periodicidade)} · próximo em{' '}
                      <span className="font-medium text-texto">{formatarData(a.proximo_prazo)}</span>
                    </dd>
                  </div>
                </dl>

                {a.colunas.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {a.colunas.map((coluna) => (
                      <Selo key={coluna} tom="marca" className="text-[10px]">
                        {rotuloColuna(coluna)}
                      </Selo>
                    ))}
                  </div>
                )}
                {a.colunas.length === 0 && (
                  <p className="mt-3 text-[11px] text-texto-fraco">
                    Sem coluna específica — responde pelo registro inteiro.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-borda pt-3">
                  {a.ativa && (souResponsavel || podeGerir) && (
                    <Botao
                      tamanho="sm"
                      variante={situacao === 'em_dia' ? 'secundario' : 'primario'}
                      disabled={salvando}
                      onClick={() => void concluir(a)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Concluir ciclo
                    </Botao>
                  )}
                  {podeGerir && (
                    <>
                      <Botao
                        tamanho="sm"
                        variante="secundario"
                        onClick={() =>
                          setRascunho({
                            id: a.id,
                            titulo: a.titulo,
                            descricao: a.descricao ?? '',
                            responsavel_id: a.responsavel_id,
                            area: a.area,
                            colunas: a.colunas,
                            periodicidade: a.periodicidade,
                            proximo_prazo: a.proximo_prazo.slice(0, 10),
                            alerta_dias_antes: a.alerta_dias_antes,
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Botao>
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        onClick={() => setExcluindo(a)}
                        aria-label={`Remover ${a.titulo}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Botao>
                    </>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      <Modal
        aberto={Boolean(rascunho)}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Editar atribuição' : 'Nova atribuição'}
        descricao="Quem cuida do quê, com que frequência e até quando."
        largura="lg"
      >
        {rascunho && (
          <form onSubmit={salvar} className="space-y-4" noValidate>
            <Campo
              rotulo="O que precisa ser feito"
              value={rascunho.titulo}
              onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
              placeholder="Ex.: Atualizar o Alvará de todos os clientes"
              required
            />

            <AreaTexto
              rotulo="Detalhes (opcional)"
              value={rascunho.descricao}
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              placeholder="Onde consultar, o que considerar concluído…"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao
                rotulo="Responsável"
                value={rascunho.responsavel_id}
                onChange={(e) => {
                  const pessoa = pessoas.find((p) => p.id === e.target.value);
                  setRascunho({
                    ...rascunho,
                    responsavel_id: e.target.value,
                    area: pessoa?.area ?? rascunho.area,
                  });
                }}
                required
              >
                <option value="">Escolha…</option>
                {pessoas
                  .filter((p) => p.ativo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} — {rotuloArea(p.area)}
                    </option>
                  ))}
              </Selecao>

              <Selecao
                rotulo="Time"
                value={rascunho.area}
                onChange={(e) => setRascunho({ ...rascunho, area: e.target.value as Area })}
              >
                {AREAS.map((a) => (
                  <option key={a.valor} value={a.valor}>
                    {a.rotulo}
                  </option>
                ))}
              </Selecao>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Selecao
                rotulo="Com que frequência"
                value={rascunho.periodicidade}
                onChange={(e) =>
                  setRascunho({ ...rascunho, periodicidade: e.target.value as Periodicidade })
                }
              >
                {PERIODICIDADES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </Selecao>

              <Campo
                rotulo="Próximo prazo"
                type="date"
                value={rascunho.proximo_prazo}
                onChange={(e) => setRascunho({ ...rascunho, proximo_prazo: e.target.value })}
                required
              />

              <Campo
                rotulo="Avisar com"
                type="number"
                min={0}
                max={90}
                value={rascunho.alerta_dias_antes}
                onChange={(e) =>
                  setRascunho({ ...rascunho, alerta_dias_antes: Number(e.target.value) || 0 })
                }
                dica="dias de antecedência"
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-texto-suave">
                Colunas sob responsabilidade
              </p>
              <p className="mb-2 text-xs text-texto-fraco">
                Deixe vazio se a responsabilidade for pelo registro inteiro. Estas colunas aparecem
                para todo mundo na planilha, com o nome de quem cuida delas.
              </p>
              <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-lg border border-borda p-2 sm:grid-cols-2">
                {colunasDisponiveis.map((coluna) => {
                  const marcado = rascunho.colunas.includes(coluna.campo);
                  return (
                    <label
                      key={coluna.campo}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                        marcado ? 'border-marca-200 bg-marca-50' : 'border-transparent hover:bg-superficie',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) =>
                          setRascunho({
                            ...rascunho,
                            colunas: e.target.checked
                              ? [...rascunho.colunas, coluna.campo]
                              : rascunho.colunas.filter((c) => c !== coluna.campo),
                          })
                        }
                        className="h-4 w-4 rounded border-borda-forte text-marca-600"
                      />
                      <span className="truncate text-texto">{coluna.rotulo}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {erroForm && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro"
              >
                {erroForm}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <Botao type="button" variante="secundario" onClick={() => setRascunho(null)}>
                Cancelar
              </Botao>
              <Botao type="submit" carregando={salvando}>
                {rascunho.id ? 'Salvar alterações' : 'Criar atribuição'}
              </Botao>
            </div>
          </form>
        )}
      </Modal>

      <ModalConfirmacao
        aberto={Boolean(excluindo)}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={() => void excluir()}
        titulo="Remover atribuição"
        rotuloConfirmar="Remover"
        carregando={salvando}
        mensagem={
          <>
            <strong>{excluindo?.titulo}</strong> deixa de aparecer para{' '}
            {excluindo?.responsavel?.nome ?? 'o responsável'}. O histórico de ciclos concluídos
            também é apagado.
          </>
        }
      />
    </div>
  );
}
