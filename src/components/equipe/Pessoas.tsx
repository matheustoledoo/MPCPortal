'use client';

import { useMemo, useRef, useState } from 'react';

import { Check, Plus, Search, X } from 'lucide-react';

import { Popover, cn } from '@/components/ui';
import { corDaPessoa, iniciais } from '@/lib/forum';
import type { PessoaEquipe } from '@/types/banco';

/** Bolinha com as iniciais — cor estável por pessoa, igual à do Fórum. */
export function AvatarPessoa({
  pessoa,
  tamanho = 'md',
  className,
}: {
  pessoa: { id: string; nome: string } | null | undefined;
  tamanho?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const medidas = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };
  return (
    <span
      title={pessoa?.nome ?? 'Sem responsável'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white',
        medidas[tamanho],
        className,
      )}
      style={{ backgroundColor: pessoa ? corDaPessoa(pessoa.id) : '#94a3b8' }}
    >
      {pessoa ? iniciais(pessoa.nome) : '?'}
    </span>
  );
}

export function PilhaDePessoas({
  ids,
  pessoas,
  maximo = 3,
  tamanho = 'sm',
}: {
  ids: string[];
  pessoas: PessoaEquipe[];
  maximo?: number;
  tamanho?: 'xs' | 'sm' | 'md';
}) {
  const lista = ids.map((id) => pessoas.find((p) => p.id === id)).filter(Boolean) as PessoaEquipe[];
  if (lista.length === 0) return null;
  return (
    <span className="flex items-center -space-x-1.5">
      {lista.slice(0, maximo).map((p) => (
        <AvatarPessoa key={p.id} pessoa={p} tamanho={tamanho} />
      ))}
      {lista.length > maximo && (
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-semibold text-texto-suave ring-2 ring-white"
          title={lista.slice(maximo).map((p) => p.nome).join(', ')}
        >
          +{lista.length - maximo}
        </span>
      )}
    </span>
  );
}

/** Seletor de uma ou várias pessoas da equipe. */
export function SeletorPessoas({
  rotulo,
  pessoas,
  selecionadas,
  aoMudar,
  multiplo = true,
  desabilitado = false,
  vazio = 'Ninguém',
}: {
  rotulo?: string;
  pessoas: PessoaEquipe[];
  selecionadas: string[];
  aoMudar: (ids: string[]) => void;
  multiplo?: boolean;
  desabilitado?: boolean;
  vazio?: string;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? pessoas.filter((p) => p.nome.toLowerCase().includes(t)) : pessoas;
  }, [pessoas, busca]);
  const escolhidas = selecionadas.map((id) => pessoas.find((p) => p.id === id)).filter(Boolean) as PessoaEquipe[];

  function alternar(id: string) {
    if (!multiplo) {
      aoMudar(selecionadas.includes(id) ? [] : [id]);
      setAberto(false);
      return;
    }
    aoMudar(selecionadas.includes(id) ? selecionadas.filter((s) => s !== id) : [...selecionadas, id]);
  }

  return (
    <div className="w-full">
      {rotulo && <span className="mb-1.5 block text-sm font-medium text-texto-suave">{rotulo}</span>}
      <div
        ref={ancora}
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-borda-forte bg-white px-2 py-1.5',
          desabilitado && 'bg-superficie',
        )}
      >
        {escolhidas.length === 0 && <span className="px-1 text-sm text-texto-fraco">{vazio}</span>}
        {escolhidas.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-superficie py-0.5 pl-0.5 pr-2 text-xs font-medium text-texto ring-1 ring-borda">
            <AvatarPessoa pessoa={p} tamanho="xs" className="ring-0" />
            {p.nome.split(' ').slice(0, 2).join(' ')}
            {!desabilitado && (
              <button type="button" onClick={() => alternar(p.id)} className="text-texto-fraco hover:text-erro" aria-label={`Remover ${p.nome}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!desabilitado && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50"
          >
            <Plus className="h-3.5 w-3.5" /> {multiplo ? 'Adicionar' : escolhidas.length ? 'Trocar' : 'Escolher'}
          </button>
        )}
      </div>

      <Popover ancora={ancora} aberto={aberto} aoFechar={() => setAberto(false)} largura="ancora" className="min-w-[240px]">
        <div className="border-b border-borda p-2">
          <div className="flex items-center gap-2 rounded-md bg-superficie px-2">
            <Search className="h-3.5 w-3.5 text-texto-fraco" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa…"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-texto-fraco"
            />
          </div>
        </div>
        <ul className="max-h-60 min-h-0 flex-1 overflow-y-auto py-1">
          {filtradas.map((p) => {
            const marcada = selecionadas.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => alternar(p.id)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-superficie', marcada && 'bg-marca-50/60')}
                >
                  <AvatarPessoa pessoa={p} tamanho="sm" className="ring-0" />
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  {marcada && <Check className="h-4 w-4 text-marca-600" />}
                </button>
              </li>
            );
          })}
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-texto-fraco">Ninguém encontrado.</li>}
        </ul>
      </Popover>
    </div>
  );
}
