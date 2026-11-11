/**
 * Prospecção (CRM Metaplano) — constantes e pequenas regras de tela.
 * As regras de negócio (datas de conversão/perda, último contato, próxima
 * ação, publicação na agenda) ficam nos gatilhos da migration 0028.
 */

import type { AtividadeLead, Lead, TipoAtividadeLead } from '@/types/banco';

export const TIPOS_ATIVIDADE: { valor: Exclude<TipoAtividadeLead, 'etapa'>; rotulo: string; verbo: string }[] = [
  { valor: 'ligacao', rotulo: 'Ligação', verbo: 'Ligar' },
  { valor: 'whatsapp', rotulo: 'WhatsApp', verbo: 'Chamar no WhatsApp' },
  { valor: 'email', rotulo: 'E-mail', verbo: 'Enviar e-mail' },
  { valor: 'reuniao', rotulo: 'Reunião', verbo: 'Reunião' },
  { valor: 'visita', rotulo: 'Visita', verbo: 'Visitar' },
  { valor: 'proposta', rotulo: 'Proposta', verbo: 'Enviar proposta' },
  { valor: 'nota', rotulo: 'Anotação', verbo: 'Anotar' },
];

export function rotuloAtividade(tipo: TipoAtividadeLead): string {
  if (tipo === 'etapa') return 'Mudança de etapa';
  return TIPOS_ATIVIDADE.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const CAMPOS_LEAD =
  'id, empresa, cnpj, segmento, contato, telefone, whatsapp, email, cidade, uf, origem, responsavel_id, data_entrada, observacoes, etapa_id, etapa_desde, valor_estimado, motivo_perda, ultimo_contato_em, proxima_acao_em, convertido_em, perdido_em, empresa_id, ordem, criado_por, created_at, updated_at';

export const moeda = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const moedaCompacta = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`
    : v >= 10_000
      ? `R$ ${(v / 1000).toFixed(0)} mil`
      : moeda(v);

export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso.length <= 10 ? `${iso}T12:00:00` : iso)) / 86_400_000));
}

export const dataBr = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Link do WhatsApp Web a partir do número salvo (assume Brasil se vier sem DDI). */
export function linkWhatsApp(numero: string | null | undefined): string | null {
  const d = String(numero ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

export function proximaPendente(atividades: AtividadeLead[]): AtividadeLead | undefined {
  return atividades.filter((a) => !a.concluida).sort((a, b) => a.data.localeCompare(b.data))[0];
}

export function textoBuscaLead(l: Lead): string {
  return `${l.empresa} ${l.contato ?? ''} ${l.cnpj ?? ''} ${l.cidade ?? ''} ${l.segmento ?? ''} ${l.email ?? ''} ${l.telefone ?? ''}`.toLowerCase();
}
