import { cn } from '@/lib/cn';

/** Marca do PortalMPC. Monograma em SVG para não depender de arquivo externo. */
export function MarcaMPC({
  tamanho = 'md',
  invertido = false,
  className,
}: {
  tamanho?: 'sm' | 'md' | 'lg';
  invertido?: boolean;
  className?: string;
}) {
  const dimensoes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' };
  const textos = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 40 40"
        className={cn(dimensoes[tamanho], 'shrink-0')}
        aria-hidden
        role="presentation"
      >
        <rect width="40" height="40" rx="9" fill={invertido ? '#ffffff' : '#2b5089'} />
        <path
          d="M9 28V12h4.2l4.3 8.4 4.3-8.4H26v16h-3.6V18.3l-3.6 6.9h-2.1l-3.6-6.9V28H9Z"
          fill={invertido ? '#2b5089' : '#ffffff'}
        />
        <circle cx="29.5" cy="26.5" r="3.2" fill={invertido ? '#2b5089' : '#99bee3'} />
      </svg>
      <span className={cn('font-semibold tracking-tight', textos[tamanho], invertido && 'text-white')}>
        Portal<span className={invertido ? 'text-marca-200' : 'text-marca-600'}>MPC</span>
      </span>
    </div>
  );
}
