'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Building2, Loader2, Search, X } from 'lucide-react';

import { Selo, cn } from '@/components/ui';
import { formatarCnpj } from '@/lib/normalizacao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { EmpresaSugerida } from '@/types/banco';

/**
 * Autocomplete de empresa por nome, CNPJ ou código.
 *
 * Enquanto se digita, consulta `buscar_empresas_para_processo` — que já roda
 * sob a RLS de Legalização. Ao escolher, devolve a empresa inteira para quem
 * chamou preencher os demais campos: é o "quando seleciona, preenche o
 * resto" pedido.
 *
 * Empresa fora da base também é aceita: o texto digitado vira o nome do
 * processo e `empresa_id` fica nulo, o que cobre abertura de CNPJ novo.
 */
export function BuscaEmpresa({
  rotulo = 'Empresa',
  valor,
  aoEscolher,
  aoDigitarLivre,
  desabilitado = false,
  autoFocus,
  dica,
  erro,
}: {
  rotulo?: string;
  /** Nome já preenchido, quando está editando um processo existente. */
  valor: string;
  aoEscolher: (empresa: EmpresaSugerida) => void;
  /** Texto digitado que não corresponde a nenhuma empresa da base. */
  aoDigitarLivre: (texto: string) => void;
  desabilitado?: boolean;
  autoFocus?: boolean;
  dica?: string;
  erro?: string;
}) {
  const id = useId();
  const supabase = useRef(criarClienteNavegador());
  const caixa = useRef<HTMLDivElement>(null);

  const [texto, setTexto] = useState(valor);
  const [sugestoes, setSugestoes] = useState<EmpresaSugerida[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [destacado, setDestacado] = useState(0);
  const [escolhida, setEscolhida] = useState<EmpresaSugerida | null>(null);

  useEffect(() => setTexto(valor), [valor]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  // Debounce: uma consulta por pausa na digitação, não por tecla.
  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2 || escolhida?.razao_social === termo) {
      setSugestoes([]);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data, error } = await supabase.current.rpc('buscar_empresas_para_processo', {
          p_termo: termo,
        });
        if (cancelado) return;
        if (error) throw new Error(error.message);
        setSugestoes((data ?? []) as unknown as EmpresaSugerida[]);
        setDestacado(0);
      } catch {
        if (!cancelado) setSugestoes([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [texto, escolhida]);

  function selecionar(empresa: EmpresaSugerida) {
    setEscolhida(empresa);
    setTexto(empresa.razao_social);
    setAberto(false);
    aoEscolher(empresa);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAberto(true);
      setDestacado((i) => Math.min(sugestoes.length - 1, i + 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setDestacado((i) => Math.max(0, i - 1));
    } else if (evento.key === 'Enter' && aberto && sugestoes[destacado]) {
      evento.preventDefault();
      selecionar(sugestoes[destacado]);
    } else if (evento.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="w-full" ref={caixa}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-texto-suave">
        {rotulo}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" />
        <input
          id={id}
          value={texto}
          autoFocus={autoFocus}
          disabled={desabilitado}
          placeholder="Nome, CNPJ ou código do cliente…"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setEscolhida(null);
            setAberto(true);
            aoDigitarLivre(e.target.value);
          }}
          onKeyDown={aoTeclar}
          className={cn(
            'h-10 w-full rounded-lg border border-borda-forte bg-white pl-9.5 pr-9 text-sm text-texto',
            'placeholder:text-texto-fraco transition-colors hover:border-marca-300',
            'focus:border-marca-500 focus:outline-none disabled:bg-superficie',
            erro && 'border-erro',
          )}
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {buscando ? (
            <Loader2 className="h-4 w-4 animate-spin text-marca-600" />
          ) : texto && !desabilitado ? (
            <button
              type="button"
              onClick={() => {
                setTexto('');
                setEscolhida(null);
                setSugestoes([]);
                aoDigitarLivre('');
              }}
              className="rounded p-0.5 text-texto-fraco hover:text-texto"
              aria-label="Limpar empresa"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {aberto && sugestoes.length > 0 && (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="animar-surgir absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-borda bg-superficie-elevada py-1 shadow-lg"
          >
            {sugestoes.map((empresa, indice) => (
              <li key={empresa.id} role="option" aria-selected={indice === destacado}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selecionar(empresa)}
                  onMouseEnter={() => setDestacado(indice)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                    indice === destacado ? 'bg-marca-50' : 'hover:bg-superficie',
                  )}
                >
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-marca-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-texto">
                      {empresa.razao_social}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-texto-suave">
                      {empresa.cnpj && <span className="tabular-nums">{formatarCnpj(empresa.cnpj)}</span>}
                      {empresa.cidade && <span>· {empresa.cidade}</span>}
                      {empresa.codigo && <span>· cód. {empresa.codigo}</span>}
                    </span>
                  </span>
                  {empresa.processos_abertos > 0 && (
                    <Selo tom="alerta" className="shrink-0 text-[10px]">
                      {empresa.processos_abertos} aberto{empresa.processos_abertos > 1 ? 's' : ''}
                    </Selo>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro ? (
        <p className="mt-1.5 text-xs font-medium text-erro">{erro}</p>
      ) : (
        <p className="mt-1.5 text-xs text-texto-fraco">
          {escolhida
            ? `Vinculado ao cadastro${escolhida.cidade ? ` · ${escolhida.cidade}` : ''}.`
            : (dica ?? 'Empresa fora da base também vale — o vínculo é criado quando o CNPJ passar a existir.')}
        </p>
      )}
    </div>
  );
}
