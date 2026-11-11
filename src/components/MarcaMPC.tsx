/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/cn';

/**
 * Marca do PortalMPC (Meta Plano Contábil).
 *
 * A arte é o arquivo oficial enviado pela Meta Plano, sem redesenho:
 * `public/logo-meta-plano.png` (logo completa, fundo transparente) e
 * `public/simbolo-meta-plano.png` (o mesmo arquivo recortado acima da marca
 * nominal, para o menu recolhido e a barra do celular). Para trocar a arte,
 * substitua os arquivos mantendo os nomes.
 *
 * Usa <img> em vez de next/image de propósito: é uma imagem estática e
 * pequena; a proporção original é preservada (`w-auto` + `object-contain`).
 */

const LOGO_COMPLETA = '/logo-meta-plano.png';
const SIMBOLO = '/simbolo-meta-plano.png';

const ALTURAS = {
  sm: 'h-12',
  md: 'h-16',
  lg: 'h-24',
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
      className={cn(somenteSimbolo && tamanho === 'sm' ? 'h-8' : ALTURAS[tamanho], 'w-auto object-contain')}
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
