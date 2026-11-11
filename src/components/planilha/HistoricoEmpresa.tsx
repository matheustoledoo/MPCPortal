'use client';

import { useCallback, useEffect, useState } from 'react';

import { ArrowRight, Bot, FileText, History, Plus, Trash2 } from 'lucide-react';

import { BotaoAnexar, ListaAnexos } from '@/components/arquivos/Anexos';
import { AreaTexto, Botao, Campo, Carregando, Selo, cn, useAvisos } from '@/components/ui';
import { CampoOpcoes } from '@/components/ui/CampoOpcoes';
import { apagarArquivo } from '@/lib/arquivos';
import { hojeIso } from '@/lib/atribuicoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AnexoArquivo, DocumentoEmpresa, MovimentacaoEmpresa } from '@/types/banco';

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const CATEGORIAS_DOCUMENTO = ['Contrato social', 'Alteração contratual', 'Distrato', 'Procuração', 'Licença / alvará', 'Termo de saída', 'Comprovante', 'Outro'];

/**
 * Linha do tempo da empresa e os documentos dela.
 *
 * O histórico é permanente: o banco não aceita alterar nem apagar uma
 * movimentação (não há política de UPDATE/DELETE e o gatilho recusa). Mudar o
 * cadastro atual gera uma movimentação NOVA — nunca sobrescreve as antigas.
 */
export function HistoricoEmpresa({
  empresaId,
  modo,
  podeEditar,
  podeOpcoes,
  souAdmin,
  meuId,
}: {
  empresaId: string;
  modo: 'historico' | 'documentos';
  podeEditar: boolean;
  podeOpcoes: boolean;
  souAdmin: boolean;
  meuId: string;
}) {
  const { avisar } = useAvisos();
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEmpresa[] | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoEmpresa[] | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState<string | null>(null);
  const [data, setData] = useState(hojeIso());
  const [descricao, setDescricao] = useState('');
  const [anterior, setAnterior] = useState('');
  const [nova, setNova] = useState('');
  const [anexos, setAnexos] = useState<AnexoArquivo[]>([]);
  const [categoria, setCategoria] = useState('');

  const carregar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const [{ data: m, error }, { data: d }] = await Promise.all([
      supabase.from('empresa_movimentacoes').select('*').eq('empresa_id', empresaId).order('data_ocorrencia', { ascending: false }).order('registrado_em', { ascending: false }),
      supabase.from('empresa_documentos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    ]);
    if (error) avisar('erro', `Não foi possível carregar o histórico: ${error.message}`);
    setMovimentacoes((m ?? []) as MovimentacaoEmpresa[]);
    setDocumentos((d ?? []) as DocumentoEmpresa[]);
  }, [empresaId, avisar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function registrar() {
    if (!tipo) return avisar('alerta', 'Escolha o tipo da movimentação.');
    if (!data) return avisar('alerta', 'Informe a data em que a movimentação ocorreu.');
    if (data > hojeIso()) return avisar('alerta', 'A data da ocorrência não pode ser futura.');
    if (!descricao.trim()) return avisar('alerta', 'Descreva o que mudou.');
    setSalvando(true);
    const supabase = criarClienteNavegador();
    const { data: criada, error } = await supabase
      .from('empresa_movimentacoes')
      .insert({ empresa_id: empresaId, tipo, data_ocorrencia: data, descricao: descricao.trim(), situacao_anterior: anterior.trim() || null, nova_situacao: nova.trim() || null, anexos })
      .select('id')
      .single();
    if (error || !criada) {
      setSalvando(false);
      return avisar('erro', `Não foi possível registrar: ${error?.message ?? ''}`);
    }
    // Os arquivos da movimentação também entram na lista de documentos da empresa.
    if (anexos.length) {
      await supabase.from('empresa_documentos').insert(
        anexos.map((a) => ({ empresa_id: empresaId, movimentacao_id: (criada as { id: string }).id, nome: a.nome, caminho: a.caminho, tipo: a.tipo, tamanho: a.tamanho, categoria: tipo, enviado_por: meuId })),
      );
    }
    setSalvando(false);
    setRegistrando(false);
    setTipo(null);
    setDescricao('');
    setAnterior('');
    setNova('');
    setAnexos([]);
    setData(hojeIso());
    avisar('sucesso', 'Movimentação registrada no histórico da empresa.');
    void carregar();
  }

  async function enviarDocumentos(novos: AnexoArquivo[]) {
    const { error } = await criarClienteNavegador()
      .from('empresa_documentos')
      .insert(novos.map((a) => ({ empresa_id: empresaId, nome: a.nome, caminho: a.caminho, tipo: a.tipo, tamanho: a.tamanho, categoria: categoria.trim() || null, enviado_por: meuId })));
    if (error) return avisar('erro', `Não foi possível registrar o documento: ${error.message}`);
    setCategoria('');
    avisar('sucesso', `${novos.length} documento(s) anexado(s).`);
    void carregar();
  }

  async function removerDocumento(doc: DocumentoEmpresa) {
    const supabase = criarClienteNavegador();
    const { error } = await supabase.from('empresa_documentos').delete().eq('id', doc.id);
    if (error) return avisar('erro', 'Só quem enviou o documento (ou um administrador) pode removê-lo.');
    // Arquivo citado numa movimentação continua guardado: o histórico não perde o anexo.
    if (!doc.movimentacao_id) await apagarArquivo(supabase, doc.caminho);
    void carregar();
  }

  if (!movimentacoes || !documentos) return <Carregando texto="Carregando…" />;

  if (modo === 'documentos') {
    return (
      <div className="space-y-4">
        {podeEditar && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-superficie p-3">
            <div className="min-w-[180px] flex-1">
              <Campo rotulo="Categoria (opcional)" value={categoria} list="categorias-documento" maxLength={60} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Alteração contratual" />
              <datalist id="categorias-documento">{CATEGORIAS_DOCUMENTO.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <BotaoAnexar pasta="empresas" donoId={empresaId} rotulo="Anexar documento" aoEnviar={enviarDocumentos} />
          </div>
        )}
        {documentos.length === 0 ? (
          <p className="py-8 text-center text-sm text-texto-suave">Nenhum documento anexado a esta empresa.</p>
        ) : (
          <ul className="space-y-2">
            {documentos.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-borda bg-white p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ListaAnexos anexos={[{ caminho: doc.caminho, nome: doc.nome, tipo: doc.tipo, tamanho: doc.tamanho }]} compacto />
                  {(souAdmin || (podeEditar && doc.enviado_por === meuId)) && (
                    <button onClick={() => void removerDocumento(doc)} className="rounded p-1.5 text-texto-fraco hover:bg-erro-suave hover:text-erro" aria-label={`Remover ${doc.nome}`} title="Remover documento"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-texto-fraco">
                  {doc.categoria && <Selo tom="neutro" className="text-[10px]">{doc.categoria}</Selo>}
                  {doc.movimentacao_id && <Selo tom="marca" className="text-[10px]">Ligado a uma movimentação</Selo>}
                  <span>{doc.enviado_por_nome ?? '—'} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {podeEditar &&
        (registrando ? (
          <div className="space-y-3 rounded-xl border border-marca-100 bg-marca-50/40 p-3.5">
            <p className="text-sm font-semibold text-texto">Registrar movimentação</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoOpcoes grupo="movimentacao_tipo" rotulo="Tipo *" valor={tipo} aoMudar={setTipo} podeGerenciar={podeOpcoes} />
              <Campo rotulo="Data da ocorrência *" type="date" value={data} max={hojeIso()} onChange={(e) => setData(e.target.value)} />
              <Campo rotulo="Situação anterior" value={anterior} maxLength={300} onChange={(e) => setAnterior(e.target.value)} placeholder="Como era" />
              <Campo rotulo="Nova situação" value={nova} maxLength={300} onChange={(e) => setNova(e.target.value)} placeholder="Como ficou" />
            </div>
            <AreaTexto rotulo="Descrição *" rows={3} value={descricao} maxLength={4000} onChange={(e) => setDescricao(e.target.value)} placeholder="O que mudou e por quê. Ex.: 3ª alteração contratual — inclusão do sócio…" />
            <div className="flex flex-wrap items-center gap-2">
              <BotaoAnexar pasta="empresas" donoId={empresaId} rotulo="Anexar documento" aoEnviar={(n) => setAnexos((l) => [...l, ...n])} />
              <ListaAnexos anexos={anexos} compacto aoRemover={(a) => { setAnexos((l) => l.filter((x) => x.caminho !== a.caminho)); void apagarArquivo(criarClienteNavegador(), a.caminho); }} />
            </div>
            <p className="text-[11px] leading-relaxed text-texto-fraco">Depois de registrada, a movimentação não pode ser editada nem apagada. Para corrigir, registre uma nova.</p>
            <div className="flex justify-end gap-2">
              <Botao variante="secundario" tamanho="sm" onClick={() => setRegistrando(false)} disabled={salvando}>Cancelar</Botao>
              <Botao tamanho="sm" onClick={() => void registrar()} carregando={salvando}>Registrar no histórico</Botao>
            </div>
          </div>
        ) : (
          <Botao variante="secundario" tamanho="sm" onClick={() => setRegistrando(true)}><Plus className="h-4 w-4" /> Registrar movimentação</Botao>
        ))}

      {movimentacoes.length === 0 ? (
        <p className="py-8 text-center text-sm text-texto-suave">Nenhuma movimentação registrada.</p>
      ) : (
        <ol className="space-y-4 border-l-2 border-borda pl-5">
          {movimentacoes.map((m) => (
            <li key={m.id} className="relative">
              <span className={cn('absolute -left-[29px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ring-4 ring-white', m.automatica ? 'bg-slate-300 text-white' : 'bg-marca-600 text-white')}>
                {m.automatica ? <Bot className="h-3 w-3" /> : <History className="h-3 w-3" />}
              </span>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <strong className="font-semibold text-texto">{m.tipo}</strong>
                <span className="tabular-nums text-texto-suave">{dataBr(m.data_ocorrencia)}</span>
                {m.automatica && <Selo tom="neutro" className="text-[10px]" >Registro automático</Selo>}
              </p>
              {(m.situacao_anterior || m.nova_situacao) && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-superficie px-1.5 py-0.5 text-texto-suave ring-1 ring-borda">{m.situacao_anterior || '—'}</span>
                  <ArrowRight className="h-3 w-3 text-texto-fraco" />
                  <span className="rounded bg-marca-50 px-1.5 py-0.5 font-medium text-marca-800 ring-1 ring-marca-100">{m.nova_situacao || '—'}</span>
                </p>
              )}
              {m.descricao && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-texto-suave">{m.descricao}</p>}
              {m.anexos?.length > 0 && <ListaAnexos anexos={m.anexos} compacto className="mt-2" />}
              <p className="mt-1 flex items-center gap-1 text-[11px] text-texto-fraco">
                <FileText className="h-3 w-3" /> Registrado por {m.registrado_por_nome ?? 'sistema'} em {new Date(m.registrado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
