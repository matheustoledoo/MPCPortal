'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Eye, History, Pencil, Printer, RotateCcw, Star, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';

import { ListaAnexos } from '@/components/arquivos/Anexos';
import { BlocosConteudo, useUrlsDeMidia } from '@/components/conhecimento/Blocos';
import { AreaTexto, Botao, Cartao, Modal, ModalConfirmacao, Selo, cn, useAvisos } from '@/components/ui';
import { caminhoCategoria, dataHora, rotuloTipo } from '@/lib/conhecimento';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { ArtigoConhecimento, CategoriaConhecimento, VersaoConhecimento } from '@/types/banco';

export function VisualizadorArtigo({
  meuId,
  podeEditar,
  podeExcluir,
  artigo,
  categorias,
  favoritoInicial,
  avaliacaoInicial,
  passosFeitosIniciais,
}: {
  meuId: string;
  podeEditar: boolean;
  podeExcluir: boolean;
  artigo: ArtigoConhecimento;
  categorias: CategoriaConhecimento[];
  favoritoInicial: boolean;
  avaliacaoInicial: { util: boolean; comentario: string | null } | null;
  passosFeitosIniciais: string[];
}) {
  const { avisar } = useAvisos();
  const router = useRouter();
  const [favorito, setFavorito] = useState(favoritoInicial);
  const [avaliacao, setAvaliacao] = useState(avaliacaoInicial);
  const [comentario, setComentario] = useState(avaliacaoInicial?.comentario ?? '');
  const [feitos, setFeitos] = useState(() => new Set(passosFeitosIniciais));
  const [versoes, setVersoes] = useState<VersaoConhecimento[] | null>(null);
  const [vendoVersao, setVendoVersao] = useState<VersaoConhecimento | null>(null);
  const [excluir, setExcluir] = useState(false);
  const urlsPassos = useUrlsDeMidia(artigo.passos.map((p) => p.caminho));

  // Conta a leitura uma vez por abertura da página.
  const contou = useRef(false);
  useEffect(() => {
    if (contou.current) return;
    contou.current = true;
    void criarClienteNavegador().rpc('conhecimento_registrar_leitura', { p_artigo: artigo.id });
  }, [artigo.id]);

  async function alternarFavorito() {
    const supabase = criarClienteNavegador();
    const era = favorito;
    setFavorito(!era);
    const { error } = era
      ? await supabase.from('conhecimento_favoritos').delete().eq('artigo_id', artigo.id).eq('usuario_id', meuId)
      : await supabase.from('conhecimento_favoritos').insert({ artigo_id: artigo.id, usuario_id: meuId });
    if (error) {
      setFavorito(era);
      avisar('erro', error.message);
    }
  }

  async function avaliar(util: boolean, texto = comentario) {
    const { error } = await criarClienteNavegador()
      .from('conhecimento_avaliacoes')
      .upsert({ artigo_id: artigo.id, usuario_id: meuId, util, comentario: texto.trim() || null }, { onConflict: 'usuario_id,artigo_id' });
    if (error) return avisar('erro', `Não foi possível registrar: ${error.message}`);
    setAvaliacao({ util, comentario: texto.trim() || null });
    avisar('sucesso', util ? 'Obrigado! Sua avaliação ajuda a equipe.' : 'Obrigado. Quem cuida do conteúdo vai ver seu retorno.');
  }

  async function alternarPasso(id: string) {
    const novo = new Set(feitos);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setFeitos(novo);
    const { error } = await criarClienteNavegador()
      .from('conhecimento_progresso')
      .upsert({ artigo_id: artigo.id, usuario_id: meuId, passos_feitos: Array.from(novo) }, { onConflict: 'usuario_id,artigo_id' });
    if (error) avisar('erro', `Não foi possível salvar seu progresso: ${error.message}`);
  }

  async function abrirVersoes() {
    const { data } = await criarClienteNavegador().from('conhecimento_versoes').select('*').eq('artigo_id', artigo.id).order('versao', { ascending: false });
    setVersoes((data ?? []) as VersaoConhecimento[]);
  }

  async function restaurar(v: VersaoConhecimento) {
    const r = v.retrato;
    const { error } = await criarClienteNavegador()
      .from('conhecimento_artigos')
      .update({ titulo: r.titulo ?? artigo.titulo, resumo: r.resumo ?? '', blocos: r.blocos ?? [], passos: r.passos ?? [], anexos: r.anexos ?? [], nota_alteracao: `Restaurada a versão ${v.versao}` })
      .eq('id', artigo.id);
    if (error) return avisar('erro', `Não foi possível restaurar: ${error.message}`);
    avisar('sucesso', `Versão ${v.versao} restaurada como uma nova versão.`);
    setVendoVersao(null);
    setVersoes(null);
    router.refresh();
  }

  async function apagar() {
    const { error } = await criarClienteNavegador().from('conhecimento_artigos').delete().eq('id', artigo.id);
    if (error) return avisar('erro', `Não foi possível excluir: ${error.message}`);
    avisar('sucesso', 'Conteúdo excluído.');
    router.push('/conhecimento');
    router.refresh();
  }

  const totalPassos = artigo.passos.length;
  const concluidos = artigo.passos.filter((p) => feitos.has(p.id)).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-7">
      <div className="sem-impressao mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/conhecimento" className="inline-flex items-center gap-1.5 text-sm font-medium text-texto-suave hover:text-texto"><ArrowLeft className="h-4 w-4" /> Central de conhecimento</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="secundario" tamanho="sm" onClick={() => void alternarFavorito()} aria-pressed={favorito}>
            <Star className={cn('h-4 w-4', favorito && 'text-amber-500')} fill={favorito ? 'currentColor' : 'none'} /> {favorito ? 'Favorito' : 'Favoritar'}
          </Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => void abrirVersoes()}><History className="h-4 w-4" /> Versões</Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Botao>
          {podeEditar && <Link href={`/conhecimento/${artigo.id}/editar`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-marca-700 px-3 text-xs font-medium text-white hover:bg-marca-800"><Pencil className="h-3.5 w-3.5" /> Editar</Link>}
          {podeExcluir && <Botao variante="fantasma" tamanho="sm" className="text-erro hover:bg-erro-suave hover:text-erro" onClick={() => setExcluir(true)}><Trash2 className="h-4 w-4" /></Botao>}
        </div>
      </div>

      <Cartao className="p-6 sm:p-8">
        <div className="flex flex-wrap gap-1.5">
          <Selo tom="marca">{rotuloTipo(artigo.tipo)}</Selo>
          <Selo tom="neutro">{caminhoCategoria(artigo.categoria_id, categorias)}</Selo>
          {artigo.departamento && <Selo tom="neutro">{artigo.departamento}</Selo>}
          {!artigo.publicado && <Selo tom="info">Rascunho — só os editores veem</Selo>}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-texto">{artigo.titulo}</h1>
        {artigo.resumo && <p className="mt-2 text-base leading-relaxed text-texto-suave">{artigo.resumo}</p>}
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-borda py-2.5 text-xs text-texto-suave">
          <span>Autor: <strong className="font-medium text-texto">{artigo.criado_por_nome ?? '—'}</strong></span>
          <span>Atualizado em <strong className="font-medium text-texto">{dataHora(artigo.updated_at)}</strong>{artigo.atualizado_por_nome && artigo.atualizado_por_nome !== artigo.criado_por_nome ? ` por ${artigo.atualizado_por_nome}` : ''}</span>
          <span>Versão {artigo.versao}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {artigo.visualizacoes}</span>
          {artigo.atividade && <span>Atividade: {artigo.atividade}</span>}
        </p>

        {artigo.blocos.length > 0 && <div className="mt-6"><BlocosConteudo blocos={artigo.blocos} /></div>}

        {totalPassos > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-texto">Passo a passo</h2>
              <div className="flex items-center gap-3 text-xs text-texto-suave">
                <span className="tabular-nums">{concluidos} de {totalPassos} concluído(s)</span>
                {concluidos > 0 && (
                  <button onClick={() => { setFeitos(new Set()); void criarClienteNavegador().from('conhecimento_progresso').upsert({ artigo_id: artigo.id, usuario_id: meuId, passos_feitos: [] }, { onConflict: 'usuario_id,artigo_id' }); }} className="sem-impressao inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"><RotateCcw className="h-3 w-3" /> Recomeçar</button>
                )}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sucesso transition-all" style={{ width: `${(concluidos / totalPassos) * 100}%` }} /></div>
            <ol className="mt-4 space-y-3">
              {artigo.passos.map((p, i) => {
                const feito = feitos.has(p.id);
                const url = p.caminho ? urlsPassos[p.caminho] : undefined;
                return (
                  <li key={p.id} className={cn('rounded-xl border p-4 transition-colors', p.importante ? 'border-amber-300 bg-alerta-suave/60' : 'border-borda bg-white', feito && 'opacity-70')}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => void alternarPasso(p.id)}
                        role="checkbox"
                        aria-checked={feito}
                        aria-label={`Etapa ${i + 1}: ${p.titulo}`}
                        className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors', feito ? 'border-sucesso bg-sucesso text-white' : 'border-borda-forte bg-white text-texto-suave hover:border-marca-400')}
                      >
                        {feito ? <Check className="h-4 w-4" /> : i + 1}
                      </button>
                      <div className="min-w-0 flex-1">
                        <h3 className={cn('text-sm font-semibold text-texto', feito && 'line-through')}>
                          {p.titulo}
                          {p.importante && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-alerta no-underline"><AlertTriangle className="h-3 w-3" /> Etapa importante</span>}
                        </h3>
                        {p.descricao && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-texto-suave">{p.descricao}</p>}
                        {p.caminho && (url ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Ilustração da etapa ${i + 1}`} className="mt-3 max-h-80 rounded-lg border border-borda" loading="lazy" /></a> : <div className="mt-3 h-40 animate-pulse rounded-lg bg-slate-100" />)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {concluidos === totalPassos && <p className="mt-3 rounded-lg bg-sucesso-suave px-3 py-2 text-sm font-medium text-sucesso">Procedimento concluído. O progresso é só seu — cada pessoa tem o próprio checklist.</p>}
          </section>
        )}

        {artigo.anexos.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-texto">Arquivos</h2>
            <ListaAnexos anexos={artigo.anexos} />
          </section>
        )}

        {artigo.palavras_chave.length > 0 && (
          <p className="mt-8 flex flex-wrap gap-1.5">{artigo.palavras_chave.map((p) => <span key={p} className="rounded-full bg-superficie px-2.5 py-1 text-[11px] text-texto-suave ring-1 ring-borda">#{p}</span>)}</p>
        )}
      </Cartao>

      <Cartao className="sem-impressao mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-texto">Este conteúdo foi útil?</h2>
            <p className="text-xs text-texto-suave">{artigo.uteis} pessoa(s) marcaram como útil{artigo.nao_uteis ? ` · ${artigo.nao_uteis} pediram melhorias` : ''}.</p>
          </div>
          <div className="flex gap-2">
            <Botao variante={avaliacao?.util === true ? 'primario' : 'secundario'} tamanho="sm" onClick={() => void avaliar(true)} aria-pressed={avaliacao?.util === true}><ThumbsUp className="h-4 w-4" /> Sim, ajudou</Botao>
            <Botao variante={avaliacao?.util === false ? 'primario' : 'secundario'} tamanho="sm" onClick={() => void avaliar(false)} aria-pressed={avaliacao?.util === false}><ThumbsDown className="h-4 w-4" /> Precisa melhorar</Botao>
          </div>
        </div>
        {avaliacao && (
          <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void avaliar(avaliacao.util); }}>
            <AreaTexto rows={2} value={comentario} maxLength={1000} onChange={(e) => setComentario(e.target.value)} placeholder={avaliacao.util ? 'Quer deixar um comentário? (opcional)' : 'O que faltou ou está desatualizado?'} aria-label="Comentário da avaliação" />
            <Botao type="submit" variante="secundario" className="shrink-0" disabled={(comentario.trim() || null) === avaliacao.comentario}>Enviar</Botao>
          </form>
        )}
      </Cartao>

      <Modal aberto={Boolean(versoes)} aoFechar={() => setVersoes(null)} titulo="Histórico de versões" descricao="Cada alteração de conteúdo gera uma versão. As anteriores ficam guardadas." largura="md" rodape={<Botao onClick={() => setVersoes(null)}>Fechar</Botao>}>
        <ul className="divide-y divide-borda">
          {(versoes ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-texto">Versão {v.versao} {v.versao === artigo.versao && <Selo tom="sucesso" className="ml-1 text-[10px]">Atual</Selo>}</p>
                <p className="truncate text-xs text-texto-suave">{dataHora(v.created_at)} · {v.autor_nome ?? '—'}{v.nota ? ` · ${v.nota}` : ''}</p>
              </div>
              {v.versao !== artigo.versao && <Botao variante="secundario" tamanho="sm" onClick={() => setVendoVersao(v)}>Ver</Botao>}
            </li>
          ))}
          {versoes?.length === 0 && <li className="py-6 text-center text-sm text-texto-fraco">Sem versões registradas.</li>}
        </ul>
      </Modal>

      <Modal
        aberto={Boolean(vendoVersao)}
        aoFechar={() => setVendoVersao(null)}
        titulo={vendoVersao ? `Versão ${vendoVersao.versao} — ${vendoVersao.titulo}` : ''}
        descricao={vendoVersao ? `${dataHora(vendoVersao.created_at)} · ${vendoVersao.autor_nome ?? '—'}` : undefined}
        largura="lg"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setVendoVersao(null)}>Fechar</Botao>
            {podeEditar && vendoVersao && <Botao onClick={() => void restaurar(vendoVersao)}><RotateCcw className="h-4 w-4" /> Restaurar esta versão</Botao>}
          </>
        }
      >
        {vendoVersao && (
          <div className="space-y-4">
            {vendoVersao.retrato.resumo && <p className="text-sm text-texto-suave">{vendoVersao.retrato.resumo}</p>}
            <BlocosConteudo blocos={vendoVersao.retrato.blocos ?? []} />
            {(vendoVersao.retrato.passos ?? []).length > 0 && (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-texto">
                {(vendoVersao.retrato.passos ?? []).map((p) => <li key={p.id}><strong className="font-medium">{p.titulo}</strong>{p.descricao ? ` — ${p.descricao}` : ''}</li>)}
              </ol>
            )}
          </div>
        )}
      </Modal>

      <ModalConfirmacao aberto={excluir} aoFechar={() => setExcluir(false)} aoConfirmar={() => void apagar()} titulo="Excluir este conteúdo?" mensagem="O conteúdo, as versões, os favoritos e as avaliações são removidos para toda a equipe. Para apenas tirar do ar, edite e desmarque “Publicado”." rotuloConfirmar="Excluir conteúdo" />
    </div>
  );
}
