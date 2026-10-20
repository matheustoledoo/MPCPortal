'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { Trash2 } from 'lucide-react';

import type { PessoaCalendario } from '@/app/(portal)/calendario/CalendarioApp';
import { BuscaEmpresa } from '@/components/processos/BuscaEmpresa';
import { AreaTexto, Botao, Campo, Modal, ModalConfirmacao, Selecao, cn, useAvisos } from '@/components/ui';
import {
  CATEGORIAS,
  DEPARTAMENTOS,
  MESES,
  REFERENCIAS,
  REGIMES,
  REUNIAO_PARA,
  TIPOS_EVENTO,
  br,
  criarCalendarioFeriados,
  dataRegra,
  hojeYmd,
  mesmaPessoa,
  refLabel,
  ymd,
} from '@/lib/calendario';
import { mascararCnpj } from '@/lib/mascaras';
import { formatarCnpj } from '@/lib/normalizacao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type {
  AjusteVencimento,
  CategoriaCalendario,
  Departamento,
  EventoCalendario,
  Recorrencia,
  ReferenciaCompetencia,
  RegraCalendario,
  TipoEvento,
  TipoVencimento,
} from '@/types/banco';

const OUTRA = '__outra__';

/* -------------------------------------------------------------------------- */
/* Designado para                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Escolhe alguém da equipe (é quem recebe a notificação) ou, como no app
 * antigo, digita um nome livre — útil para quem ainda não tem acesso.
 */
function SeletorResponsavel({
  pessoas,
  departamento,
  id,
  nome,
  aoMudar,
}: {
  pessoas: PessoaCalendario[];
  departamento: Departamento;
  id: string | null;
  nome: string;
  aoMudar: (id: string | null, nome: string) => void;
}) {
  const [livre, setLivre] = useState(!id && Boolean(nome));
  const doDepartamento = pessoas.filter((p) => p.departamento === departamento);
  const outras = pessoas.filter((p) => p.departamento !== departamento);

  return (
    <div className="space-y-2">
      <Selecao
        rotulo="Designado para"
        value={livre ? OUTRA : (id ?? '')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OUTRA) {
            setLivre(true);
            aoMudar(null, nome);
          } else {
            setLivre(false);
            aoMudar(v || null, pessoas.find((p) => p.id === v)?.nome ?? '');
          }
        }}
      >
        <option value="">Ninguém (o departamento todo)</option>
        {doDepartamento.length > 0 && (
          <optgroup label={departamento}>
            {doDepartamento.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </optgroup>
        )}
        {outras.length > 0 && (
          <optgroup label="Outros departamentos">
            {outras.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.departamento}
              </option>
            ))}
          </optgroup>
        )}
        <option value={OUTRA}>Outra pessoa (digitar o nome)…</option>
      </Selecao>
      {livre && (
        <Campo
          value={nome}
          onChange={(e) => aoMudar(null, e.target.value)}
          maxLength={60}
          placeholder="Nome de quem vai cuidar"
          dica="Sem acesso ao portal, a pessoa não recebe notificação."
          autoFocus
        />
      )}
    </div>
  );
}

/** Acha o perfil pelo nome quando o item veio do app antigo só com o texto. */
function resolverResponsavel(pessoas: PessoaCalendario[], id: string | null, nome: string | null) {
  if (id) return { id, nome: pessoas.find((p) => p.id === id)?.nome ?? nome ?? '' };
  const achada = nome ? pessoas.find((p) => mesmaPessoa(p.nome, nome)) : undefined;
  return achada ? { id: achada.id, nome: achada.nome } : { id: null, nome: nome ?? '' };
}

/* -------------------------------------------------------------------------- */
/* Compromisso, demanda ou reunião                                             */
/* -------------------------------------------------------------------------- */

interface RascunhoEvento {
  tipo: TipoEvento;
  titulo: string;
  data: string;
  data_inicio: string;
  hora: string;
  categoria: CategoriaCalendario;
  departamento: Departamento;
  responsavel_id: string | null;
  responsavel_nome: string;
  visivel_para: Departamento[];
  recorrencia: Recorrencia;
  notas: string;
  empresa_id: string | null;
  empresa: string;
  cnpj: string;
  contato: string;
  modalidade: string;
}

export function EditorEvento({
  aberto,
  evento,
  dataPadrao,
  aoFechar,
  aoSalvo,
  deptosPermitidos,
  deptPadrao,
  pessoas,
  meuId,
  meuNome,
}: {
  aberto: boolean;
  evento: EventoCalendario | null;
  dataPadrao?: string;
  aoFechar: () => void;
  aoSalvo: (e: EventoCalendario | null) => void;
  deptosPermitidos: Departamento[];
  deptPadrao: Departamento;
  pessoas: PessoaCalendario[];
  meuId: string;
  meuNome: string;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const { avisar } = useAvisos();
  const [r, setR] = useState<RascunhoEvento | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  useEffect(() => {
    if (!aberto) {
      setR(null);
      return;
    }
    setErro('');
    const resp = resolverResponsavel(pessoas, evento?.responsavel_id ?? null, evento?.responsavel_nome ?? null);
    setR({
      tipo: evento?.tipo ?? '',
      titulo: evento?.titulo ?? '',
      data: evento?.data?.slice(0, 10) ?? dataPadrao ?? hojeYmd(),
      data_inicio: evento?.data_inicio?.slice(0, 10) ?? '',
      hora: evento?.hora?.slice(0, 5) ?? '',
      categoria: evento?.categoria ?? 'Outro',
      departamento: evento?.departamento ?? deptPadrao,
      responsavel_id: resp.id,
      responsavel_nome: resp.nome,
      visivel_para: evento?.visivel_para ?? [],
      recorrencia: evento?.recorrencia ?? 'nenhuma',
      notas: evento?.notas ?? '',
      empresa_id: evento?.empresa_id ?? null,
      empresa: evento?.empresa ?? '',
      cnpj: evento?.cnpj ? formatarCnpj(evento.cnpj) : '',
      contato: evento?.contato ?? '',
      modalidade: evento?.modalidade ?? '',
    });
  }, [aberto, evento, dataPadrao, deptPadrao, pessoas]);

  if (!aberto || !r) return null;
  const rascunho = r;
  const mudar = (parcial: Partial<RascunhoEvento>) => setR((atual) => (atual ? { ...atual, ...parcial } : atual));
  const demanda = rascunho.tipo === 'Demanda';
  const integracao = rascunho.tipo === 'Reunião de Integração';
  const podeMudarDept = deptosPermitidos.length > 1;

  function trocarTipo(tipo: TipoEvento) {
    const para = REUNIAO_PARA[tipo];
    const parcial: Partial<RascunhoEvento> = { tipo };
    if (para) {
      // Reuniões chamam os departamentos de sempre; a de integração é da Qualidade.
      if (!evento && deptosPermitidos.includes('Qualidade')) parcial.departamento = 'Qualidade';
      parcial.visivel_para = para;
      if (rascunho.categoria === 'Outro') parcial.categoria = 'Interna';
    }
    mudar(parcial);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (demanda && rascunho.data_inicio && rascunho.data_inicio > rascunho.data) {
      setErro('O prazo inicial precisa ser antes do prazo final.');
      return;
    }
    let titulo = rascunho.titulo.trim();
    if (!titulo) titulo = integracao ? `Reunião de Integração${rascunho.empresa.trim() ? ` – ${rascunho.empresa.trim()}` : ''}` : rascunho.tipo;
    if (!titulo || !rascunho.data) {
      setErro('Preencha o título e a data.');
      return;
    }

    // Quem designou só muda quando muda o responsável (como no app antigo).
    const mesmoResponsavel =
      evento && (evento.responsavel_id ? evento.responsavel_id === rascunho.responsavel_id : mesmaPessoa(evento.responsavel_nome, rascunho.responsavel_nome));
    const dados = {
      titulo: titulo.slice(0, 140),
      tipo: rascunho.tipo,
      data: rascunho.data,
      data_inicio: demanda && rascunho.data_inicio ? rascunho.data_inicio : null,
      hora: rascunho.hora || null,
      categoria: rascunho.categoria,
      departamento: rascunho.departamento,
      visivel_para: rascunho.visivel_para.filter((d) => d !== rascunho.departamento),
      responsavel_id: rascunho.responsavel_id,
      responsavel_nome: rascunho.responsavel_nome.trim() || null,
      designado_por: mesmoResponsavel ? evento.designado_por : rascunho.responsavel_id || rascunho.responsavel_nome.trim() ? meuId : null,
      designado_por_nome: mesmoResponsavel ? evento.designado_por_nome : rascunho.responsavel_id || rascunho.responsavel_nome.trim() ? meuNome : null,
      recorrencia: demanda ? 'nenhuma' : rascunho.recorrencia,
      notas: rascunho.notas.trim(),
      empresa_id: integracao ? rascunho.empresa_id : null,
      empresa: integracao ? rascunho.empresa.trim() || null : null,
      cnpj: integracao ? rascunho.cnpj || null : null,
      contato: integracao ? rascunho.contato.trim() || null : null,
      modalidade: integracao ? rascunho.modalidade || null : null,
    };

    setSalvando(true);
    const consulta = evento
      ? supabase.from('calendario_eventos').update(dados).eq('id', evento.id).select('*').single()
      : supabase.from('calendario_eventos').insert(dados).select('*').single();
    const { data, error } = await consulta;
    setSalvando(false);
    if (error) {
      setErro(error.code === '42501' ? 'Você não pode criar ou editar compromissos deste departamento.' : error.message);
      return;
    }
    avisar('sucesso', evento ? 'Compromisso atualizado.' : 'Compromisso criado.');
    aoSalvo(data as EventoCalendario);
  }

  async function excluir() {
    if (!evento) return;
    setSalvando(true);
    const { error } = await supabase.from('calendario_eventos').delete().eq('id', evento.id);
    setSalvando(false);
    setConfirmarExclusao(false);
    if (error) {
      setErro(error.message);
      return;
    }
    avisar('sucesso', 'Compromisso excluído.');
    aoSalvo(null);
  }

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo={evento ? 'Editar compromisso' : 'Novo compromisso ou demanda'}
        largura="lg"
        rodape={
          <div className="flex w-full items-center justify-between gap-2">
            {evento ? (
              <Botao variante="fantasma" className="text-erro hover:bg-erro-suave" onClick={() => setConfirmarExclusao(true)} disabled={salvando}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Botao>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao type="submit" form="form-evento" carregando={salvando}>
                Salvar
              </Botao>
            </div>
          </div>
        }
      >
        <form id="form-evento" onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Selecao rotulo="Tipo" value={rascunho.tipo} onChange={(e) => trocarTipo(e.target.value as TipoEvento)}>
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>
                  {t || 'Compromisso comum'}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="sm:col-span-2">
            <Campo
              rotulo="Título"
              value={rascunho.titulo}
              onChange={(e) => mudar({ titulo: e.target.value })}
              maxLength={140}
              placeholder={integracao ? 'Em branco: "Reunião de Integração – <empresa>"' : 'Ex.: Conferir notas do cliente X, entrega de documentos'}
              autoFocus={!evento}
            />
          </div>

          {demanda && <Campo rotulo="Prazo inicial" type="date" value={rascunho.data_inicio} onChange={(e) => mudar({ data_inicio: e.target.value })} />}
          <Campo rotulo={demanda ? 'Prazo final' : 'Data'} type="date" required value={rascunho.data} onChange={(e) => mudar({ data: e.target.value })} />
          <Campo rotulo="Hora" type="time" value={rascunho.hora} onChange={(e) => mudar({ hora: e.target.value })} />

          {integracao && (
            <fieldset className="grid gap-3 rounded-xl border border-dashed border-borda-forte bg-marca-50/30 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-texto">Ficha da Reunião de Integração</legend>
              <div className="sm:col-span-2">
                <BuscaEmpresa
                  valor={rascunho.empresa}
                  aoEscolher={(emp) => mudar({ empresa_id: emp.id, empresa: emp.razao_social, cnpj: emp.cnpj ? formatarCnpj(emp.cnpj) : rascunho.cnpj })}
                  aoDigitarLivre={(t) => mudar({ empresa: t, empresa_id: null })}
                  dica="Cliente novo ainda fora da base também vale: o vínculo é feito pelo CNPJ."
                />
              </div>
              <Campo
                rotulo="CNPJ"
                inputMode="numeric"
                maxLength={18}
                placeholder="00.000.000/0000-00"
                value={rascunho.cnpj}
                onChange={(e) => mudar({ cnpj: mascararCnpj(e.target.value) })}
              />
              <Selecao rotulo="Modalidade" value={rascunho.modalidade} onChange={(e) => mudar({ modalidade: e.target.value })}>
                {['', 'Presencial', 'On-line', 'Telefone'].map((m) => (
                  <option key={m} value={m}>
                    {m || 'Escolha…'}
                  </option>
                ))}
              </Selecao>
              <div className="sm:col-span-2">
                <Campo rotulo="Contato" maxLength={140} placeholder="Nome e telefone ou e-mail" value={rascunho.contato} onChange={(e) => mudar({ contato: e.target.value })} />
              </div>
            </fieldset>
          )}

          <Selecao rotulo="Esfera" value={rascunho.categoria} onChange={(e) => mudar({ categoria: e.target.value as CategoriaCalendario })}>
            {CATEGORIAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Selecao>
          <Selecao
            rotulo="Departamento"
            value={rascunho.departamento}
            disabled={!podeMudarDept}
            onChange={(e) => mudar({ departamento: e.target.value as Departamento })}
          >
            {deptosPermitidos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Selecao>

          <div className="sm:col-span-2">
            <SeletorResponsavel
              key={evento?.id ?? 'novo'}
              pessoas={pessoas}
              departamento={rascunho.departamento}
              id={rascunho.responsavel_id}
              nome={rascunho.responsavel_nome}
              aoMudar={(id, nome) => mudar({ responsavel_id: id, responsavel_nome: nome })}
            />
          </div>

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-texto-suave">Também aparece para</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DEPARTAMENTOS.filter((d) => d !== rascunho.departamento).map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm text-texto">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-borda-forte text-marca-600"
                    checked={rascunho.visivel_para.includes(d)}
                    onChange={(e) =>
                      mudar({ visivel_para: e.target.checked ? [...rascunho.visivel_para, d] : rascunho.visivel_para.filter((x) => x !== d) })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>

          {!demanda && (
            <div className="sm:col-span-2">
              <Selecao rotulo="Repetição" value={rascunho.recorrencia} onChange={(e) => mudar({ recorrencia: e.target.value as Recorrencia })}>
                <option value="nenhuma">Só nesta data</option>
                <option value="mensal">Todo mês, no mesmo dia</option>
                <option value="anual">Todo ano, na mesma data</option>
              </Selecao>
            </div>
          )}

          <div className="sm:col-span-2">
            <AreaTexto rotulo="Observações" maxLength={2000} value={rascunho.notas} onChange={(e) => mudar({ notas: e.target.value })} />
            <p className="mt-1.5 text-xs text-texto-fraco">
              Esfera &quot;Feriado&quot; marca o dia como não útil e recalcula os vencimentos — use para feriados estaduais e municipais.
            </p>
          </div>

          {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro sm:col-span-2">{erro}</p>}
        </form>
      </Modal>

      <ModalConfirmacao
        aberto={confirmarExclusao}
        aoFechar={() => setConfirmarExclusao(false)}
        aoConfirmar={() => void excluir()}
        titulo="Excluir compromisso"
        mensagem={
          <>
            <strong>{evento?.titulo}</strong> sai do calendário de todos os departamentos.
            {evento?.recorrencia !== 'nenhuma' ? ' Como ele se repete, somem também as próximas datas.' : ''}
          </>
        }
        rotuloConfirmar="Excluir"
        carregando={salvando}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Obrigação fixa                                                              */
/* -------------------------------------------------------------------------- */

type RascunhoRegra = Omit<RegraCalendario, 'id' | 'updated_at' | 'responsavel_nome'> & { responsavel_nome: string };

export function EditorRegra({
  aberto,
  regra,
  aoFechar,
  aoSalvo,
  deptosPermitidos,
  deptPadrao,
  pessoas,
  eventos = [],
}: {
  aberto: boolean;
  regra: RegraCalendario | null;
  aoFechar: () => void;
  aoSalvo: () => void;
  deptosPermitidos: Departamento[];
  deptPadrao: Departamento;
  pessoas: PessoaCalendario[];
  /** Para a prévia considerar os feriados cadastrados. */
  eventos?: EventoCalendario[];
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const { avisar } = useAvisos();
  const [r, setR] = useState<RascunhoRegra | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const feriados = useMemo(() => criarCalendarioFeriados(eventos), [eventos]);

  useEffect(() => {
    if (!aberto) {
      setR(null);
      return;
    }
    setErro('');
    const resp = resolverResponsavel(pessoas, regra?.responsavel_id ?? null, regra?.responsavel_nome ?? null);
    setR({
      nome: regra?.nome ?? '',
      departamento: regra?.departamento ?? deptPadrao,
      categoria: regra?.categoria ?? 'Federal',
      regime: regra?.regime ?? 'Todos',
      tipo: regra?.tipo ?? 'dia',
      dia: regra?.dia ?? 20,
      ajuste: regra?.ajuste ?? 'antecipa',
      meses: regra?.meses ?? [],
      ref: regra?.ref ?? 'mes',
      descricao: regra?.descricao ?? '',
      ativo: regra?.ativo ?? true,
      sabado_util: regra?.sabado_util ?? false,
      responsavel_id: resp.id,
      responsavel_nome: resp.nome,
    });
  }, [aberto, regra, deptPadrao, pessoas]);

  // Prévia: as próximas datas, com a mesma conta do calendário.
  const proximas = useMemo(() => {
    if (!r) return [];
    const saida: { data: string; ref: string }[] = [];
    const base = new Date();
    const regraTeste = { ...r, id: 'previa', responsavel_nome: r.responsavel_nome || null } as RegraCalendario;
    for (let i = 0; i < 24 && saida.length < 4; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const m = d.getMonth() + 1;
      if (r.meses.length && !r.meses.includes(m)) continue;
      const dt = dataRegra(regraTeste, d.getFullYear(), m, feriados);
      if (dt && ymd(dt) >= hojeYmd()) saida.push({ data: ymd(dt), ref: refLabel(regraTeste, d.getFullYear(), m) });
    }
    return saida;
  }, [r, feriados]);

  if (!aberto || !r) return null;
  const rascunho = r;
  const mudar = (parcial: Partial<RascunhoRegra>) => setR((atual) => (atual ? { ...atual, ...parcial } : atual));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!rascunho.nome.trim()) {
      setErro('Dê um nome à obrigação.');
      return;
    }
    const dados = {
      ...rascunho,
      nome: rascunho.nome.trim().slice(0, 140),
      descricao: rascunho.descricao.trim(),
      dia: Math.min(31, Math.max(1, Number(rascunho.dia) || 1)),
      responsavel_nome: rascunho.responsavel_nome.trim() || null,
      meses: [...rascunho.meses].sort((a, b) => a - b),
    };
    setSalvando(true);
    const { error } = regra
      ? await supabase.from('calendario_regras').update(dados).eq('id', regra.id)
      : await supabase.from('calendario_regras').insert(dados);
    setSalvando(false);
    if (error) {
      setErro(error.code === '42501' ? 'Você não pode criar ou editar obrigações deste departamento.' : error.message);
      return;
    }
    avisar('sucesso', regra ? 'Obrigação atualizada.' : 'Obrigação criada.');
    aoSalvo();
  }

  async function excluir() {
    if (!regra) return;
    setSalvando(true);
    const { error } = await supabase.from('calendario_regras').delete().eq('id', regra.id);
    setSalvando(false);
    setConfirmarExclusao(false);
    if (error) {
      setErro(error.message);
      return;
    }
    avisar('sucesso', 'Obrigação excluída.');
    aoSalvo();
  }

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo={regra ? 'Editar obrigação fixa' : 'Nova obrigação fixa'}
        largura="lg"
        rodape={
          <div className="flex w-full items-center justify-between gap-2">
            {regra ? (
              <Botao variante="fantasma" className="text-erro hover:bg-erro-suave" onClick={() => setConfirmarExclusao(true)} disabled={salvando}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Botao>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao type="submit" form="form-regra" carregando={salvando}>
                Salvar
              </Botao>
            </div>
          </div>
        }
      >
        <form id="form-regra" onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo rotulo="Nome" required maxLength={140} value={rascunho.nome} onChange={(e) => mudar({ nome: e.target.value })} autoFocus={!regra} />
          </div>
          <Selecao
            rotulo="Departamento"
            value={rascunho.departamento}
            disabled={deptosPermitidos.length < 2}
            onChange={(e) => mudar({ departamento: e.target.value as Departamento })}
          >
            {deptosPermitidos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Selecao>
          <Selecao rotulo="Esfera" value={rascunho.categoria} onChange={(e) => mudar({ categoria: e.target.value as CategoriaCalendario })}>
            {CATEGORIAS.filter((c) => c !== 'Feriado').map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Selecao>
          <div className="sm:col-span-2">
            <SeletorResponsavel
              key={regra?.id ?? 'nova'}
              pessoas={pessoas}
              departamento={rascunho.departamento}
              id={rascunho.responsavel_id}
              nome={rascunho.responsavel_nome}
              aoMudar={(id, nome) => mudar({ responsavel_id: id, responsavel_nome: nome })}
            />
          </div>
          <Selecao rotulo="Regime" value={rascunho.regime} onChange={(e) => mudar({ regime: e.target.value })}>
            {REGIMES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Selecao>
          <Selecao rotulo="Tipo de vencimento" value={rascunho.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoVencimento })}>
            <option value="dia">Dia fixo do mês</option>
            <option value="diaUtil">Enésimo dia útil</option>
            <option value="ultimoDiaUtil">Último dia útil</option>
          </Selecao>
          {rascunho.tipo !== 'ultimoDiaUtil' && (
            <Campo
              rotulo={rascunho.tipo === 'diaUtil' ? 'Qual dia útil' : 'Dia'}
              type="number"
              min={1}
              max={31}
              value={rascunho.dia}
              onChange={(e) => mudar({ dia: Number(e.target.value) })}
            />
          )}
          {rascunho.tipo === 'dia' && (
            <Selecao rotulo="Se cair em dia não útil" value={rascunho.ajuste} onChange={(e) => mudar({ ajuste: e.target.value as AjusteVencimento })}>
              <option value="antecipa">Antecipa para o dia útil anterior</option>
              <option value="prorroga">Prorroga para o próximo dia útil</option>
              <option value="nenhum">Mantém a data</option>
            </Selecao>
          )}
          {rascunho.tipo === 'diaUtil' && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-texto">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-borda-forte text-marca-600"
                checked={rascunho.sabado_util}
                onChange={(e) => mudar({ sabado_util: e.target.checked })}
              />
              Sábado conta como dia útil (CLT)
            </label>
          )}

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-texto-suave">Meses em que vence</span>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {MESES.map((n, i) => {
                const marcado = rascunho.meses.includes(i + 1);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => mudar({ meses: marcado ? rascunho.meses.filter((m) => m !== i + 1) : [...rascunho.meses, i + 1] })}
                    className={cn(
                      'rounded-md px-1 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
                      marcado ? 'bg-marca-600 text-white ring-marca-600' : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
                    )}
                    aria-pressed={marcado}
                  >
                    {n.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-texto-fraco">Nenhum marcado = todo mês.</p>
          </div>

          <div className="sm:col-span-2">
            <Selecao rotulo="Competência de referência" value={rascunho.ref} onChange={(e) => mudar({ ref: e.target.value as ReferenciaCompetencia })}>
              {Object.entries(REFERENCIAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="sm:col-span-2">
            <AreaTexto rotulo="Observações" maxLength={2000} value={rascunho.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-texto sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-borda-forte text-marca-600"
              checked={rascunho.ativo}
              onChange={(e) => mudar({ ativo: e.target.checked })}
            />
            Ativa no calendário
          </label>

          <div className="rounded-xl bg-superficie px-4 py-3 text-sm sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-texto-fraco">Próximos vencimentos</p>
            {proximas.length === 0 ? (
              <p className="text-texto-suave">Nenhum vencimento nos próximos 24 meses com essa configuração.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {proximas.map((p) => (
                  <li key={p.data} className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-inset ring-borda">
                    <strong className="tabular-nums text-texto">{br(p.data)}</strong>
                    {p.ref && <span className="ml-1.5 text-xs text-texto-suave">{p.ref}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro sm:col-span-2">{erro}</p>}
        </form>
      </Modal>

      <ModalConfirmacao
        aberto={confirmarExclusao}
        aoFechar={() => setConfirmarExclusao(false)}
        aoConfirmar={() => void excluir()}
        titulo="Excluir obrigação fixa"
        mensagem={
          <>
            <strong>{regra?.nome}</strong> deixa de aparecer em todos os meses. Se for só uma pausa, prefira desligar a chave &quot;Ativa&quot;.
          </>
        }
        rotuloConfirmar="Excluir"
        carregando={salvando}
      />
    </>
  );
}
