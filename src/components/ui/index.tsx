'use client';

/**
 * Componentes de interface reutilizáveis do PortalMPC.
 * Um único ponto de verdade para botões, campos, selos, modais e avisos —
 * assim os próximos módulos (Fiscal, Contábil, DP) herdam o mesmo visual.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export { cn };

/* -------------------------------------------------------------------------- */
/* Botão                                                                       */
/* -------------------------------------------------------------------------- */

type VarianteBotao = 'primario' | 'secundario' | 'sutil' | 'perigo' | 'fantasma';
type TamanhoBotao = 'sm' | 'md' | 'lg' | 'icone';

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-marca-700 text-white hover:bg-marca-800 active:bg-marca-900 shadow-sm disabled:bg-marca-300',
  secundario:
    'bg-white text-texto border border-borda-forte hover:bg-superficie hover:border-marca-300 shadow-sm',
  sutil: 'bg-marca-50 text-marca-800 hover:bg-marca-100 border border-marca-100',
  perigo: 'bg-erro text-white hover:brightness-110 active:brightness-95 shadow-sm',
  fantasma: 'text-texto-suave hover:bg-superficie hover:text-texto',
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icone: 'h-9 w-9 justify-center',
};

export interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
}

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  className,
  children,
  disabled,
  ...resto
}: PropsBotao) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      disabled={disabled || carregando}
      {...resto}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Campos de formulário                                                        */
/* -------------------------------------------------------------------------- */

const BASE_CAMPO =
  'w-full rounded-lg border border-borda-forte bg-white px-3 text-sm text-texto ' +
  'placeholder:text-texto-fraco transition-colors hover:border-marca-300 ' +
  'focus:border-marca-500 disabled:cursor-not-allowed disabled:bg-superficie disabled:text-texto-fraco';

export interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo?: string;
  erro?: string;
  dica?: string;
  iconeInicial?: ReactNode;
}

export function Campo({ rotulo, erro, dica, iconeInicial, className, id, ...resto }: PropsCampo) {
  const gerado = useId('campo');
  const idCampo = id ?? gerado;

  return (
    <div className="w-full">
      {rotulo && (
        <label htmlFor={idCampo} className="mb-1.5 block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}
      <div className="relative">
        {iconeInicial && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-fraco">
            {iconeInicial}
          </span>
        )}
        <input
          id={idCampo}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? `${idCampo}-erro` : undefined}
          className={cn(
            BASE_CAMPO,
            'h-10',
            iconeInicial && 'pl-9.5',
            erro && 'border-erro focus:border-erro',
            className,
          )}
          {...resto}
        />
      </div>
      {erro ? (
        <p id={`${idCampo}-erro`} className="mt-1.5 text-xs font-medium text-erro">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 text-xs text-texto-fraco">{dica}</p>
      ) : null}
    </div>
  );
}

export interface PropsSelecao extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo?: string;
  erro?: string;
}

export function Selecao({ rotulo, erro, className, id, children, ...resto }: PropsSelecao) {
  const gerado = useId('selecao');
  const idCampo = id ?? gerado;

  return (
    <div className="w-full">
      {rotulo && (
        <label htmlFor={idCampo} className="mb-1.5 block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}
      <select
        id={idCampo}
        className={cn(BASE_CAMPO, 'h-10 cursor-pointer pr-8', erro && 'border-erro', className)}
        {...resto}
      >
        {children}
      </select>
      {erro && <p className="mt-1.5 text-xs font-medium text-erro">{erro}</p>}
    </div>
  );
}

export interface PropsAreaTexto extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo?: string;
  erro?: string;
}

export function AreaTexto({ rotulo, erro, className, id, ...resto }: PropsAreaTexto) {
  const gerado = useId('area');
  const idCampo = id ?? gerado;

  return (
    <div className="w-full">
      {rotulo && (
        <label htmlFor={idCampo} className="mb-1.5 block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}
      <textarea
        id={idCampo}
        rows={3}
        className={cn(BASE_CAMPO, 'py-2 leading-relaxed', erro && 'border-erro', className)}
        {...resto}
      />
      {erro && <p className="mt-1.5 text-xs font-medium text-erro">{erro}</p>}
    </div>
  );
}

/** useId próprio: mantém SSR e cliente com o mesmo id sem depender da versão do React. */
function useId(prefixo: string): string {
  const ref = useRef<string>('');
  if (!ref.current) ref.current = `${prefixo}-${Math.random().toString(36).slice(2, 9)}`;
  return ref.current;
}

/* -------------------------------------------------------------------------- */
/* Selo de status                                                              */
/* -------------------------------------------------------------------------- */

type TomSelo = 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'info' | 'marca';

const TONS: Record<TomSelo, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  sucesso: 'bg-sucesso-suave text-sucesso ring-green-200',
  alerta: 'bg-alerta-suave text-alerta ring-amber-200',
  erro: 'bg-erro-suave text-erro ring-red-200',
  info: 'bg-info-suave text-info ring-blue-200',
  marca: 'bg-marca-50 text-marca-800 ring-marca-200',
};

export function Selo({
  tom = 'neutro',
  children,
  className,
}: {
  tom?: TomSelo;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Traduz valores de status da planilha em tons visuais coerentes. */
export function tomDoValor(valor: string | null | undefined): TomSelo {
  if (!valor) return 'neutro';
  const v = valor.trim().toUpperCase();
  if (['SIM', 'OK', 'ATIVO', 'DOCUMENTAÇÃO OK'].includes(v)) return 'sucesso';
  if (['NÃO', 'NAO', 'VENCIDO', 'VENCIDA', 'NÃO LOCALIZADO', 'SUSPENSO', 'NÃO EMITIDO'].includes(v))
    return 'erro';
  if (['NA', 'N/A', 'N/P', 'N/L'].includes(v)) return 'neutro';
  if (['EM ANÁLISE', 'NÃO PAGO', 'RETRABALHO'].includes(v)) return 'alerta';
  return 'info';
}

/* -------------------------------------------------------------------------- */
/* Cartão                                                                      */
/* -------------------------------------------------------------------------- */

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-borda bg-superficie-elevada shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CabecalhoCartao({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borda px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-texto">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-texto-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'md',
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const larguras = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={aoFechar}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
        className={cn(
          'animar-surgir relative w-full rounded-xl bg-superficie-elevada shadow-2xl',
          larguras[largura],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-texto">{titulo}</h2>
            {descricao && <p className="mt-1 text-sm text-texto-suave">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-superficie hover:text-texto"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>}
        {rodape && (
          <div className="flex justify-end gap-2 border-t border-borda bg-superficie px-5 py-3.5">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

/** Confirmação obrigatória antes de qualquer ação destrutiva. */
export function ModalConfirmacao({
  aberto,
  aoFechar,
  aoConfirmar,
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  perigoso = true,
  carregando = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar?: string;
  perigoso?: boolean;
  carregando?: boolean;
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={carregando}>
            Cancelar
          </Botao>
          <Botao
            variante={perigoso ? 'perigo' : 'primario'}
            onClick={aoConfirmar}
            carregando={carregando}
          >
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            perigoso ? 'bg-erro-suave text-erro' : 'bg-info-suave text-info',
          )}
        >
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <div className="text-sm leading-relaxed text-texto-suave">{mensagem}</div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Avisos (toasts)                                                             */
/* -------------------------------------------------------------------------- */

type TipoAviso = 'sucesso' | 'erro' | 'alerta' | 'info';

interface Aviso {
  id: number;
  tipo: TipoAviso;
  mensagem: string;
}

const ContextoAvisos = createContext<{
  avisar: (tipo: TipoAviso, mensagem: string) => void;
} | null>(null);

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);

  const avisar = useCallback((tipo: TipoAviso, mensagem: string) => {
    const id = proximoId.current++;
    setAvisos((atuais) => [...atuais, { id, tipo, mensagem }]);
    setTimeout(() => setAvisos((atuais) => atuais.filter((a) => a.id !== id)), 5000);
  }, []);

  const valor = useMemo(() => ({ avisar }), [avisar]);

  const icones: Record<TipoAviso, ReactNode> = {
    sucesso: <CheckCircle2 className="h-4.5 w-4.5 text-sucesso" />,
    erro: <XCircle className="h-4.5 w-4.5 text-erro" />,
    alerta: <AlertTriangle className="h-4.5 w-4.5 text-alerta" />,
    info: <Info className="h-4.5 w-4.5 text-info" />,
  };

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-full max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            className="animar-surgir pointer-events-auto flex items-start gap-2.5 rounded-lg border border-borda bg-superficie-elevada px-4 py-3 shadow-lg"
          >
            <span className="mt-0.5 shrink-0">{icones[aviso.tipo]}</span>
            <p className="flex-1 text-sm leading-snug text-texto">{aviso.mensagem}</p>
            <button
              onClick={() => setAvisos((atuais) => atuais.filter((a) => a.id !== aviso.id))}
              className="shrink-0 rounded p-0.5 text-texto-fraco transition-colors hover:text-texto"
              aria-label="Dispensar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

export function useAvisos() {
  const contexto = useContext(ContextoAvisos);
  if (!contexto) throw new Error('useAvisos precisa estar dentro de <ProvedorAvisos>.');
  return contexto;
}

/* -------------------------------------------------------------------------- */
/* Estados de carregamento / vazio / erro                                      */
/* -------------------------------------------------------------------------- */

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-texto-suave">
      <Loader2 className="h-6 w-6 animate-spin text-marca-600" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function EsqueletoLinhas({ linhas = 8 }: { linhas?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-slate-100" />
      ))}
    </div>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icone && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-50 text-marca-600">
          {icone}
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
        {descricao && <p className="mt-1 max-w-md text-sm text-texto-suave">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

export function EstadoErro({ mensagem, aoTentarNovamente }: { mensagem: string; aoTentarNovamente?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-erro-suave text-erro">
        <XCircle className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-texto">Não foi possível carregar</h3>
        <p className="mt-1 max-w-md text-sm text-texto-suave">{mensagem}</p>
      </div>
      {aoTentarNovamente && (
        <Botao variante="secundario" tamanho="sm" onClick={aoTentarNovamente}>
          Tentar novamente
        </Botao>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Indicador numérico (dashboard)                                              */
/* -------------------------------------------------------------------------- */

export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = 'marca',
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
  tom?: TomSelo;
}) {
  return (
    <Cartao className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-texto">{valor}</p>
          {detalhe && <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>}
        </div>
        {icone && (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              TONS[tom],
            )}
          >
            {icone}
          </div>
        )}
      </div>
    </Cartao>
  );
}
