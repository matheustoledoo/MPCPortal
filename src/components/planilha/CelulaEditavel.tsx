'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Check, X } from 'lucide-react';

import { Selo, cn, tomDoValor } from '@/components/ui';
import type { DefinicaoColuna } from '@/lib/colunas';
import { formatarParaExibicao, mascararPorTipo } from '@/lib/mascaras';
import { cnpjValido, normalizarCnpj, normalizarData } from '@/lib/normalizacao';

/** Valida o conteúdo digitado antes de deixar salvar. */
function validar(coluna: DefinicaoColuna, valor: string): string | null {
  const limpo = valor.trim();
  if (limpo === '') return null;

  switch (coluna.tipo) {
    case 'cnpj': {
      const digitos = normalizarCnpj(limpo);
      if (!digitos || digitos.length !== 14) return 'CNPJ deve ter 14 dígitos.';
      if (!cnpjValido(digitos)) return 'CNPJ com dígito verificador inválido.';
      return null;
    }
    case 'data':
      return normalizarData(limpo) ? null : 'Use o formato dd/mm/aaaa.';
    case 'numero': {
      const n = Number(limpo);
      if (!Number.isFinite(n)) return 'Informe um número.';
      if (coluna.campo === 'dia_vencimento' && (n < 1 || n > 31)) return 'Dia entre 1 e 31.';
      return null;
    }
    case 'moeda': {
      const n = Number(limpo.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(n)) return 'Informe um valor.';
      if (n < 0) return 'O valor não pode ser negativo.';
      return null;
    }
    default:
      return null;
  }
}

export function CelulaEditavel({
  coluna,
  valor,
  editavel,
  dicaBloqueio,
  aoSalvar,
}: {
  coluna: DefinicaoColuna;
  valor: unknown;
  editavel: boolean;
  /** Explica por que a célula está travada — some a dúvida de "por que não edito?". */
  dicaBloqueio?: string;
  aoSalvar: (novoValor: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  function iniciar() {
    if (!editavel || !coluna.editavel) return;
    const inicial =
      coluna.tipo === 'data'
        ? formatarParaExibicao('data', valor)
        : valor === null || valor === undefined
          ? ''
          : String(valor);
    setRascunho(inicial);
    setErro(null);
    setEditando(true);
  }

  async function confirmar() {
    const problema = validar(coluna, rascunho);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar(rascunho);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      void confirmar();
    }
    if (evento.key === 'Escape') {
      evento.preventDefault();
      setEditando(false);
      setErro(null);
    }
  }

  if (editando) {
    const listaId = coluna.opcoes ? `opcoes-${coluna.campo}` : undefined;

    return (
      <div className="relative flex items-center gap-1">
        <input
          ref={inputRef}
          value={rascunho}
          list={listaId}
          onChange={(e) => {
            setRascunho(mascararPorTipo(coluna.tipo, e.target.value));
            setErro(null);
          }}
          onKeyDown={aoTeclar}
          onBlur={() => !salvando && void confirmar()}
          disabled={salvando}
          className={cn(
            'w-full rounded border bg-white px-1.5 py-1 text-sm outline-none',
            erro ? 'border-erro' : 'border-marca-500 ring-2 ring-marca-100',
          )}
          aria-label={`Editar ${coluna.rotulo}`}
          aria-invalid={Boolean(erro)}
        />
        {coluna.opcoes && (
          <datalist id={listaId}>
            {coluna.opcoes.map((opcao) => (
              <option key={opcao} value={opcao} />
            ))}
          </datalist>
        )}
        {erro && (
          <div className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded border border-red-200 bg-erro-suave px-2 py-1 text-xs font-medium text-erro shadow-sm">
            {erro}
          </div>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void confirmar()}
          className="shrink-0 rounded p-0.5 text-sucesso hover:bg-sucesso-suave"
          aria-label="Confirmar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setEditando(false);
            setErro(null);
          }}
          className="shrink-0 rounded p-0.5 text-texto-fraco hover:bg-superficie"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const exibicao = formatarParaExibicao(coluna.tipo, valor);
  const vazio = exibicao === '';

  return (
    <div
      onDoubleClick={iniciar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && editavel && coluna.editavel) iniciar();
      }}
      tabIndex={editavel && coluna.editavel ? 0 : -1}
      role={editavel && coluna.editavel ? 'button' : undefined}
      title={editavel && coluna.editavel ? 'Duplo clique para editar' : dicaBloqueio}
      className={cn(
        'min-h-6 w-full truncate rounded px-1 py-0.5',
        editavel && coluna.editavel && 'cursor-cell hover:bg-marca-50',
      )}
    >
      {vazio ? (
        <span className="text-texto-fraco">—</span>
      ) : coluna.tipo === 'status' ? (
        <Selo tom={tomDoValor(exibicao)}>{exibicao}</Selo>
      ) : coluna.tipo === 'booleano' ? (
        <Selo tom={valor ? 'alerta' : 'neutro'}>{exibicao}</Selo>
      ) : coluna.tipo === 'moeda' ? (
        <span className="tabular-nums">{exibicao}</span>
      ) : (
        <span>{exibicao}</span>
      )}
    </div>
  );
}
