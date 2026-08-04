/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/cn';

/**
 * Marca do PortalMPC (Meta Plano Contábil).
 *
 * A arte vem de `public/`, não do código: para usar o arquivo oficial basta
 * substituir `public/logo-metaplano.svg` (lockup completo) e
 * `public/simbolo-metaplano.svg` (só o símbolo, usado no menu recolhido).
 * Aceita .svg ou .png — se trocar a extensão, ajuste apenas as constantes
 * abaixo.
 *
 * Usa <img> em vez de next/image de propósito: é um SVG estático e local,
 * sem ganho em passar pelo otimizador.
 */

const LOGO_COMPLETA = '/logo-metaplano.svg';
const SIMBOLO = '/simbolo-metaplano.svg';

const ALTURAS = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
} as const;

export function MarcaMPC({
  tamanho = 'md',
  /** Em fundo escuro a logo colorida fica sobre um cartão claro, para manter contraste. */
  invertido = false,
  /** Mostra apenas o símbolo, sem a marca nominal. */
  somenteSimbolo = false,
  className,
}: {
  tamanho?: keyof typeof ALTURAS;
  invertido?: boolean;
  somenteSimbolo?: boolean;
  className?: string;
}) {
  const imagem = (
    <img
      src={somenteSimbolo ? SIMBOLO : LOGO_COMPLETA}
      alt="Meta Plano Contábil"
      className={cn(ALTURAS[tamanho], 'w-auto')}
    />
  );

  if (!invertido) {
    return <div className={cn('flex items-center', className)}>{imagem}</div>;
  }

  return (
    <div
      className={cn(
        // `w-fit self-start` impede que o cartão estique junto com a coluna flex.
        'inline-flex w-fit self-start items-center rounded-xl bg-white shadow-sm ring-1 ring-white/25',
        tamanho === 'sm' ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5',
        className,
      )}
    >
      {imagem}
    </div>
  );
}
