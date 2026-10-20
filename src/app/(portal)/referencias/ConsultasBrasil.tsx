'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import {
  Building2,
  ExternalLink,
  Globe2,
  Landmark,
  Loader2,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';

import { Botao, Campo, Cartao, CabecalhoCartao, EstadoVazio, Modal, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';

export interface EstadoResumo {
  uf: string;
  nome: string;
  regiao: string;
  capital: string | null;
  municipios: number;
  com_link: number;
  empresas: number;
  links_estado: number;
}

export interface LinkReferencia {
  id: string;
  escopo: 'nacional' | 'estado' | 'municipio';
  uf: string | null;
  municipio_codigo: number | null;
  categoria: string;
  titulo: string;
  url: string;
  observacao: string | null;
}

interface Municipio {
  codigo: number;
  nome: string;
  uf: string;
  capital: boolean;
  empresas: number;
  tem_link: boolean;
  links_planilha: { id: string; mobiliario: string | null; segunda_via: string | null; cfm: string | null; observacao: string | null }[];
  links: { id: string; categoria: string; titulo: string; url: string; observacao: string | null }[];
}

const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const CATEGORIAS_LINK = ['Prefeitura', 'Alvará / Funcionamento', 'ISS / Nota fiscal', 'Contribuinte mobiliário', 'Vigilância Sanitária', 'Bombeiros', 'Junta Comercial', 'Secretaria da Fazenda', 'Certidões', 'Outro'];
const POR_PAGINA = 60;

/**
 * Todos os municípios e estados do Brasil (IBGE), com filtro por estado,
 * pesquisa e os links que a equipe usa — inclusive os 40 da aba Caminhos
 * da planilha original. Quem tem permissão cadastra links novos para
 * qualquer cidade, estado ou para o país.
 */
export function ConsultasBrasil({
  estados,
  linksIniciais,
  podeEditar,
  podeVerPlanilha,
  municipioInicial,
}: {
  estados: EstadoResumo[];
  linksIniciais: LinkReferencia[];
  podeEditar: boolean;
  podeVerPlanilha: boolean;
  municipioInicial?: string;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const { avisar } = useAvisos();

  const [uf, setUf] = useState('');
  const [busca, setBusca] = useState(municipioInicial ?? '');
  const [buscaAplicada, setBuscaAplicada] = useState(municipioInicial ?? '');
  const [filtro, setFiltro] = useState<'todos' | 'com_link' | 'com_clientes' | 'sem_link'>('todos');
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [links, setLinks] = useState(linksIniciais);
  const [novoLink, setNovoLink] = useState<Partial<LinkReferencia> | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(0);
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc('referencias_municipios', {
      p_uf: uf || null,
      p_busca: buscaAplicada || null,
      p_filtro: filtro,
      p_limite: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (error) avisar('erro', error.message);
    const r = (data ?? { total: 0, itens: [] }) as { total: number; itens: Municipio[] };
    setTotal(Number(r.total));
    setMunicipios((atuais) => (pagina === 0 ? r.itens : [...atuais, ...r.itens]));
    setCarregando(false);
  }, [supabase, uf, buscaAplicada, filtro, pagina, avisar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const estado = estados.find((e) => e.uf === uf) ?? null;
  const nacionais = links.filter((l) => l.escopo === 'nacional');
  const doEstado = links.filter((l) => l.escopo === 'estado' && l.uf === uf);

  async function salvarLink() {
    if (!novoLink) return;
    const url = (novoLink.url ?? '').trim();
    const titulo = (novoLink.titulo ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      avisar('alerta', 'O endereço precisa começar com http:// ou https://');
      return;
    }
    if (titulo.length < 2) {
      avisar('alerta', 'Dê um nome ao link.');
      return;
    }
    setSalvando(true);
    const registro = {
      escopo: novoLink.escopo,
      uf: novoLink.escopo === 'nacional' ? null : novoLink.uf,
      municipio_codigo: novoLink.escopo === 'municipio' ? novoLink.municipio_codigo : null,
      categoria: novoLink.categoria || 'Outro',
      titulo,
      url,
      observacao: (novoLink.observacao ?? '').trim() || null,
    };
    const { data, error } = await supabase.from('referencias_links').insert(registro).select('*').single();
    setSalvando(false);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    setLinks((l) => [...l, data as LinkReferencia]);
    setNovoLink(null);
    avisar('sucesso', 'Link cadastrado para todo o time.');
    if (registro.escopo === 'municipio') {
      setPagina(0);
      void carregar();
    }
  }

  async function excluirLink(id: string, municipio = false) {
    const { error } = await supabase.from('referencias_links').delete().eq('id', id);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    setLinks((l) => l.filter((x) => x.id !== id));
    if (municipio) {
      setPagina(0);
      void carregar();
    }
    avisar('sucesso', 'Link removido.');
  }

  return (
    <div className="space-y-5">
      {/* Links do país inteiro */}
      <Cartao>
        <CabecalhoCartao
          titulo={
            <span className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-marca-600" /> Órgãos nacionais
            </span>
          }
          descricao="Valem para qualquer empresa, em qualquer cidade."
          acoes={
            podeEditar && (
              <Botao tamanho="sm" variante="secundario" onClick={() => setNovoLink({ escopo: 'nacional', categoria: 'Outro' })}>
                <Plus className="h-3.5 w-3.5" /> Link
              </Botao>
            )
          }
        />
        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {nacionais.map((l) => (
            <CartaoLink key={l.id} link={l} podeExcluir={podeEditar} aoExcluir={() => void excluirLink(l.id)} />
          ))}
        </div>
      </Cartao>

      {/* Estados */}
      <Cartao className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setUf('');
              setPagina(0);
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
              !uf ? 'bg-marca-600 text-white ring-marca-600' : 'bg-white text-texto-suave ring-borda hover:ring-marca-300',
            )}
          >
            Todo o Brasil
          </button>
          <span className="text-[11px] text-texto-fraco">
            {estados.reduce((s, e) => s + e.municipios, 0).toLocaleString('pt-BR')} municípios em {estados.length} estados
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          {REGIOES.map((regiao) => (
            <div key={regiao}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-fraco">{regiao}</p>
              <div className="flex flex-wrap gap-1">
                {estados
                  .filter((e) => e.regiao === regiao)
                  .map((e) => (
                    <button
                      key={e.uf}
                      onClick={() => {
                        setUf(e.uf === uf ? '' : e.uf);
                        setPagina(0);
                      }}
                      title={`${e.nome} — ${e.municipios} municípios${e.empresas ? ` · ${e.empresas} empresa(s) da carteira` : ''}`}
                      className={cn(
                        'relative rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors',
                        uf === e.uf ? 'bg-marca-600 text-white ring-marca-600' : 'bg-white text-texto ring-borda hover:ring-marca-300',
                      )}
                    >
                      {e.uf}
                      {e.empresas > 0 && (
                        <span className={cn('absolute -right-1 -top-1 h-2 w-2 rounded-full', uf === e.uf ? 'bg-white' : 'bg-marca-500')} />
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Cartao>

      {estado && (
        <Cartao className="animar-surgir">
          <CabecalhoCartao
            titulo={
              <span className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-marca-600" /> {estado.nome} ({estado.uf})
              </span>
            }
            descricao={`Capital: ${estado.capital ?? '—'} · ${estado.municipios} municípios · ${estado.empresas} empresa(s) da carteira · ${estado.com_link} cidade(s) com link`}
            acoes={
              podeEditar && (
                <Botao tamanho="sm" variante="secundario" onClick={() => setNovoLink({ escopo: 'estado', uf: estado.uf, categoria: 'Junta Comercial' })}>
                  <Plus className="h-3.5 w-3.5" /> Link do estado
                </Botao>
              )
            }
          />
          <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {doEstado.length === 0 && (
              <p className="text-sm text-texto-suave">
                Nenhum link estadual cadastrado ainda.{' '}
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`junta comercial ${estado.nome}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-marca-700 hover:underline"
                >
                  Procurar a Junta Comercial
                </a>
              </p>
            )}
            {doEstado.map((l) => (
              <CartaoLink key={l.id} link={l} podeExcluir={podeEditar} aoExcluir={() => void excluirLink(l.id)} />
            ))}
          </div>
        </Cartao>
      )}

      {/* Municípios */}
      <Cartao>
        <div className="flex flex-wrap items-end gap-3 border-b border-borda p-4">
          <div className="min-w-[240px] flex-1">
            <Campo
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={uf ? `Procurar cidade em ${estado?.nome}…` : 'Procurar qualquer cidade do Brasil (ou código IBGE)…'}
              iconeInicial={<Search className="h-4 w-4" />}
              aria-label="Procurar cidade"
            />
          </div>
          <div className="w-56">
            <Selecao
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value as typeof filtro);
                setPagina(0);
              }}
              aria-label="Mostrar"
            >
              <option value="todos">Todas as cidades</option>
              <option value="com_clientes">Só onde temos clientes</option>
              <option value="com_link">Só cidades com link</option>
              <option value="sem_link">Cidades ainda sem link</option>
            </Selecao>
          </div>
          <p className="pb-2 text-sm text-texto-suave">
            <strong className="tabular-nums text-texto">{total.toLocaleString('pt-BR')}</strong> município(s)
          </p>
        </div>

        {carregando && municipios.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-marca-600" />
          </div>
        ) : municipios.length === 0 ? (
          <EstadoVazio icone={<MapPin className="h-6 w-6" />} titulo="Nenhuma cidade encontrada" descricao="Confira a grafia ou troque o estado." />
        ) : (
          <>
            <ul className="grid gap-px bg-borda sm:grid-cols-2 xl:grid-cols-3">
              {municipios.map((m) => (
                <li key={m.codigo} className="flex flex-col gap-2 bg-superficie-elevada p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-texto">
                        {m.capital && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Capital" />}
                        <span className="truncate">{m.nome}</span>
                        <span className="shrink-0 text-xs font-normal text-texto-fraco">/ {m.uf}</span>
                      </p>
                      <p className="text-[11px] text-texto-fraco">IBGE {m.codigo}</p>
                    </div>
                    {m.empresas > 0 &&
                      (podeVerPlanilha ? (
                        <Link href={`/legalizacao?fc.cidade=${encodeURIComponent(m.nome)}`} title="Ver as empresas na planilha">
                          <Selo tom="marca">
                            <Building2 className="h-3 w-3" /> {m.empresas}
                          </Selo>
                        </Link>
                      ) : (
                        <Selo tom="marca">
                          <Building2 className="h-3 w-3" /> {m.empresas}
                        </Selo>
                      ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {m.links_planilha.map((l) => (
                      <span key={l.id} className="contents">
                        {l.mobiliario && <LinkCurto url={l.mobiliario} rotulo="Contribuinte mobiliário" />}
                        {l.segunda_via && <LinkCurto url={l.segunda_via} rotulo="2ª via" />}
                        {l.cfm && <LinkCurto url={l.cfm} rotulo="Consulta CFM/CCM" />}
                      </span>
                    ))}
                    {m.links.map((l) => (
                      <span key={l.id} className="inline-flex items-center">
                        <LinkCurto url={l.url} rotulo={l.titulo} />
                        {podeEditar && (
                          <button
                            onClick={() => void excluirLink(l.id, true)}
                            className="ml-0.5 rounded p-0.5 text-texto-fraco hover:text-erro"
                            aria-label={`Remover ${l.titulo}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {!m.tem_link && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(`prefeitura de ${m.nome} ${m.uf} alvará de funcionamento`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-borda-forte px-2 py-0.5 text-[11px] text-texto-suave hover:border-marca-300 hover:text-marca-700"
                      >
                        <Search className="h-3 w-3" /> Procurar o portal da prefeitura
                      </a>
                    )}
                  </div>
                  {m.links_planilha.some((l) => l.observacao) && (
                    <p className="text-[11px] leading-relaxed text-texto-suave">{m.links_planilha.map((l) => l.observacao).filter(Boolean).join(' · ')}</p>
                  )}
                  {podeEditar && (
                    <button
                      onClick={() => setNovoLink({ escopo: 'municipio', uf: m.uf, municipio_codigo: m.codigo, categoria: 'Prefeitura', titulo: '' })}
                      className="self-start text-[11px] font-medium text-marca-700 hover:underline"
                    >
                      + adicionar link de {m.nome}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {municipios.length < total && (
              <div className="border-t border-borda p-3 text-center">
                <Botao variante="secundario" onClick={() => setPagina((p) => p + 1)} carregando={carregando}>
                  Mostrar mais ({(total - municipios.length).toLocaleString('pt-BR')} restantes)
                </Botao>
              </div>
            )}
          </>
        )}
      </Cartao>

      <Modal
        aberto={Boolean(novoLink)}
        aoFechar={() => setNovoLink(null)}
        titulo={
          novoLink?.escopo === 'nacional'
            ? 'Novo link nacional'
            : novoLink?.escopo === 'estado'
              ? `Novo link — ${estados.find((e) => e.uf === novoLink.uf)?.nome}`
              : `Novo link — ${municipios.find((m) => m.codigo === novoLink?.municipio_codigo)?.nome ?? ''}`
        }
        descricao="Aparece para todo o time. Confira se o endereço abre antes de salvar."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setNovoLink(null)}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvarLink()} carregando={salvando}>
              Salvar link
            </Botao>
          </>
        }
      >
        {novoLink && (
          <div className="space-y-3">
            <Selecao rotulo="Categoria" value={novoLink.categoria ?? 'Outro'} onChange={(e) => setNovoLink({ ...novoLink, categoria: e.target.value })}>
              {CATEGORIAS_LINK.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Selecao>
            <Campo rotulo="Nome do link" value={novoLink.titulo ?? ''} onChange={(e) => setNovoLink({ ...novoLink, titulo: e.target.value })} placeholder="Ex.: Emissão de alvará" maxLength={120} />
            <Campo rotulo="Endereço (URL)" value={novoLink.url ?? ''} onChange={(e) => setNovoLink({ ...novoLink, url: e.target.value })} placeholder="https://" />
            <Campo rotulo="Observação (opcional)" value={novoLink.observacao ?? ''} onChange={(e) => setNovoLink({ ...novoLink, observacao: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function CartaoLink({ link, podeExcluir, aoExcluir }: { link: LinkReferencia; podeExcluir: boolean; aoExcluir: () => void }) {
  return (
    <div className="group flex items-start gap-3 rounded-lg border border-borda p-3 transition-colors hover:border-marca-300">
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-texto-fraco">{link.categoria}</p>
        <p className="flex items-center gap-1 text-sm font-medium text-texto group-hover:text-marca-800">
          <span className="truncate">{link.titulo}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </p>
        <p className="truncate text-[11px] text-texto-suave">{hostDe(link.url)}</p>
        {link.observacao && <p className="mt-1 text-[11px] text-texto-fraco">{link.observacao}</p>}
      </a>
      {podeExcluir && (
        <button onClick={aoExcluir} className="rounded p-1 text-texto-fraco opacity-0 transition-opacity hover:text-erro group-hover:opacity-100" aria-label={`Remover ${link.titulo}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function LinkCurto({ url, rotulo }: { url: string; rotulo: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-1 rounded-md bg-marca-50 px-2 py-0.5 text-[11px] font-medium text-marca-800 ring-1 ring-inset ring-marca-200 transition-colors hover:bg-marca-100"
    >
      {rotulo}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
