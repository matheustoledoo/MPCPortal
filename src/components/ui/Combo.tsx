'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Check, ChevronDown, Plus, X } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Combo com lista sugerida E digitação livre.
 *
 * A planilha original tinha listas fechadas em alguns campos. Aqui elas
 * continuam existindo — mas nenhuma impede escrever um valor que não estava
 * previsto, porque a realidade do cartório sempre inventa um caso novo.
 *
 * Quando o texto digitado não existe na lista, a última linha do menu
 * oferece usá-lo assim mesmo; e, para quem tem permissão, guardá-lo como
 * opção permanente do time.
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
}: PropsCombo) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [destacado, setDestacado] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora. Sem isto o menu fica preso quando o usuário
  // desiste e vai para outro campo.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      if (!caixa.current?.contains(evento.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () => (termo ? opcoes.filter((o) => o.toLowerCase().includes(termo)) : opcoes),
    [opcoes, termo],
  );

  const textoNovo = busca.trim();
  const ehNovo =
    permiteLivre &&
    textoNovo.length > 0 &&
    !opcoes.some((o) => o.toLowerCase() === textoNovo.toLowerCase());

  const total = filtradas.length + (ehNovo ? 1 : 0);

  function escolher(indice: number) {
    if (ehNovo && indice === filtradas.length) {
      aoMudar(textoNovo);
    } else {
      const escolhida = filtradas[indice];
      if (escolhida === undefined) return;
      aoMudar(escolhida);
    }
    setAberto(false);
    setBusca('');
  }

  async function guardarOpcao() {
    if (!aoAdicionarOpcao || !ehNovo) return;
    setSalvando(true);
    try {
      await aoAdicionarOpcao(textoNovo);
      aoMudar(textoNovo);
      setAberto(false);
      setBusca('');
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
      if (aberto && total > 0) escolher(destacado);
      else if (permiteLivre && textoNovo) {
        aoMudar(textoNovo);
        setAberto(false);
        setBusca('');
      }
    } else if (evento.key === 'Escape') {
      setAberto(false);
      setBusca('');
    }
  }

  return (
    <div className={cn('w-full', className)} ref={caixa}>
      {rotulo && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}

      <div className="relative">
        <input
          id={id}
          ref={entrada}
          autoFocus={autoFocus}
          value={aberto ? busca : (valor ?? '')}
          placeholder={valor ? valor : placeholder}
          disabled={desabilitado}
          onFocus={() => {
            setAberto(true);
            setBusca('');
            setDestacado(0);
          }}
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
          className={cn(
            'h-10 w-full rounded-lg border border-borda-forte bg-white pl-3 pr-14 text-sm text-texto',
            'placeholder:text-texto-fraco transition-colors hover:border-marca-300',
            'focus:border-marca-500 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-superficie disabled:text-texto-fraco',
            erro && 'border-erro focus:border-erro',
          )}
        />

        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {valor && !desabilitado && (
            <button
              type="button"
              onClick={() => {
                aoMudar(null);
                setBusca('');
                entrada.current?.focus();
              }}
              className="rounded p-1 text-texto-fraco transition-colors hover:bg-superficie hover:text-texto"
              aria-label={`Limpar ${rotulo ?? 'seleção'}`}
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-texto-fraco transition-transform',
              aberto && 'rotate-180',
            )}
          />
        </div>

        {aberto && !desabilitado && (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="animar-surgir absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-borda bg-superficie-elevada py-1 shadow-lg"
          >
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
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', opcao === valor ? 'text-marca-600' : 'invisible')}
                  />
                  <span className="truncate">{opcao}</span>
                </button>
              </li>
            ))}

            {ehNovo && (
              <li className="border-t border-borda">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(filtradas.length)}
                  onMouseEnter={() => setDestacado(filtradas.length)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                    destacado === filtradas.length ? 'bg-marca-50' : 'hover:bg-superficie',
                  )}
                >
                  <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marca-600" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">Usar “{textoNovo}”</span>
                    <span className="block text-[11px] text-texto-suave">
                      Vale só para este registro.
                    </span>
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
                      <span className="block text-[11px] text-texto-suave">
                        Passa a aparecer para o time inteiro.
                      </span>
                    </span>
                  </button>
                )}
              </li>
            )}

            {filtradas.length === 0 && !ehNovo && (
              <li className="px-3 py-2 text-sm text-texto-fraco">Nenhuma opção encontrada.</li>
            )}
          </ul>
        )}
      </div>

      {erro ? (
        <p className="mt-1.5 text-xs font-medium text-erro">{erro}</p>
      ) : dica ? (
        <p className="mt-1.5 text-xs text-texto-fraco">{dica}</p>
      ) : null}
    </div>
  );
}
