'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Heading2, ImageIcon, Link2, Megaphone, Pilcrow, Plus, Trash2, Video } from 'lucide-react';

import { BotaoAnexar, ListaAnexos } from '@/components/arquivos/Anexos';
import { AreaTexto, Botao, Campo, Cartao, CabecalhoCartao, Selecao, cn, useAvisos } from '@/components/ui';
import { DEPARTAMENTOS } from '@/lib/calendario';
import { TIPOS_CONTEUDO, linkSeguro, novoId } from '@/lib/conhecimento';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { ArtigoConhecimento, BlocoConteudo, CategoriaConhecimento, PassoProcedimento, TipoBloco } from '@/types/banco';

const BLOCOS: { tipo: TipoBloco; rotulo: string; icone: typeof Pilcrow }[] = [
  { tipo: 'texto', rotulo: 'Texto', icone: Pilcrow },
  { tipo: 'titulo', rotulo: 'Subtítulo', icone: Heading2 },
  { tipo: 'destaque', rotulo: 'Destaque', icone: Megaphone },
  { tipo: 'imagem', rotulo: 'Imagem', icone: ImageIcon },
  { tipo: 'video', rotulo: 'Vídeo', icone: Video },
  { tipo: 'link', rotulo: 'Link', icone: Link2 },
];

const IMAGENS = '.jpg,.jpeg,.png,.webp,.gif';
const VIDEOS = '.mp4,.webm';

function mover<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
  return copia;
}

/**
 * Editor de conteúdo. O artigo é montado em blocos (texto, subtítulo,
 * destaque, imagem, vídeo, link) e, nos procedimentos, em etapas com
 * checklist. Tudo é guardado como dado estruturado — nunca HTML —, o que
 * elimina o risco de script embutido em conteúdo da equipe.
 */
export function EditorArtigo({ artigo, categorias }: { artigo: ArtigoConhecimento | null; categorias: CategoriaConhecimento[] }) {
  const { avisar } = useAvisos();
  const router = useRouter();
  // O id nasce aqui para que as imagens já subam para a pasta do artigo.
  const [id] = useState(() => artigo?.id ?? crypto.randomUUID());
  const [titulo, setTitulo] = useState(artigo?.titulo ?? '');
  const [resumo, setResumo] = useState(artigo?.resumo ?? '');
  const [tipo, setTipo] = useState<ArtigoConhecimento['tipo']>(artigo?.tipo ?? 'procedimento');
  const [categoriaId, setCategoriaId] = useState(artigo?.categoria_id ?? '');
  const [departamento, setDepartamento] = useState(artigo?.departamento ?? '');
  const [atividade, setAtividade] = useState(artigo?.atividade ?? '');
  const [palavras, setPalavras] = useState((artigo?.palavras_chave ?? []).join(', '));
  const [blocos, setBlocos] = useState<BlocoConteudo[]>(artigo?.blocos ?? []);
  const [passos, setPassos] = useState<PassoProcedimento[]>(artigo?.passos ?? []);
  const [anexos, setAnexos] = useState(artigo?.anexos ?? []);
  const [publicado, setPublicado] = useState(artigo?.publicado ?? true);
  const [destaque, setDestaque] = useState(artigo?.destaque ?? false);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  const raizes = categorias.filter((c) => !c.pai_id);
  const mudarBloco = (bid: string, patch: Partial<BlocoConteudo>) => setBlocos((l) => l.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
  const mudarPasso = (pid: string, patch: Partial<PassoProcedimento>) => setPassos((l) => l.map((p) => (p.id === pid ? { ...p, ...patch } : p)));

  async function salvar() {
    if (!titulo.trim()) return avisar('alerta', 'Dê um título ao conteúdo.');
    const linkRuim = blocos.find((b) => (b.tipo === 'link' || (b.tipo === 'video' && !b.caminho)) && !linkSeguro(b.url));
    if (linkRuim) return avisar('alerta', 'Há um bloco de link ou vídeo sem endereço válido (use um link completo, com https://).');
    const blocosLimpos = blocos.filter((b) => (b.tipo === 'imagem' ? b.caminho : b.tipo === 'video' ? b.caminho || b.url : b.tipo === 'link' ? b.url : b.texto?.trim()));
    const passosLimpos = passos.filter((p) => p.titulo.trim()).map((p) => ({ ...p, titulo: p.titulo.trim() }));
    if (blocosLimpos.length === 0 && passosLimpos.length === 0 && anexos.length === 0) return avisar('alerta', 'Adicione algum conteúdo: um bloco, uma etapa ou um arquivo.');

    setSalvando(true);
    const dados = {
      titulo: titulo.trim(),
      resumo: resumo.trim(),
      tipo,
      categoria_id: categoriaId || null,
      departamento: departamento || null,
      atividade: atividade.trim() || null,
      palavras_chave: palavras.split(',').map((p) => p.trim()).filter(Boolean).slice(0, 20),
      blocos: blocosLimpos,
      passos: passosLimpos,
      anexos,
      publicado,
      destaque,
      nota_alteracao: nota.trim() || null,
    };
    const supabase = criarClienteNavegador();
    const { error } = artigo ? await supabase.from('conhecimento_artigos').update(dados).eq('id', id) : await supabase.from('conhecimento_artigos').insert({ id, ...dados });
    setSalvando(false);
    if (error) return avisar('erro', `Não foi possível salvar: ${error.message}`);
    avisar('sucesso', artigo ? 'Conteúdo atualizado. A versão anterior ficou guardada no histórico.' : publicado ? 'Conteúdo publicado para a equipe.' : 'Rascunho salvo.');
    router.push(`/conhecimento/${id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={artigo ? `/conhecimento/${artigo.id}` : '/conhecimento'} className="inline-flex items-center gap-1.5 text-sm font-medium text-texto-suave hover:text-texto"><ArrowLeft className="h-4 w-4" /> {artigo ? 'Voltar ao conteúdo' : 'Central de conhecimento'}</Link>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-texto">
            <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} className="h-4 w-4 accent-[var(--color-marca-600)]" /> Publicado
          </label>
          <Botao onClick={() => void salvar()} carregando={salvando}>{artigo ? 'Salvar nova versão' : publicado ? 'Publicar' : 'Salvar rascunho'}</Botao>
        </div>
      </div>

      <Cartao>
        <CabecalhoCartao titulo={artigo ? `Editar conteúdo · versão ${artigo.versao}` : 'Novo conteúdo'} descricao="Identificação e organização — é o que a busca e os filtros usam." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Campo rotulo="Título *" value={titulo} maxLength={200} autoFocus={!artigo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Como emitir a guia do DAS em atraso" /></div>
          <div className="sm:col-span-2"><AreaTexto rotulo="Resumo" rows={2} value={resumo} maxLength={500} onChange={(e) => setResumo(e.target.value)} placeholder="Em uma ou duas frases: para que serve e quando usar." /></div>
          <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as ArtigoConhecimento['tipo'])}>
            {TIPOS_CONTEUDO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo} — {t.descricao}</option>)}
          </Selecao>
          <Selecao rotulo="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {raizes.map((r) => (
              <optgroup key={r.id} label={r.nome}>
                <option value={r.id}>{r.nome}</option>
                {categorias.filter((c) => c.pai_id === r.id).map((f) => <option key={f.id} value={f.id}>{r.nome} › {f.nome}</option>)}
              </optgroup>
            ))}
          </Selecao>
          <Selecao rotulo="Departamento" value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
            <option value="">Todos / geral</option>
            {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Selecao>
          <Campo rotulo="Atividade" value={atividade} maxLength={120} onChange={(e) => setAtividade(e.target.value)} placeholder="Ex.: Fechamento mensal, Admissão…" />
          <div className="sm:col-span-2"><Campo rotulo="Palavras-chave" value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="Separadas por vírgula: das, simples nacional, atraso" dica="Ajudam a pesquisa a encontrar este conteúdo." /></div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-texto sm:col-span-2">
            <input type="checkbox" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} className="h-4 w-4 accent-[var(--color-marca-600)]" /> Mostrar em “Em destaque”
          </label>
        </div>
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Conteúdo" descricao="Monte a explicação em blocos, na ordem em que devem ser lidos." />
        <div className="space-y-3 p-5">
          {blocos.map((b, i) => {
            const def = BLOCOS.find((x) => x.tipo === b.tipo)!;
            const Icone = def.icone;
            return (
              <div key={b.id} className="rounded-xl border border-borda bg-superficie p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-suave"><Icone className="h-3.5 w-3.5" /> {def.rotulo}</span>
                  <span className="flex items-center gap-0.5">
                    <button onClick={() => setBlocos((l) => mover(l, i, -1))} disabled={i === 0} className="rounded p-1 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label="Subir bloco"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setBlocos((l) => mover(l, i, 1))} disabled={i === blocos.length - 1} className="rounded p-1 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label="Descer bloco"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setBlocos((l) => l.filter((x) => x.id !== b.id))} className="rounded p-1 text-texto-fraco hover:text-erro" aria-label="Remover bloco"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
                {b.tipo === 'titulo' && <Campo value={b.texto ?? ''} maxLength={160} onChange={(e) => mudarBloco(b.id, { texto: e.target.value })} placeholder="Subtítulo da seção" aria-label="Subtítulo" className="bg-white font-semibold" />}
                {b.tipo === 'texto' && <AreaTexto rows={4} value={b.texto ?? ''} maxLength={10000} onChange={(e) => mudarBloco(b.id, { texto: e.target.value })} placeholder="Escreva o texto…" aria-label="Texto" className="bg-white" />}
                {b.tipo === 'destaque' && (
                  <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                    <Selecao aria-label="Tom do destaque" value={b.tom ?? 'info'} onChange={(e) => mudarBloco(b.id, { tom: e.target.value as BlocoConteudo['tom'] })} className="bg-white">
                      <option value="info">Dica</option>
                      <option value="atencao">Atenção</option>
                      <option value="importante">Importante</option>
                    </Selecao>
                    <AreaTexto rows={2} value={b.texto ?? ''} maxLength={2000} onChange={(e) => mudarBloco(b.id, { texto: e.target.value })} placeholder="O que a pessoa não pode deixar passar?" aria-label="Texto do destaque" className="bg-white" />
                  </div>
                )}
                {b.tipo === 'imagem' && (
                  <div className="space-y-2">
                    {b.caminho ? <ListaAnexos anexos={[{ caminho: b.caminho, nome: b.legenda || 'Imagem', tipo: 'image/png', tamanho: null }]} /> : <BotaoAnexar pasta="conhecimento" donoId={id} rotulo="Enviar imagem" aceitar={IMAGENS} aoEnviar={(n) => mudarBloco(b.id, { caminho: n[0]?.caminho })} />}
                    <Campo value={b.legenda ?? ''} maxLength={200} onChange={(e) => mudarBloco(b.id, { legenda: e.target.value })} placeholder="Legenda (opcional)" aria-label="Legenda da imagem" className="bg-white" />
                  </div>
                )}
                {b.tipo === 'video' && (
                  <div className="space-y-2">
                    {b.caminho ? (
                      <ListaAnexos anexos={[{ caminho: b.caminho, nome: b.legenda || 'Vídeo enviado', tipo: 'video/mp4', tamanho: null }]} compacto aoRemover={() => mudarBloco(b.id, { caminho: undefined })} />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[220px] flex-1"><Campo value={b.url ?? ''} onChange={(e) => mudarBloco(b.id, { url: e.target.value })} placeholder="Link do YouTube ou Vimeo (https://…)" aria-label="Link do vídeo" className="bg-white" /></div>
                        <span className="text-xs text-texto-fraco">ou</span>
                        <BotaoAnexar pasta="conhecimento" donoId={id} rotulo="Enviar vídeo (até 25 MB)" aceitar={VIDEOS} aoEnviar={(n) => mudarBloco(b.id, { caminho: n[0]?.caminho, url: undefined })} />
                      </div>
                    )}
                    <Campo value={b.legenda ?? ''} maxLength={200} onChange={(e) => mudarBloco(b.id, { legenda: e.target.value })} placeholder="Legenda (opcional)" aria-label="Legenda do vídeo" className="bg-white" />
                  </div>
                )}
                {b.tipo === 'link' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Campo value={b.url ?? ''} onChange={(e) => mudarBloco(b.id, { url: e.target.value })} placeholder="https://…" aria-label="Endereço do link" className="bg-white" />
                    <Campo value={b.texto ?? ''} maxLength={160} onChange={(e) => mudarBloco(b.id, { texto: e.target.value })} placeholder="Nome do link (ex.: Portal do Simples Nacional)" aria-label="Nome do link" className="bg-white" />
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            {BLOCOS.map((d) => (
              <button key={d.tipo} onClick={() => setBlocos((l) => [...l, { id: novoId(), tipo: d.tipo, ...(d.tipo === 'destaque' ? { tom: 'info' as const } : {}) }])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-borda-forte bg-white px-3 py-1.5 text-xs font-medium text-texto-suave hover:border-marca-400 hover:text-marca-700">
                <Plus className="h-3.5 w-3.5" /> <d.icone className="h-3.5 w-3.5" /> {d.rotulo}
              </button>
            ))}
          </div>
        </div>
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Passo a passo (checklist)" descricao="Cada etapa vira um item que a pessoa marca enquanto executa. Marque as etapas críticas como importantes." />
        <div className="space-y-3 p-5">
          {passos.map((p, i) => (
            <div key={p.id} className={cn('rounded-xl border p-3', p.importante ? 'border-amber-300 bg-alerta-suave/60' : 'border-borda bg-superficie')}>
              <div className="flex items-start gap-3">
                <span className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-texto-suave ring-1 ring-borda-forte">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Campo value={p.titulo} maxLength={200} onChange={(e) => mudarPasso(p.id, { titulo: e.target.value })} placeholder="O que fazer nesta etapa" aria-label={`Título da etapa ${i + 1}`} className="bg-white font-medium" />
                  <AreaTexto rows={2} value={p.descricao ?? ''} maxLength={4000} onChange={(e) => mudarPasso(p.id, { descricao: e.target.value })} placeholder="Detalhes, onde clicar, o que conferir… (opcional)" aria-label={`Detalhes da etapa ${i + 1}`} className="bg-white" />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-texto">
                      <input type="checkbox" checked={Boolean(p.importante)} onChange={(e) => mudarPasso(p.id, { importante: e.target.checked })} className="h-4 w-4 accent-[var(--color-alerta)]" />
                      <AlertTriangle className="h-3.5 w-3.5 text-alerta" /> Etapa importante
                    </label>
                    {p.caminho ? (
                      <ListaAnexos anexos={[{ caminho: p.caminho, nome: 'Imagem da etapa', tipo: 'image/png', tamanho: null }]} compacto aoRemover={() => mudarPasso(p.id, { caminho: undefined })} />
                    ) : (
                      <BotaoAnexar pasta="conhecimento" donoId={id} rotulo="Imagem da etapa" variante="fantasma" aceitar={IMAGENS} aoEnviar={(n) => mudarPasso(p.id, { caminho: n[0]?.caminho })} />
                    )}
                  </div>
                </div>
                <span className="flex flex-col">
                  <button onClick={() => setPassos((l) => mover(l, i, -1))} disabled={i === 0} className="rounded p-1 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label="Subir etapa"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setPassos((l) => mover(l, i, 1))} disabled={i === passos.length - 1} className="rounded p-1 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label="Descer etapa"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setPassos((l) => l.filter((x) => x.id !== p.id))} className="rounded p-1 text-texto-fraco hover:text-erro" aria-label="Remover etapa"><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              </div>
            </div>
          ))}
          <Botao variante="secundario" tamanho="sm" onClick={() => setPassos((l) => [...l, { id: novoId(), titulo: '' }])}><Plus className="h-4 w-4" /> Adicionar etapa</Botao>
        </div>
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Arquivos" descricao="PDF, planilhas, modelos e outros documentos de apoio (até 25 MB cada)." acoes={<BotaoAnexar pasta="conhecimento" donoId={id} aoEnviar={(n) => setAnexos((l) => [...l, ...n])} />} />
        <div className="p-5">
          {anexos.length === 0 ? <p className="text-sm text-texto-fraco">Nenhum arquivo anexado.</p> : <ListaAnexos anexos={anexos} compacto aoRemover={(a) => setAnexos((l) => l.filter((x) => x.caminho !== a.caminho))} />}
        </div>
      </Cartao>

      {artigo && (
        <Cartao className="p-5">
          <Campo rotulo="O que mudou nesta versão? (opcional)" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: atualizado o passo 3 conforme o novo layout do portal" dica="Aparece no histórico de versões." />
        </Cartao>
      )}

      <div className="flex justify-end gap-2 pb-6">
        <Link href={artigo ? `/conhecimento/${artigo.id}` : '/conhecimento'} className="inline-flex h-9.5 items-center rounded-lg border border-borda-forte bg-white px-4 text-sm font-medium text-texto hover:bg-superficie">Cancelar</Link>
        <Botao onClick={() => void salvar()} carregando={salvando}>{artigo ? 'Salvar nova versão' : publicado ? 'Publicar' : 'Salvar rascunho'}</Botao>
      </div>
    </div>
  );
}
