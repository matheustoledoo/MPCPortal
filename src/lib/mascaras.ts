/**
 * Máscaras de digitação e formatação de exibição.
 * As máscaras rodam durante a digitação; a normalização definitiva para o
 * banco fica em `normalizacao.ts`, compartilhada com o ETL.
 */

import { formatarCnpj, formatarData, formatarMoeda, formatarTelefone } from '@/lib/normalizacao';
import type { TipoColuna } from '@/lib/colunas';

/** 00.000.000/0000-00 conforme o usuário digita. */
export function mascararCnpj(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** (00) 00000-0000 conforme o usuário digita. */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

/** dd/mm/aaaa conforme o usuário digita. */
export function mascararData(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8);
  return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
}

/** Aplica a máscara correspondente ao tipo da coluna. */
export function mascararPorTipo(tipo: TipoColuna, valor: string): string {
  switch (tipo) {
    case 'cnpj':
      return mascararCnpj(valor);
    case 'data':
      return mascararData(valor);
    case 'numero':
      return valor.replace(/\D/g, '').slice(0, 3);
    case 'moeda':
      return valor.replace(/[^\d.,]/g, '');
    default:
      return valor;
  }
}

/** Como o valor aparece na célula da planilha. */
export function formatarParaExibicao(tipo: TipoColuna, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '';

  switch (tipo) {
    case 'cnpj':
      return formatarCnpj(valor);
    case 'data':
      return formatarData(valor);
    case 'moeda':
      return formatarMoeda(typeof valor === 'number' ? valor : Number(valor));
    case 'booleano':
      return valor ? 'Sim' : 'Não';
    default:
      return String(valor);
  }
}

export { formatarCnpj, formatarData, formatarMoeda, formatarTelefone };
