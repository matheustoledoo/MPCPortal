'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Check, ChevronDown, PenLine, Plus, X } from 'lucide-react';

import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';

/**
 * Combo com lista sugerida E digitação livre.
 *
 * A planilha original tinha listas fechadas em alguns campos. Aqui elas
 * continuam existindo — mas nenhuma impede escrever um valor que não estava
 * previsto, porque a realidade do cartório sempre inventa um caso novo. A
 * última linha do menu, "Outro…", deixa isso explícito.
 *
 * O menu abre num popover preso ao `<body>`: dentro de uma tabela com
 * rolagem ele não é mais cortado — era isso que tornava ruim trocar o status
 * e a próxima ação direto na linha do Controle Legalização.
 */
export interface PropsCombo {
  rotulo?: string;
  valor: string | null;
  opcoes: string[];
  aoMudar: (valor: string | null) => void;
  /** Chamado ao pedir para guardar um valor novo na lista do time. */
  aoAdicionarOpcao?: (valor: string) => Promise<void> | void;
  placeholder?: string;
  dica?: string;
  erro?: string;
  desabilitado?: boolean;
  /** Sem isto, o campo aceita apenas o que está na lista. */
  permiteLivre?: boolean;
  className?: string;
  autoFocus?: boolean;
  /** 'sm' para usar dentro de células de tabela. */
  tamanho?: 'sm' | 'md';
  /** Cor de fundo do campo conforme o valor (ex.: status). */
  classeValor?: string;
}

export function Combo({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  aoAdicionarOpcao,
  placeholder = 'Selecione ou digite…',
  dica,
  erro,
  desabilitado = false,
  permiteLivre = true,
  className,
  autoFocus,
  tamanho = 'md',
  classeValor,
}: PropsCombo) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [destacado, setDestacado] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [modoOutro, setModoOutro] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () => (termo ? opcoes.filter((o) => o.toLowerCase().includes(termo)) : opcoes),
    [opcoes, termo],
  );

  const textoNovo = busca.trim();
  const ehNovo =
    permiteLivre && textoNovo.length > 0 && !opcoes.some((o) => o.toLowerCase() === textoNovo.toLowerCase());

  // Índices: opções filtradas, depois "usar o texto", depois "Outro…".
  const indiceNovo = ehNovo ? filtradas.length : -1;
  const indiceOutro = permiteLivre && !ehNovo ? filtradas.length : -1;
  const total = filtradas.length + (ehNovo || permiteLivre ? 1 : 0);

  function fechar() {
    setAberto(false);
    setBusca('');
    setModoOutro(false);
  }

  function escolher(indice: number) {
    if (indice === indiceNovo) {
      aoMudar(textoNovo);
    } else if (indice === indiceOutro) {
      // "Outro…": limpa a busca e deixa o campo pronto para digitar.
      setModoOutro(true);
      setBusca('');
      requestAnimationFrame(() => entrada.current?.focus());
      return;
    } else {
      const escolhida = filtradas[indice];
      if (escolhida === undefined) return;
      aoMudar(escolhida);
    }
    fechar();
  }

  async function guardarOpcao() {
    if (!aoAdicionarOpcao || !ehNovo) return;
    setSalvando(true);
    try {
      await aoAdicionarOpcao(textoNovo);
      aoMudar(textoNovo);
      fechar();
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAberto(true);
      setDestacado((i) => Math.min(total - 1, i + 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setDestacado((i) => Math.max(0, i - 1));
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      if (modoOutro && textoNovo) {
        aoMudar(textoNovo);
        fechar();
      } else if (aberto && total > 0) escolher(destacado);
      else if (permiteLivre && textoNovo) {
        aoMudar(textoNovo);
        fechar();
      }
    } else if (evento.key === 'Escape') {
      fechar();
    } else if (evento.key === 'Tab') {
      fechar();
    }
  }

  const pequeno = tamanho === 'sm';

  return (
    <div className={cn('w-full', className)}>
      {rotulo && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}

      <div className="relative" ref={caixa}>
        <input
          id={id}
          ref={entrada}
          autoFocus={autoFocus}
          value={aberto ? busca : (valor ?? '')}
          placeholder={modoOutro ? 'Digite o valor e tecle Enter' : valor ? valor : placeholder}
          disabled={desabilitado}
          onFocus={() => {
            setAberto(true);
            setBusca('');
            setDestacado(Math.max(0, opcoes.indexOf(valor ?? '')));
          }}
          onClick={() => setAberto(true)}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
            setDestacado(0);
          }}
          onKeyDown={aoTeclar}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          title={valor ?? undefined}
          className={cn(
            'w-full rounded-lg border bg-white text-texto',
            'placeholder:text-texto-fraco transition-colors hover:border-marca-300',
            'focus:border-marca-500 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-superficie disabled:text-texto-fraco',
            pequeno ? 'h-8 pl-2 pr-12 text-xs' : 'h-10 pl-3 pr-14 text-sm',
            modoOutro ? 'border-marca-500 ring-2 ring-marca-100' : 'border-borda-forte',
            !aberto && valor && classeValor,
            erro && 'border-erro focus:border-erro',
          )}
        />

        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {valor && !desabilitado && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                aoMudar(null);
                setBusca('');
              }}
              className="rounded p-1 text-texto-fraco transition-colors hover:bg-superficie hover:text-texto"
              aria-label={`Limpar ${rotulo ?? 'seleção'}`}
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-texto-fraco transition-transform', aberto && 'rotate-180')}
          />
        </div>
      </div>

      <Popover ancora={caixa} aberto={aberto && !desabilitado} aoFechar={fechar} largura="ancora" className="min-w-[220px]">
        <ul id={`${id}-lista`} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
          {modoOutro && (
            <li className="flex items-center gap-2 border-b border-borda bg-marca-50/60 px-3 py-2 text-xs text-marca-800">
              <PenLine className="h-3.5 w-3.5 shrink-0" />
              Digite no campo acima o valor que quiser e tecle Enter.
            </li>
          )}

          {filtradas.map((opcao, indice) => (
            <li key={opcao} role="option" aria-selected={opcao === valor}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(indice)}
                onMouseEnter={() => setDestacado(indice)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                  indice === destacado ? 'bg-marca-50 text-marca-800' : 'text-texto hover:bg-superficie',
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', opcao === valor ? 'text-marca-600' : 'invisible')} />
                <span className="truncate">{opcao}</span>
              </button>
            </li>
          ))}

          {ehNovo && (
            <li className="border-t border-borda">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(indiceNovo)}
                onMouseEnter={() => setDestacado(indiceNovo)}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                  destacado === indiceNovo ? 'bg-marca-50' : 'hover:bg-superficie',
                )}
              >
                <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marca-600" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-texto">Usar “{textoNovo}”</span>
                  <span className="block text-[11px] text-texto-suave">Vale só para este registro.</span>
                </span>
              </button>

              {aoAdicionarOpcao && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void guardarOpcao()}
                  disabled={salvando}
                  className="flex w-full items-start gap-2 border-t border-borda px-3 py-2 text-left text-sm transition-colors hover:bg-superficie disabled:opacity-60"
                >
                  <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sucesso" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">
                      {salvando ? 'Salvando…' : `Guardar “${textoNovo}” na lista`}
                    </span>
                    <span className="block text-[11px] text-texto-suave">Passa a aparecer para o time inteiro.</span>
                  </span>
                </button>
              )}
            </li>
          )}

          {indiceOutro >= 0 && !modoOutro && (
            <li className="border-t border-borda">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(indiceOutro)}
                onMouseEnter={() => setDestacado(indiceOutro)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  destacado === indiceOutro ? 'bg-marca-50 text-marca-800' : 'text-texto-suave hover:bg-superficie',
                )}
              >
                <PenLine className="h-3.5 w-3.5 shrink-0 text-marca-600" />
                <span className="font-medium">Outro…</span>
                <span className="text-[11px] text-texto-fraco">escrever um valor fora da lista</span>
              </button>
            </li>
          )}

          {filtradas.length === 0 && !ehNovo && !permiteLivre && (
            <li className="px-3 py-2 text-sm text-texto-fraco">Nenhuma opção encontrada.</li>
          )}
        </ul>
      </Popover>

      {erro ? (
        <p className="mt-1.5 text-xs font-medium text-erro">{erro}</p>
      ) : dica ? (
        <p className="mt-1.5 text-xs text-texto-fraco">{dica}</p>
      ) : null}
    </div>
  );
}
