'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

/**
 * Caixa flutuante presa a um elemento da tela.
 *
 * Vai para o `<body>` por portal: dentro de uma tabela com rolagem
 * (`overflow: auto`), um menu `absolute` é cortado pela borda da tabela — era
 * exatamente o que tornava ruim trocar o status e a próxima ação na linha.
 * Aqui a posição é calculada a partir do retângulo da âncora e a caixa vira
 * para cima quando não cabe embaixo.
 */
export function Popover({
  ancora,
  aberto,
  aoFechar,
  children,
  largura,
  alinhamento = 'inicio',
  className,
  /** Distância da âncora, em px. */
  espaco = 4,
}: {
  ancora: RefObject<HTMLElement | null>;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
  /** 'ancora' iguala a largura da âncora; número fixa em px. */
  largura?: number | 'ancora';
  alinhamento?: 'inicio' | 'fim';
  className?: string;
  espaco?: number;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width?: number; maxHeight: number } | null>(
    null,
  );

  const calcular = useCallback(() => {
    const alvo = ancora.current;
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    const larguraFinal = largura === 'ancora' ? r.width : largura;
    const alturaCaixa = caixa.current?.offsetHeight ?? 280;
    const larguraCaixa = larguraFinal ?? caixa.current?.offsetWidth ?? 260;

    const abaixo = window.innerHeight - r.bottom - espaco - 8;
    const acima = r.top - espaco - 8;
    const paraCima = abaixo < Math.min(alturaCaixa, 240) && acima > abaixo;

    let left = alinhamento === 'fim' ? r.right - larguraCaixa : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - larguraCaixa - 8));

    const maxHeight = Math.max(160, paraCima ? acima : abaixo);
    const top = paraCima ? Math.max(8, r.top - espaco - Math.min(alturaCaixa, maxHeight)) : r.bottom + espaco;

    setPosicao({ top, left, width: larguraFinal, maxHeight });
  }, [ancora, largura, alinhamento, espaco]);

  useLayoutEffect(() => {
    if (!aberto) {
      setPosicao(null);
      return;
    }
    calcular();
    // Segunda passada: agora a caixa já tem altura real.
    const quadro = requestAnimationFrame(calcular);
    return () => cancelAnimationFrame(quadro);
  }, [aberto, calcular]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (caixa.current?.contains(alvo) || ancora.current?.contains(alvo)) return;
      aoFechar();
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    // Rolar a página reposiciona; rolar a própria caixa não.
    function aoRolar(evento: Event) {
      if (caixa.current?.contains(evento.target as Node)) return;
      calcular();
    }
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', aoRolar, true);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', aoRolar, true);
    };
  }, [aberto, aoFechar, ancora, calcular]);

  if (!aberto || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={caixa}
      style={{
        position: 'fixed',
        top: posicao?.top ?? -9999,
        left: posicao?.left ?? -9999,
        width: posicao?.width,
        maxHeight: posicao?.maxHeight,
      }}
      className={cn(
        'animar-surgir z-[70] flex flex-col overflow-hidden rounded-xl border border-borda bg-superficie-elevada shadow-xl',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
