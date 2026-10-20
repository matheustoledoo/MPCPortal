'use client';

import { useMemo, useState } from 'react';

import { CheckCircle2, FileUp, Loader2, TriangleAlert, XCircle } from 'lucide-react';

import { Botao, Modal, Selecao, cn } from '@/components/ui';
import { lerArquivo } from '@/lib/planilha/importacao';
import {
  PAPEL_ANTIGO,
  conclusoesAntigas,
  criarResolvedorDeNomes,
  eventosAntigos,
  integracoesAntigas,
  lerExportacao,
  lerJson,
  regrasAntigas,
  sugerirEmail,
  usuariosAntigos,
  type Colecoes,
  type PessoaConhecida,
  type UsuarioAntigo,
} from '@/lib/portal-antigo';
import { rotuloArea } from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Perfil } from '@/types/banco';

type Etapa = 'arquivo' | 'revisar' | 'executando' | 'fim';
type Destino = 'criar' | 'ignorar' | `ligar:${string}`;

interface Pessoa extends UsuarioAntigo {
  destino: Destino;
  email: string;
}

interface Passo {
  rotulo: string;
  estado: 'esperando' | 'rodando' | 'ok' | 'aviso' | 'erro';
  detalhe?: string;
}

const LOTE = 200;

/** Senha provisória aleatória: a conta nasce sem permissão e o admin redefine ao liberar. */
function senhaProvisoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `Mpc-${Array.from(bytes, (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('')}`;
}

/**
 * Traz o "Portal Meta Plano" (Apps Script) para o PortalMPC a partir da
 * exportação da aba `dados` da planilha "Calendário Contábil - Dados":
 *
 * - cada pessoa vira usuário colaborador SEM NENHUMA permissão (o admin
 *   libera depois, em Usuários e permissões);
 * - obrigações fixas, compromissos/demandas, conclusões e integrações vão
 *   para as tabelas do calendário e da integração, com os mesmos ids — dá
 *   para rodar de novo sem duplicar.
 */
export function ImportadorPortalAntigo({
  aberto,
  aoFechar,
  usuarios,
  aoCriarUsuarios,
}: {
  aberto: boolean;
  aoFechar: () => void;
  usuarios: Perfil[];
  aoCriarUsuarios: () => void;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const [arquivo, setArquivo] = useState('');
  const [colecoes, setColecoes] = useState<Colecoes | null>(null);
  const [invalidas, setInvalidas] = useState(0);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [incluirCalendario, setIncluirCalendario] = useState(true);
  const [incluirIntegracoes, setIncluirIntegracoes] = useState(true);
  const [passos, setPassos] = useState<Passo[]>([]);

  function reiniciar() {
    setEtapa('arquivo');
    setErro('');
    setColecoes(null);
    setPessoas([]);
    setPassos([]);
    setArquivo('');
  }

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    setErro('');
    setLendo(true);
    try {
      const leitura = /\.json$/i.test(f.name) ? lerJson(await f.text()) : lerExportacao(await lerArquivo(f));
      if (!leitura) {
        setErro('Não encontrei a aba "dados" do Portal Meta Plano neste arquivo (colunas: coleção | id | dados (JSON) | atualizado em).');
        return;
      }
      setArquivo(f.name);
      setColecoes(leitura.colecoes);
      setInvalidas(leitura.invalidas);

      // Cada pessoa: liga a quem já existe no portal (mesmo nome) ou cria.
      const resolver = criarResolvedorDeNomes(usuarios.map((u) => ({ id: u.id, nome: u.nome })));
      const usados = new Set(usuarios.map((u) => u.email.toLowerCase()));
      setPessoas(
        usuariosAntigos(leitura.colecoes).map((u) => {
          const existente = resolver(u.nome);
          return { ...u, destino: existente ? (`ligar:${existente}` as const) : 'criar', email: existente ? '' : sugerirEmail(u.nome, usados) };
        }),
      );
      setEtapa('revisar');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  }

  const contagem = colecoes
    ? {
        regras: Object.keys(colecoes.regras ?? {}).length,
        eventos: Object.keys(colecoes.eventos ?? {}).length,
        conclusoes: conclusoesAntigas(colecoes, () => null).length,
        integracoes: Object.keys(colecoes.integracoes ?? {}).length,
      }
    : null;

  function mudarPessoa(i: number, parcial: Partial<Pessoa>) {
    setPessoas((lista) => lista.map((p, j) => (j === i ? { ...p, ...parcial } : p)));
  }

  async function importar() {
    if (!colecoes) return;
    const lista: Passo[] = [
      { rotulo: 'Usuários (sem permissões)', estado: 'esperando' },
      ...(incluirCalendario
        ? ([
            { rotulo: 'Obrigações fixas', estado: 'esperando' },
            { rotulo: 'Compromissos, demandas e reuniões', estado: 'esperando' },
            { rotulo: 'Itens concluídos', estado: 'esperando' },
          ] as Passo[])
        : []),
      ...(incluirIntegracoes ? ([{ rotulo: 'Integrações de clientes', estado: 'esperando' }] as Passo[]) : []),
    ];
    setPassos(lista);
    setEtapa('executando');
    const marcar = (rotulo: string, estado: Passo['estado'], detalhe?: string) =>
      setPassos((ps) => ps.map((p) => (p.rotulo === rotulo ? { ...p, estado, detalhe } : p)));

    // 1. Pessoas
    const conhecidas: PessoaConhecida[] = usuarios.map((u) => ({ id: u.id, nome: u.nome }));
    const rotuloUsuarios = 'Usuários (sem permissões)';
    marcar(rotuloUsuarios, 'rodando');
    let criados = 0;
    const falhas: string[] = [];
    for (const p of pessoas) {
      if (p.destino === 'ignorar') continue;
      if (p.destino.startsWith('ligar:')) {
        const id = p.destino.slice(6);
        // O nome antigo passa a apontar para o perfil escolhido.
        conhecidas.push({ id, nome: p.nome });
        continue;
      }
      const resposta = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: p.nome.length >= 3 ? p.nome : `${p.nome} (Meta Plano)`, email: p.email, senha: senhaProvisoria(), area: p.area, role: 'colaborador', permissoes: [] }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { id?: string; erro?: string };
      if (resposta.ok && corpo.id) {
        criados++;
        conhecidas.push({ id: corpo.id, nome: p.nome });
      } else {
        falhas.push(`${p.nome}: ${corpo.erro ?? `erro ${resposta.status}`}`);
        if (resposta.status === 503) break; // sem a chave de serviço, nenhuma conta sai
      }
    }
    marcar(
      rotuloUsuarios,
      falhas.length ? (criados ? 'aviso' : 'erro') : 'ok',
      [`${criados} conta(s) criada(s)`, falhas.length ? `falharam: ${falhas.join(' · ')}` : ''].filter(Boolean).join('. '),
    );
    if (criados) aoCriarUsuarios();

    const resolver = criarResolvedorDeNomes(conhecidas);
    const gravar = async (rotulo: string, tabela: string, linhas: Record<string, unknown>[], onConflict: string, ignorar = false) => {
      marcar(rotulo, 'rodando');
      let ok = 0;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + LOTE), { onConflict, ignoreDuplicates: ignorar });
        if (error) {
          marcar(rotulo, ok ? 'aviso' : 'erro', `${ok} de ${linhas.length} gravado(s). Erro: ${error.message}`);
          return false;
        }
        ok += Math.min(LOTE, linhas.length - i);
      }
      marcar(rotulo, 'ok', `${ok} registro(s)`);
      return true;
    };

    // 2. Calendário
    const eventosNoBanco = new Set<string>();
    if (incluirCalendario) {
      await gravar('Obrigações fixas', 'calendario_regras', regrasAntigas(colecoes, resolver), 'id');
      const eventos = eventosAntigos(colecoes, resolver);
      if (await gravar('Compromissos, demandas e reuniões', 'calendario_eventos', eventos, 'id')) eventos.forEach((e) => eventosNoBanco.add(e.id));
      await gravar('Itens concluídos', 'calendario_conclusoes', conclusoesAntigas(colecoes, resolver), 'chave', true);
    }

    // 3. Integrações
    if (incluirIntegracoes) {
      if (!incluirCalendario) {
        const { data } = await supabase.from('calendario_eventos').select('id');
        (data ?? []).forEach((e) => eventosNoBanco.add(e.id as string));
      }
      const { integracoes, departamentos } = integracoesAntigas(colecoes, eventosNoBanco, resolver);
      const rotulo = 'Integrações de clientes';
      if (await gravar(rotulo, 'integracoes', integracoes, 'id')) {
        marcar(rotulo, 'rodando');
        const { error } = departamentos.length
          ? await supabase.from('integracao_departamentos').upsert(departamentos, { onConflict: 'integracao_id,departamento' })
          : { error: null };
        marcar(rotulo, error ? 'aviso' : 'ok', error ? `${integracoes.length} integração(ões), mas os roteiros falharam: ${error.message}` : `${integracoes.length} integração(ões), ${departamentos.length} roteiro(s)`);
      }
    }

    await supabase.rpc('registrar_evento_auditoria', {
      p_acao: 'IMPORT',
      p_tabela: 'calendario_eventos',
      p_registro_id: null,
      p_contexto: { origem: 'Portal Meta Plano (Apps Script)', arquivo, usuarios_criados: criados, calendario: incluirCalendario, integracoes: incluirIntegracoes },
      p_dados_novos: null,
    });
    setEtapa('fim');
  }

  const paraCriar = pessoas.filter((p) => p.destino === 'criar');
  const emailsRepetidos = new Set(paraCriar.map((p) => p.email.toLowerCase()).filter((e, i, a) => a.indexOf(e) !== i));
  const emailInvalido = paraCriar.some((p) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email) || emailsRepetidos.has(p.email.toLowerCase()));

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => {
        if (etapa === 'executando') return;
        reiniciar();
        aoFechar();
      }}
      titulo="Importar do Portal Meta Plano (app antigo)"
      descricao="Pessoas, obrigações fixas, compromissos, concluídos e integrações da aba “dados” da planilha “Calendário Contábil - Dados”."
      largura="xl"
      rodape={
        etapa === 'revisar' ? (
          <>
            <Botao variante="secundario" onClick={reiniciar}>
              Trocar arquivo
            </Botao>
            <Botao onClick={() => void importar()} disabled={emailInvalido}>
              Importar
            </Botao>
          </>
        ) : etapa === 'fim' ? (
          <Botao
            onClick={() => {
              reiniciar();
              aoFechar();
            }}
          >
            Concluir
          </Botao>
        ) : undefined
      }
    >
      {etapa === 'arquivo' && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-texto-suave">
            <li>Abra a planilha “Calendário Contábil - Dados” no Google Planilhas.</li>
            <li>
              Na aba <strong>dados</strong>, use Arquivo → Fazer download → Microsoft Excel (.xlsx) ou CSV.
            </li>
            <li>Escolha o arquivo aqui. Nada é gravado antes da revisão.</li>
          </ol>
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda-forte px-6 py-10 text-center transition-colors hover:border-marca-400 hover:bg-marca-50/40',
              lendo && 'pointer-events-none opacity-60',
            )}
          >
            {lendo ? <Loader2 className="h-7 w-7 animate-spin text-marca-600" /> : <FileUp className="h-7 w-7 text-marca-600" />}
            <span className="text-sm font-medium text-texto">{lendo ? 'Lendo…' : 'Escolher arquivo (.xlsx, .csv ou .json)'}</span>
            <span className="text-xs text-texto-fraco">O arquivo é lido no seu navegador.</span>
            <input type="file" accept=".xlsx,.xls,.ods,.csv,.json" className="sr-only" onChange={(e) => void escolherArquivo(e.target.files?.[0])} />
          </label>
          {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro">{erro}</p>}
        </div>
      )}

      {etapa === 'revisar' && contagem && (
        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-5">
            {(
              [
                ['Pessoas', pessoas.length],
                ['Obrigações fixas', contagem.regras],
                ['Compromissos', contagem.eventos],
                ['Concluídos', contagem.conclusoes],
                ['Integrações', contagem.integracoes],
              ] as const
            ).map(([r, n]) => (
              <div key={r} className="rounded-xl bg-superficie px-3 py-2.5">
                <p className="text-xl font-semibold tabular-nums text-texto">{n}</p>
                <p className="text-xs text-texto-suave">{r}</p>
              </div>
            ))}
          </div>
          {invalidas > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-alerta-suave px-3 py-2 text-sm text-alerta">
              <TriangleAlert className="h-4 w-4" /> {invalidas} linha(s) com JSON ilegível ficaram de fora.
            </p>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold text-texto">Pessoas</h3>
            <p className="mb-2 text-xs text-texto-suave">
              Contas novas entram como <strong>colaborador, sem nenhuma permissão</strong> e com senha provisória aleatória. Para liberar, marque as telas em Usuários e
              permissões e use “Redefinir senha”. O app antigo não tinha e-mail: confira a sugestão (dá para trocar depois).
            </p>
            {pessoas.length === 0 ? (
              <p className="rounded-lg bg-superficie px-3 py-2 text-sm text-texto-suave">A exportação não traz a coleção de usuários.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borda">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-superficie text-left text-[11px] uppercase tracking-wide text-texto-suave">
                    <tr>
                      <th className="px-3 py-2">Nome no app antigo</th>
                      <th className="px-3 py-2">Departamento → time</th>
                      <th className="px-3 py-2">Acesso antigo</th>
                      <th className="px-3 py-2">No portal</th>
                      <th className="px-3 py-2">E-mail de login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {pessoas.map((p, i) => (
                      <tr key={p.idAntigo}>
                        <td className="px-3 py-2 font-medium">{p.nome}</td>
                        <td className="px-3 py-2 text-texto-suave">
                          {p.departamento} → {rotuloArea(p.area)}
                        </td>
                        <td className="px-3 py-2 text-xs text-texto-suave">
                          {PAPEL_ANTIGO[p.papel] ?? p.papel}
                          {p.geral ? ' · acesso geral' : ''}
                        </td>
                        <td className="px-3 py-2">
                          <Selecao value={p.destino} onChange={(e) => mudarPessoa(i, { destino: e.target.value as Destino })} className="h-9 text-xs" aria-label={`Destino de ${p.nome}`}>
                            <option value="criar">Criar conta nova</option>
                            {usuarios.map((u) => (
                              <option key={u.id} value={`ligar:${u.id}`}>
                                É {u.nome}
                              </option>
                            ))}
                            <option value="ignorar">Não importar</option>
                          </Selecao>
                        </td>
                        <td className="px-3 py-2">
                          {p.destino === 'criar' ? (
                            <input
                              value={p.email}
                              onChange={(e) => mudarPessoa(i, { email: e.target.value.trim() })}
                              className={cn(
                                'h-9 w-full rounded-lg border bg-white px-2 text-xs',
                                !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email) || emailsRepetidos.has(p.email.toLowerCase()) ? 'border-erro' : 'border-borda-forte',
                              )}
                              aria-label={`E-mail de ${p.nome}`}
                            />
                          ) : (
                            <span className="text-xs text-texto-fraco">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600" checked={incluirCalendario} onChange={(e) => setIncluirCalendario(e.target.checked)} />
              <span>
                <strong>Calendário</strong> — obrigações fixas (substituem as de mesmo nome que vieram prontas, com os ajustes da equipe), compromissos, demandas, reuniões e
                o histórico de concluídos.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600" checked={incluirIntegracoes} onChange={(e) => setIncluirIntegracoes(e.target.checked)} />
              <span>
                <strong>Integrações de clientes</strong> — ficha e roteiro de cada departamento, inclusive os finalizados.
              </span>
            </label>
            <p className="text-xs text-texto-fraco">
              Os responsáveis são ligados às contas pelo nome. Compromissos já vencidos não geram notificação. Rodar de novo atualiza sem duplicar.
            </p>
          </section>
        </div>
      )}

      {(etapa === 'executando' || etapa === 'fim') && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {passos.map((p) => (
              <li key={p.rotulo} className="flex items-start gap-3 rounded-xl border border-borda px-3 py-2.5">
                {p.estado === 'rodando' ? (
                  <Loader2 className="mt-0.5 h-4.5 w-4.5 animate-spin text-marca-600" />
                ) : p.estado === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 text-sucesso" />
                ) : p.estado === 'aviso' ? (
                  <TriangleAlert className="mt-0.5 h-4.5 w-4.5 text-alerta" />
                ) : p.estado === 'erro' ? (
                  <XCircle className="mt-0.5 h-4.5 w-4.5 text-erro" />
                ) : (
                  <span className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-borda-forte" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-texto">{p.rotulo}</span>
                  {p.detalhe && <span className="block break-words text-xs text-texto-suave">{p.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>
          {etapa === 'fim' && (
            <p className="text-sm text-texto-suave">
              Importação encerrada. O que aparece com ✕ ou ⚠ não foi gravado por completo — corrija o motivo indicado e importe de novo (o que já entrou é atualizado, não
              duplicado).
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
