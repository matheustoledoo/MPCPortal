import type { ReactNode } from 'react';

/** Cabeçalho padrão das páginas do portal: título, contexto e ações. */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-borda bg-superficie-elevada px-5 py-5 sm:px-7">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-texto">{titulo}</h1>
        {descricao && <div className="mt-1 text-sm text-texto-suave">{descricao}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
