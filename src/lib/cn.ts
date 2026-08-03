import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes do Tailwind resolvendo conflitos (a última vence).
 *
 * Fica fora de `components/ui` de propósito: aquele módulo é `'use client'`,
 * e um Server Component não pode chamar função exportada de módulo cliente.
 */
export function cn(...classes: Parameters<typeof clsx>): string {
  return twMerge(clsx(classes));
}
