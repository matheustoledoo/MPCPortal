'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { BookOpen, Eye, FileText, FolderCog, ListChecks, PlayCircle, Plus, Search, Star, ThumbsUp, Trash2 } from 'lucide-react';

import { Botao, Campo, Cartao, EstadoVazio, Modal, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { DEPARTAMENTOS } from '@/lib/calendario';
import { TIPOS_CONTEUDO, caminhoCategoria, combina, idsDaCategoria, rotuloTipo, type ResumoArtigo } from '@/lib/conhecimento';
import { tempoRelativo } from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { CategoriaConhecimento } from '@/types/banco';

const ICONE_TIPO = { procedimento: ListChecks, tutorial: PlayCircle, arquivo: FileText };
type Aba = 'todos' | 'favoritos' | 'destaques' | 'rascunhos';

export function CentralConhecimento({
  meuId,
  podeEditar,
  podeExcluir,
  categoriasIniciais,
  artigos,
  favoritosIniciais,
}: {
  meuId: string;
  podeEditar: boolean;
  podeExcluir: boolean;
  categoriasIniciais: CategoriaConhecimento[];
  artigos: ResumoArtigo[];
  favoritosIniciais: string[];
}) {
  const { avisar } = useAvisos();
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [favoritos, setFavoritos] = useState(() => new Set(favoritosIniciais));
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [aba, setAba] = useState<Aba>('todos');
  const [gerenciando, setGerenciando] = useState(false);

  const raizes = categorias.filter((c) => !c.pai_id);
  const filhas = categoria ? categorias.filter((c) => c.pai_id === categoria || (c.pai_id && c.pai_id === categorias.find((x) => x.id === categoria)?.pai_id)) : [];

  const filtrados = useMemo(() => {
    const ids = categoria ? idsDaCategoria(categoria, categorias) : null;
    return artigos.filter((a) => {
      if (aba === 'rascunhos' ? a.publicado : !a.publicado) return false;
      if (aba === 'favoritos' && !favoritos.has(a.id)) return false;
      if (aba === 'destaques' && !a.destaque) return false;
      if (ids && !ids.includes(a.categoria_id ?? '')) return false;
      if (tipo && a.tipo !== tipo) return false;
      if (departamento && a.departamento !== departamento) return false;
      if (busca.trim() && !combina(a, busca)) return false;
      return true;
    });
  }, [artigos, aba, favoritos, categoria, categorias, tipo, departamento, busca]);

  const rascunhos = artigos.filter((a) => !a.publicado).length;

  async function alternarFavorito(id: string) {
    const supabase = criarClienteNavegador();
    const era = favoritos.has(id);
    setFavoritos((f) => {
      const n = new Set(f);
      if (era) n.delete(id);
      else n.add(id);
      return n;
    });
    const { error } = era
      ? await supabase.from('conhecimento_favoritos').delete().eq('artigo_id', id).eq('usuario_id', meuId)
      : await supabase.from('conhecimento_favoritos').insert({ artigo_id: id, usuario_id: meuId });
    if (error) avisar('erro', `Não foi possível atualizar os favoritos: ${error.message}`);
  }

  return (
    <div className="space-y-5">
      <Cartao className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Campo value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="O que você precisa fazer? Busque por título, palavra-chave, atividade…" iconeInicial={<Search className="h-4 w-4" />} aria-label="Pesquisar na central de conhecimento" className="h-11" />
          </div>
          {podeEditar && (
            <>
              <Botao variante="secundario" onClick={() => setGerenciando(true)}><FolderCog className="h-4 w-4" /> Categorias</Botao>
              <Link href="/conhecimento/novo" className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-marca-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-marca-800"><Plus className="h-4 w-4" /> Novo conteúdo</Link>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Categorias">
          <button onClick={() => setCategoria('')} className={cn('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors', !categoria ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-texto-suave ring-borda-forte hover:text-texto')}>Todas</button>
          {raizes.map((c) => {
            const ativa = categoria === c.id || categorias.find((x) => x.id === categoria)?.pai_id === c.id;
            const total = artigos.filter((a) => a.publicado && idsDaCategoria(c.id, categorias).includes(a.categoria_id ?? '')).length;
            return (
              <button key={c.id} onClick={() => setCategoria(c.id)} title={c.descricao ?? undefined} className={cn('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors', ativa ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-texto-suave ring-borda-forte hover:text-texto')}>
                {c.nome} <span className={cn('ml-1 tabular-nums', ativa ? 'text-white/70' : 'text-texto-fraco')}>{total}</span>
              </button>
            );
          })}
        </div>
        {filhas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-l-2 border-marca-200 pl-3" role="group" aria-label="Subcategorias">
            {filhas.map((c) => (
              <button key={c.id} onClick={() => setCategoria(categoria === c.id ? (c.pai_id ?? '') : c.id)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset', categoria === c.id ? 'bg-marca-50 text-marca-800 ring-marca-200' : 'bg-white text-texto-suave ring-borda hover:text-texto')}>{c.nome}</button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-borda pt-4">
          <div className="flex rounded-lg border border-borda-forte bg-white p-0.5" role="tablist">
            {([['todos', 'Todos'], ['favoritos', 'Favoritos'], ['destaques', 'Em destaque'], ...(podeEditar || rascunhos ? [['rascunhos', `Rascunhos${rascunhos ? ` (${rascunhos})` : ''}`]] : [])] as [Aba, string][]).map(([v, rotulo]) => (
              <button key={v} role="tab" aria-selected={aba === v} onClick={() => setAba(v)} className={cn('rounded-md px-3 py-1.5 text-xs font-medium', aba === v ? 'bg-marca-50 text-marca-800' : 'text-texto-suave hover:text-texto')}>{rotulo}</button>
            ))}
          </div>
          <div className="w-40">
            <Selecao aria-label="Tipo de conteúdo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9">
              <option value="">Todos os tipos</option>
              {TIPOS_CONTEUDO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </Selecao>
          </div>
          <div className="w-48">
            <Selecao aria-label="Departamento" value={departamento} onChange={(e) => setDepartamento(e.target.value)} className="h-9">
              <option value="">Todos os departamentos</option>
              {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Selecao>
          </div>
          <p className="ml-auto text-xs text-texto-suave">{filtrados.length} conteúdo(s)</p>
        </div>
      </Cartao>

      {filtrados.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<BookOpen className="h-6 w-6" />}
            titulo={artigos.length === 0 ? 'A central ainda está vazia' : 'Nenhum conteúdo encontrado'}
            descricao={
              artigos.length === 0
                ? podeEditar
                  ? 'Crie o primeiro procedimento ou tutorial. Ele fica disponível para toda a equipe assim que for publicado.'
                  : 'Assim que a equipe publicar tutoriais e procedimentos, eles aparecem aqui.'
                : 'Tente outras palavras, troque a categoria ou limpe os filtros.'
            }
            acao={artigos.length === 0 && podeEditar ? <Link href="/conhecimento/novo" className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-marca-700 px-4 text-sm font-medium text-white hover:bg-marca-800"><Plus className="h-4 w-4" /> Novo conteúdo</Link> : undefined}
          />
        </Cartao>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((a) => {
            const Icone = ICONE_TIPO[a.tipo];
            const favorito = favoritos.has(a.id);
            return (
              <li key={a.id} className="group relative">
                <Link href={`/conhecimento/${a.id}`} className="flex h-full flex-col rounded-xl border border-borda bg-superficie-elevada p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-marca-300 hover:shadow-md">
                  <div className="flex items-start gap-3 pr-8">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700"><Icone className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold leading-snug text-texto">{a.titulo}</h3>
                      <p className="mt-0.5 truncate text-xs text-texto-fraco">{caminhoCategoria(a.categoria_id, categorias)}</p>
                    </div>
                  </div>
                  {a.resumo && <p className="mt-3 line-clamp-3 text-sm text-texto-suave">{a.resumo}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Selo tom="marca" className="text-[10px]">{rotuloTipo(a.tipo)}</Selo>
                    {a.departamento && <Selo tom="neutro" className="text-[10px]">{a.departamento}</Selo>}
                    {a.destaque && <Selo tom="alerta" className="text-[10px]">Destaque</Selo>}
                    {!a.publicado && <Selo tom="info" className="text-[10px]">Rascunho</Selo>}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-texto-fraco">
                    <span className="truncate">{a.atualizado_por_nome ?? a.criado_por_nome ?? '—'} · {tempoRelativo(a.updated_at)}</span>
                    <span className="flex shrink-0 items-center gap-2.5 tabular-nums">
                      <span className="inline-flex items-center gap-1" title="Visualizações"><Eye className="h-3 w-3" />{a.visualizacoes}</span>
                      {a.uteis > 0 && <span className="inline-flex items-center gap-1" title="Marcaram como útil"><ThumbsUp className="h-3 w-3" />{a.uteis}</span>}
                    </span>
                  </div>
                </Link>
                <button onClick={() => void alternarFavorito(a.id)} className={cn('absolute right-3 top-3 rounded-lg p-1.5 transition-colors', favorito ? 'text-amber-500' : 'text-texto-fraco hover:bg-superficie hover:text-amber-500')} aria-label={favorito ? `Tirar ${a.titulo} dos favoritos` : `Favoritar ${a.titulo}`} aria-pressed={favorito}>
                  <Star className="h-4.5 w-4.5" fill={favorito ? 'currentColor' : 'none'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {gerenciando && (
        <GerenciarCategorias categorias={categorias} artigos={artigos} podeExcluir={podeExcluir} aoMudar={setCategorias} aoFechar={() => setGerenciando(false)} />
      )}
    </div>
  );
}

function GerenciarCategorias({
  categorias,
  artigos,
  podeExcluir,
  aoMudar,
  aoFechar,
}: {
  categorias: CategoriaConhecimento[];
  artigos: ResumoArtigo[];
  podeExcluir: boolean;
  aoMudar: (c: CategoriaConhecimento[]) => void;
  aoFechar: () => void;
}) {
  const { avisar } = useAvisos();
  const [nome, setNome] = useState('');
  const [pai, setPai] = useState('');
  const raizes = categorias.filter((c) => !c.pai_id);

  async function recarregar() {
    const { data } = await criarClienteNavegador().from('conhecimento_categorias').select('id, nome, descricao, pai_id, departamento, ordem').order('ordem').order('nome');
    if (data) aoMudar(data as CategoriaConhecimento[]);
  }

  async function criar() {
    if (!nome.trim()) return;
    const { error } = await criarClienteNavegador()
      .from('conhecimento_categorias')
      .insert({ nome: nome.trim(), pai_id: pai || null, ordem: categorias.length + 1 });
    if (error) return avisar('erro', `Não foi possível criar: ${error.message}`);
    setNome('');
    void recarregar();
  }

  async function renomear(c: CategoriaConhecimento, novo: string) {
    if (!novo.trim() || novo.trim() === c.nome) return;
    const { error } = await criarClienteNavegador().from('conhecimento_categorias').update({ nome: novo.trim() }).eq('id', c.id);
    if (error) return avisar('erro', `Não foi possível renomear: ${error.message}`);
    void recarregar();
  }

  async function excluir(c: CategoriaConhecimento) {
    const { error } = await criarClienteNavegador().from('conhecimento_categorias').delete().eq('id', c.id);
    if (error) return avisar('erro', `Não foi possível excluir: ${error.message}`);
    void recarregar();
  }

  const usos = (id: string) => artigos.filter((a) => a.categoria_id === id).length + categorias.filter((c) => c.pai_id === id).length;

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Categorias e subcategorias" largura="md" rodape={<Botao onClick={aoFechar}>Concluir</Botao>}>
      <ul className="space-y-1.5">
        {raizes.map((r) => (
          <li key={r.id}>
            <LinhaCategoria categoria={r} usos={usos(r.id)} podeExcluir={podeExcluir} aoRenomear={renomear} aoExcluir={excluir} />
            <ul className="ml-5 mt-1.5 space-y-1.5 border-l-2 border-borda pl-3">
              {categorias.filter((c) => c.pai_id === r.id).map((f) => (
                <li key={f.id}><LinhaCategoria categoria={f} usos={usos(f.id)} podeExcluir={podeExcluir} aoRenomear={renomear} aoExcluir={excluir} /></li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <form className="mt-5 grid gap-2 border-t border-borda pt-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
        <Campo value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova categoria" maxLength={80} aria-label="Nome da nova categoria" />
        <Selecao aria-label="Dentro de" value={pai} onChange={(e) => setPai(e.target.value)}>
          <option value="">Categoria principal</option>
          {raizes.map((r) => <option key={r.id} value={r.id}>Dentro de {r.nome}</option>)}
        </Selecao>
        <Botao type="submit" variante="secundario" className="h-10" disabled={!nome.trim()}><Plus className="h-4 w-4" /> Criar</Botao>
      </form>
      <p className="mt-3 text-xs text-texto-fraco">Só é possível excluir categorias vazias (sem conteúdos nem subcategorias).</p>
    </Modal>
  );
}

function LinhaCategoria({
  categoria,
  usos,
  podeExcluir,
  aoRenomear,
  aoExcluir,
}: {
  categoria: CategoriaConhecimento;
  usos: number;
  podeExcluir: boolean;
  aoRenomear: (c: CategoriaConhecimento, nome: string) => void;
  aoExcluir: (c: CategoriaConhecimento) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Campo defaultValue={categoria.nome} key={categoria.nome} maxLength={80} aria-label={`Nome da categoria ${categoria.nome}`} onBlur={(e) => aoRenomear(categoria, e.target.value)} className="h-9" />
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-texto-fraco">{usos} uso(s)</span>
      {podeExcluir && (
        <button disabled={usos > 0} onClick={() => aoExcluir(categoria)} className="rounded p-1.5 text-texto-fraco hover:bg-erro-suave hover:text-erro disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Excluir ${categoria.nome}`} title={usos > 0 ? 'Categoria em uso' : 'Excluir categoria'}><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}
