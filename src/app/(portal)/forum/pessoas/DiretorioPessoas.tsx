'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';

import { BotaoSeguir } from '@/components/forum/BotaoSeguir';
import { Avatar, ProvedorForum, useForum, type EuNoForum } from '@/components/forum/comum';
import { rotuloArea } from '@/lib/permissoes';
import type { PessoaForum } from '@/types/banco';

export function DiretorioPessoas({ eu }: { eu: EuNoForum }) {
  return (
    <ProvedorForum eu={eu}>
      <Lista />
    </ProvedorForum>
  );
}

function Lista() {
  const { supabase, carregarUrls } = useForum();
  const [busca, setBusca] = useState('');
  const [pessoas, setPessoas] = useState<PessoaForum[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('forum_pessoas', { p_busca: busca || null, p_limite: 50 });
      const lista = (data ?? []) as PessoaForum[];
      setPessoas(lista);
      void carregarUrls(lista.map((p) => p.avatar_path ?? '').filter(Boolean));
    }, 200);
    return () => clearTimeout(t);
  }, [busca, supabase, carregarUrls]);

  return (
    <main className="mx-auto max-w-2xl border-borda bg-superficie-elevada sm:my-5 sm:rounded-2xl sm:border">
      <div className="flex items-center gap-3 border-b border-borda px-4 py-3">
        <Link href="/forum" className="rounded-full p-2 hover:bg-superficie" aria-label="Voltar ao Fórum">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-texto">A equipe no Fórum</h1>
      </div>
      <div className="relative border-b border-borda p-4">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar por nome, @apelido ou cargo"
          className="h-10 w-full rounded-full border border-borda bg-superficie pl-10 pr-4 text-sm"
          autoFocus
        />
      </div>
      <ul className="divide-y divide-borda">
        {pessoas.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-superficie">
            <Link href={`/forum/perfil/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar pessoa={p} tamanho="md" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-texto">{p.nome}</span>
                <span className="block truncate text-sm text-texto-suave">
                  @{p.apelido}
                  {p.cargo ? ` · ${p.cargo}` : ''}
                  {p.area ? ` · ${rotuloArea(p.area)}` : ''}
                </span>
                <span className="block text-xs text-texto-fraco">{p.seguidores} seguidor(es)</span>
              </span>
            </Link>
            <BotaoSeguir pessoaId={p.id} sigo={p.eu_sigo} aoMudar={(sigo) => setPessoas((l) => l.map((x) => (x.id === p.id ? { ...x, eu_sigo: sigo } : x)))} />
          </li>
        ))}
        {pessoas.length === 0 && <li className="px-4 py-10 text-center text-sm text-texto-suave">Ninguém encontrado.</li>}
      </ul>
    </main>
  );
}
