'use client';

import { useState } from 'react';

import Link from 'next/link';
import { Bookmark, Flame, Hash, Search, Sparkles, Users, X } from 'lucide-react';

import { Compositor } from '@/components/forum/Compositor';
import { LateralForum } from '@/components/forum/LateralForum';
import { ListaPosts, type ModoLista } from '@/components/forum/ListaPosts';
import { ProvedorForum, type EuNoForum } from '@/components/forum/comum';
import { cn, useAvisos } from '@/components/ui';

const ABAS: { valor: ModoLista; rotulo: string; icone: typeof Sparkles }[] = [
  { valor: 'todos', rotulo: 'Para você', icone: Sparkles },
  { valor: 'seguindo', rotulo: 'Seguindo', icone: Users },
  { valor: 'em_alta', rotulo: 'Em alta', icone: Flame },
  { valor: 'salvos', rotulo: 'Salvos', icone: Bookmark },
];

/** O feed do Fórum da Meta: abas, compositor e a coluna lateral. */
export function FeedForum({ eu, busca, tag }: { eu: EuNoForum; busca?: string; tag?: string }) {
  const [aba, setAba] = useState<ModoLista>('todos');
  const [versao, setVersao] = useState(0);
  const { avisar } = useAvisos();

  const modo: ModoLista = busca ? 'busca' : tag ? 'tag' : aba;

  return (
    <ProvedorForum eu={eu}>
      <div className="mx-auto grid max-w-6xl gap-6 px-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-5">
        <main className="min-w-0 border-borda bg-superficie-elevada sm:rounded-2xl sm:border">
          {busca || tag ? (
            <div className="sticky top-14 z-10 flex items-center gap-3 border-b border-borda bg-superficie-elevada/95 px-4 py-3 backdrop-blur sm:rounded-t-2xl">
              {busca ? <Search className="h-5 w-5 text-marca-600" /> : <Hash className="h-5 w-5 text-marca-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-texto-fraco">{busca ? 'Resultados para' : 'Assunto'}</p>
                <h1 className="truncate text-lg font-bold text-texto">{busca ? `“${busca}”` : `#${tag}`}</h1>
              </div>
              <Link href="/forum" className="rounded-full p-2 text-texto-suave hover:bg-superficie" aria-label="Voltar ao feed">
                <X className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="sticky top-14 z-10 border-b border-borda bg-superficie-elevada/95 backdrop-blur sm:rounded-t-2xl">
              <div className="flex items-center justify-between gap-3 px-4 pt-3">
                <h1 className="text-xl font-bold text-texto">Fórum da Meta</h1>
                <form action="/forum" className="relative w-48 lg:hidden">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-fraco" />
                  <input name="q" placeholder="Buscar" className="h-8 w-full rounded-full border border-borda bg-superficie pl-8 pr-3 text-xs" aria-label="Buscar no Fórum" />
                </form>
              </div>
              <nav className="flex" aria-label="Abas do feed">
                {ABAS.map((a) => (
                  <button
                    key={a.valor}
                    onClick={() => setAba(a.valor)}
                    className={cn(
                      'relative flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors hover:bg-superficie',
                      aba === a.valor ? 'text-texto' : 'text-texto-suave',
                    )}
                  >
                    <a.icone className="h-4 w-4" />
                    {a.rotulo}
                    {aba === a.valor && <span className="absolute bottom-0 h-1 w-14 rounded-full bg-marca-600" />}
                  </button>
                ))}
              </nav>
            </div>
          )}

          <ListaPosts
            modo={modo}
            busca={busca}
            tag={tag}
            versao={versao}
            topo={
              modo === 'todos' || modo === 'seguindo' ? (
                <div className="border-b border-borda">
                  <Compositor
                    aoPublicar={() => {
                      avisar('sucesso', 'Publicado! Quem segue você com o sininho foi avisado.');
                      setVersao((v) => v + 1);
                    }}
                  />
                </div>
              ) : undefined
            }
            vazio={
              <div className="space-y-2">
                <p className="text-lg font-bold text-texto">
                  {modo === 'seguindo'
                    ? 'Você ainda não segue ninguém'
                    : modo === 'salvos'
                      ? 'Nada salvo por enquanto'
                      : modo === 'busca'
                        ? 'Nada encontrado'
                        : modo === 'tag'
                          ? 'Ninguém usou este assunto ainda'
                          : 'O Fórum está esperando o primeiro post'}
                </p>
                <p className="text-sm text-texto-suave">
                  {modo === 'seguindo'
                    ? 'Siga as pessoas da equipe — em “Quem seguir”, ao lado — e os posts delas aparecem aqui.'
                    : modo === 'salvos'
                      ? 'Toque no marcador de um post para guardar e achar depois.'
                      : modo === 'busca'
                        ? 'Tente outras palavras, um @nome ou um #assunto.'
                        : 'Conte uma novidade, compartilhe uma foto, faça uma enquete.'}
                </p>
              </div>
            }
          />
        </main>

        <div className="hidden lg:block">
          <div className="sticky top-20">
            <LateralForum buscaInicial={busca} />
          </div>
        </div>
      </div>
    </ProvedorForum>
  );
}
