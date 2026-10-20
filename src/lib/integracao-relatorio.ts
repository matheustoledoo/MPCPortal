/**
 * Relatório da integração de UM departamento — `montarRelInteg()` do
 * index.html e `integracaoHtml_()` do Codigo.gs, juntos. Só é oferecido
 * depois que o departamento finaliza o roteiro (a regra do app antigo).
 */

import { br } from '@/lib/calendario';
import { agoraBr, esc, escBr } from '@/lib/impressao';
import {
  FICHA_BASE,
  INTEG_DEPTS,
  ROTEIROS,
  condicaoAtende,
  tituloDepartamento,
  type CampoFicha,
  type DadosRoteiro,
  type DepartamentoIntegracao,
} from '@/lib/integracao';
import { formatarCnpj } from '@/lib/normalizacao';
import type { ResumoIntegracao } from '@/types/banco';

function valorFicha(c: CampoFicha, v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v);
  if (c.t === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return br(s);
  if (c.cnpj) return formatarCnpj(s);
  return s;
}

const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function relatorioIntegracaoHtml({
  depto,
  ficha,
  dados,
  atendidoPor,
  finalizadoPor,
  finalizadoEm,
  resumo,
  integracaoId,
  geradoPor,
}: {
  depto: DepartamentoIntegracao;
  ficha: Record<string, string>;
  dados: DadosRoteiro;
  atendidoPor: string;
  finalizadoPor: string;
  finalizadoEm: string | null;
  resumo: ResumoIntegracao[];
  integracaoId: string;
  geradoPor: string;
}): string {
  const R = ROTEIROS[depto];
  const linhasFicha: [string, string][] = [
    ...FICHA_BASE.map((c) => [c.l, valorFicha(c, ficha[c.id])] as [string, string]),
    ...R.ficha.map((c) => [c.l, valorFicha(c, dados.ficha?.[c.id])] as [string, string]),
  ];

  const secoes = R.secoes.map((s) => ({
    titulo: s.titulo,
    itens: s.itens.map((i) => {
      const x = dados.itens?.[i.id] ?? {};
      const partes: string[] = [];
      if (Array.isArray(x.r) && x.r.length) partes.push(x.r.join('; '));
      else if (x.r && !Array.isArray(x.r)) partes.push(`${i.opl ? `${i.opl} ` : ''}${x.r}`);
      for (const c of i.campos ?? []) {
        const v = x.c?.[c.id];
        const vv = v == null ? (c.d ?? '') : v;
        if (String(vv).trim()) partes.push(`${c.l}: ${valorFicha(c, vv)}`);
      }
      return { n: i.n, t: i.t, estrela: Boolean(i.e), ok: Boolean(x.ok), resp: partes.join('\n'), orientar: i.o ?? '', nota: x.nota ?? '' };
    }),
  }));

  if (depto === 'Qualidade') {
    secoes.push({
      titulo: 'Passagem para os departamentos',
      itens: INTEG_DEPTS.filter((d) => d !== 'Qualidade').map((d) => {
        const r = resumo.find((y) => y.integracao_id === integracaoId && y.departamento === d);
        const resp = r?.finalizado
          ? `Finalizado${r.finalizado_por ? ` por ${r.finalizado_por}` : ''}${r.finalizado_em ? ` em ${dataHora(r.finalizado_em)}` : ''}`
          : r
            ? 'Em andamento'
            : 'Não iniciado';
        return { n: '•', t: tituloDepartamento(d), estrela: false, ok: Boolean(r?.finalizado), resp, orientar: '', nota: '' };
      }),
    });
  }

  const prazos = R.prazos.map((p) => {
    const v = dados.prazos?.[p.id] ?? {};
    return [p.q, p.oq, (v.prazo ?? p.p) || 'Dia ____', v.obs ?? p.obs];
  });
  const checklist = R.checklist
    .filter((g) => condicaoAtende(g, ficha))
    .map((g) => ({ grupo: g.grupo, itens: g.itens.map(([id, t, obs]) => ({ ok: Boolean(dados.docs?.[id]), t, obs })) }));

  let h =
    `<div class="marca">PORTALMPC · META PLANO CONTÁBIL</div><h1>${esc(`Integração — ${tituloDepartamento(depto)}`)}</h1>` +
    `<div class="sub"><b>${esc(ficha.empresa ?? '')}</b>${ficha.cnpj ? ` · CNPJ ${esc(formatarCnpj(ficha.cnpj))}` : ''}` +
    `<br>Data da reunião: <b>${esc(ficha.dataReuniao ? br(ficha.dataReuniao) : '—')}</b> · Atendido por: <b>${esc(atendidoPor || '—')}</b>` +
    `<br>Finalizado por ${esc(finalizadoPor || geradoPor)}${finalizadoEm ? ` em ${esc(dataHora(finalizadoEm))}` : ''} · Relatório gerado por ${esc(geradoPor)} em ${esc(agoraBr())}</div>`;

  if (linhasFicha.length) {
    h += '<h2>Ficha do cliente</h2><table>';
    for (const [k, v] of linhasFicha) h += `<tr><td class="k">${esc(k)}</td><td>${escBr(v || '—')}</td></tr>`;
    h += '</table>';
  }
  for (const s of secoes) {
    h += `<h2>${esc(s.titulo)}</h2>`;
    for (const i of s.itens) {
      h +=
        `<div class="it"><span class="${i.ok ? 'ok' : 'no'}">${i.ok ? '☑' : '☐'}</span> <b>${esc(i.n)} ${esc(i.t)}</b>${i.estrela ? ' ★' : ''}` +
        (i.resp ? `<div class="r">Resposta: <b>${escBr(i.resp)}</b></div>` : '') +
        (i.orientar ? `<div class="o">Orientação: ${escBr(i.orientar)}</div>` : '') +
        (i.nota ? `<div class="n">Anotações: ${escBr(i.nota)}</div>` : '') +
        '</div>';
    }
  }
  if (prazos.length) {
    h += '<h2>Prazos combinados</h2><table><tr><th>Quem envia</th><th>O quê</th><th>Prazo</th><th>Observação</th></tr>';
    for (const p of prazos) h += `<tr><td>${esc(p[0])}</td><td>${esc(p[1])}</td><td><b>${esc(p[2])}</b></td><td>${esc(p[3])}</td></tr>`;
    h += '</table>';
  }
  h +=
    `<h2>Combinados e próximos passos</h2><div>${escBr(dados.combinados || 'Nenhum combinado anotado.')}</div>` +
    (dados.retorno ? `<p>Retorno de acompanhamento agendado para <b>${esc(br(dados.retorno))}</b>.</p>` : '');
  if (checklist.length) {
    h += '<h2>Checklist de documentos</h2><table><tr><th style="width:9%">Recebido</th><th>Documento</th><th>Observação</th></tr>';
    for (const g of checklist) {
      h += `<tr><td colspan="3" style="background:#f1f5f9;font-weight:700">${esc(g.grupo)}</td></tr>`;
      for (const i of g.itens) h += `<tr><td class="${i.ok ? 'ok' : 'no'}">${i.ok ? '☑' : '☐'}</td><td>${esc(i.t)}</td><td>${esc(i.obs)}</td></tr>`;
    }
    h += '</table>';
  }
  h += `<table class="ass"><tr><td><div>Cliente</div></td><td><div>${esc(R.assinatura || 'Responsável — Meta Plano')}</div></td></tr></table>`;
  return h;
}
