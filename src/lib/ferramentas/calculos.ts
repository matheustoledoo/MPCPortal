/**
 * Núcleo de cálculo das Ferramentas — funções puras.
 *
 * Nenhuma alíquota, faixa ou limite está escrito aqui: tudo chega pelas
 * tabelas de `ferramentas_tabelas` (com fonte legal e vigência), que o
 * administrador atualiza sem reconstruir o sistema. Este arquivo só conhece
 * a MECÂNICA de cada cálculo, e por isso pode ser testado com valores
 * conhecidos (`calculos.test.ts`).
 */

/* -------------------------------------------------------------------------- */
/* Tabelas                                                                     */
/* -------------------------------------------------------------------------- */

export interface TabInss { teto: number; faixas: { ate: number; aliquota: number }[] }
export interface TabInssIndividual { minimo: number; teto: number; aliquota_prolabore: number; aliquota_normal: number; aliquota_simplificado: number; aliquota_mei: number; patronal: number }
export interface TabIrrf {
  dependente: number;
  desconto_simplificado: number;
  faixas: { ate: number | null; aliquota: number; deducao: number }[];
  reducao?: { isento_ate: number; limite: number; valor_maximo: number; constante: number; fator: number };
}
export interface TabFgts { aliquota: number; aliquota_aprendiz: number; multa_sem_justa_causa: number; multa_acordo: number }
export interface TabAviso { dias_base: number; dias_por_ano: number; maximo: number }
export interface TabMei { limite_anual: number; inss_percentual: number; icms: number; iss: number; caminhoneiro_percentual: number; limite_caminhoneiro: number }
export interface FaixaSimples { ate: number; aliquota: number; deducao: number; reparticao: number[] }
export interface TabSimples { limite: number; sublimite: number; fator_r: number; anexos: Record<string, { nome: string; tributos: string[]; faixas: FaixaSimples[] }> }
export interface TabPresumido {
  irpj: number; adicional_irpj: number; limite_adicional_mensal: number; csll: number; pis: number; cofins: number;
  presuncao: Record<string, { nome: string; irpj: number; csll: number }>;
  acrescimo_lc224?: { percentual: number; limite_anual: number; irpj_desde: string; csll_desde: string };
}
export interface TabReal { irpj: number; adicional_irpj: number; limite_adicional_mensal: number; csll: number; pis: number; cofins: number }
export interface TabAcrescimos { multa_dia: number; multa_teto: number; juros_mes_pagamento: number }

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** Arredonda para centavos (meio para cima). */
export const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number, casas = 2) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

const data = (iso: string) => new Date(`${iso}T12:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dataBr = (s: string) => s.split('-').reverse().join('/');

/* -------------------------------------------------------------------------- */
/* INSS                                                                        */
/* -------------------------------------------------------------------------- */

export interface ResultadoInss {
  base: number;
  valor: number;
  efetiva: number;
  acimaDoTeto: boolean;
  faixas: { de: number; ate: number; aliquota: number; base: number; valor: number }[];
}

/** Tabela progressiva: cada alíquota incide só sobre a parcela do salário na sua faixa. */
export function inssEmpregado(salario: number, tab: TabInss): ResultadoInss {
  const base = Math.min(Math.max(0, salario), tab.teto);
  let anterior = 0;
  let total = 0;
  const faixas: ResultadoInss['faixas'] = [];
  for (const f of tab.faixas) {
    if (base <= anterior) break;
    const parcela = Math.min(base, f.ate) - anterior;
    const valor = (parcela * f.aliquota) / 100;
    faixas.push({ de: anterior, ate: f.ate, aliquota: f.aliquota, base: arred(parcela), valor: arred(valor) });
    total += valor;
    anterior = f.ate;
  }
  const valor = arred(total);
  return { base, valor, efetiva: salario > 0 ? (valor / salario) * 100 : 0, acimaDoTeto: salario > tab.teto, faixas };
}

/** Contribuinte individual / pró-labore: alíquota única sobre o valor, limitado ao teto. */
export function inssIndividual(valor: number, aliquota: number, tab: TabInssIndividual) {
  const base = Math.min(Math.max(0, valor), tab.teto);
  return { base, valor: arred((base * aliquota) / 100), acimaDoTeto: valor > tab.teto, abaixoDoMinimo: valor > 0 && valor < tab.minimo };
}

/* -------------------------------------------------------------------------- */
/* IRRF                                                                        */
/* -------------------------------------------------------------------------- */

export interface EntradaIrrf { rendimento: number; inss: number; dependentes: number; pensao: number; outras: number }
export interface ResultadoIrrf {
  deducoesLegais: number;
  descontoSimplificado: number;
  usouSimplificado: boolean;
  base: number;
  aliquota: number;
  parcelaADeduzir: number;
  impostoTabela: number;
  reducao: number;
  imposto: number;
  efetiva: number;
}

export function irrfMensal(e: EntradaIrrf, tab: TabIrrf): ResultadoIrrf {
  const rendimento = Math.max(0, e.rendimento);
  const deducoesLegais = arred(e.inss + e.dependentes * tab.dependente + e.pensao + e.outras);
  // O desconto simplificado substitui todas as deduções legais; vale o que for melhor para o contribuinte.
  const usouSimplificado = tab.desconto_simplificado > deducoesLegais;
  const base = arred(Math.max(0, rendimento - (usouSimplificado ? tab.desconto_simplificado : deducoesLegais)));
  const faixa = tab.faixas.find((f) => f.ate === null || base <= f.ate) ?? tab.faixas[tab.faixas.length - 1];
  const impostoTabela = arred(Math.max(0, (base * faixa.aliquota) / 100 - faixa.deducao));

  let reducao = 0;
  const r = tab.reducao;
  if (r && impostoTabela > 0) {
    if (rendimento <= r.isento_ate) reducao = Math.min(impostoTabela, r.valor_maximo);
    else if (rendimento <= r.limite) reducao = Math.min(impostoTabela, Math.max(0, r.constante - r.fator * rendimento));
  }
  reducao = arred(reducao);
  const imposto = arred(Math.max(0, impostoTabela - reducao));
  return {
    deducoesLegais,
    descontoSimplificado: tab.desconto_simplificado,
    usouSimplificado,
    base,
    aliquota: faixa.aliquota,
    parcelaADeduzir: faixa.deducao,
    impostoTabela,
    reducao,
    imposto,
    efetiva: rendimento > 0 ? (imposto / rendimento) * 100 : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Folha: salário líquido, pró-labore, férias, 13º                             */
/* -------------------------------------------------------------------------- */

export function salarioLiquido(
  e: { bruto: number; dependentes: number; pensao: number; outrosDescontos: number },
  inssTab: TabInss,
  irrfTab: TabIrrf,
) {
  const inss = inssEmpregado(e.bruto, inssTab);
  const irrf = irrfMensal({ rendimento: e.bruto, inss: inss.valor, dependentes: e.dependentes, pensao: e.pensao, outras: 0 }, irrfTab);
  const liquido = arred(e.bruto - inss.valor - irrf.imposto - e.pensao - e.outrosDescontos);
  return { inss, irrf, liquido };
}

export function proLabore(
  e: { valor: number; dependentes: number; pensao: number; cppForaDoDas: boolean },
  indTab: TabInssIndividual,
  irrfTab: TabIrrf,
) {
  const inss = inssIndividual(e.valor, indTab.aliquota_prolabore, indTab);
  const irrf = irrfMensal({ rendimento: e.valor, inss: inss.valor, dependentes: e.dependentes, pensao: e.pensao, outras: 0 }, irrfTab);
  const patronal = e.cppForaDoDas ? arred((e.valor * indTab.patronal) / 100) : 0;
  return { inss, irrf, patronal, liquido: arred(e.valor - inss.valor - irrf.imposto - e.pensao), custoTotal: arred(e.valor + patronal) };
}

export function ferias(
  e: { salario: number; dias: number; abonoDias: number; dependentes: number },
  inssTab: TabInss,
  irrfTab: TabIrrf,
) {
  const valorDia = e.salario / 30;
  const valorFerias = arred(valorDia * e.dias);
  const terco = arred(valorFerias / 3);
  const abono = arred(valorDia * e.abonoDias);
  const tercoAbono = arred(abono / 3);
  const tributavel = arred(valorFerias + terco);
  const inss = inssEmpregado(tributavel, inssTab);
  const irrf = irrfMensal({ rendimento: tributavel, inss: inss.valor, dependentes: e.dependentes, pensao: 0, outras: 0 }, irrfTab);
  return { valorFerias, terco, abono, tercoAbono, tributavel, inss, irrf, liquido: arred(tributavel + abono + tercoAbono - inss.valor - irrf.imposto) };
}

export function decimoTerceiro(
  e: { salario: number; meses: number; dependentes: number },
  inssTab: TabInss,
  irrfTab: TabIrrf,
) {
  const meses = Math.min(12, Math.max(0, Math.floor(e.meses)));
  const bruto = arred((e.salario / 12) * meses);
  const primeira = arred(bruto / 2);
  const inss = inssEmpregado(bruto, inssTab);
  // Tributação exclusiva na fonte, sobre o valor integral, na 2ª parcela.
  const irrf = irrfMensal({ rendimento: bruto, inss: inss.valor, dependentes: e.dependentes, pensao: 0, outras: 0 }, irrfTab);
  const segunda = arred(bruto - primeira - inss.valor - irrf.imposto);
  return { meses, bruto, primeira, inss, irrf, segunda, liquido: arred(primeira + segunda) };
}

/* -------------------------------------------------------------------------- */
/* Rescisão                                                                    */
/* -------------------------------------------------------------------------- */

export type MotivoRescisao = 'sem_justa_causa' | 'pedido_demissao' | 'justa_causa' | 'acordo' | 'termino_contrato';
export type AvisoPrevio = 'indenizado' | 'trabalhado' | 'nao_cumprido';

/** Dias de aviso prévio proporcional: base + dias por ano completo, até o máximo. */
export function diasAvisoPrevio(admissao: string, desligamento: string, tab: TabAviso): number {
  const a = data(admissao);
  const d = data(desligamento);
  let anos = d.getFullYear() - a.getFullYear();
  if (d.getMonth() < a.getMonth() || (d.getMonth() === a.getMonth() && d.getDate() < a.getDate())) anos--;
  return Math.min(tab.maximo, tab.dias_base + Math.max(0, anos) * tab.dias_por_ano);
}

/** Avos de 13º no ano do desligamento: mês conta com 15 dias ou mais trabalhados. */
export function avosDecimoTerceiro(admissao: string, fim: string): number {
  const a = data(admissao);
  const f = data(fim);
  let avos = 0;
  for (let m = 0; m <= f.getMonth(); m++) {
    const inicioMes = new Date(f.getFullYear(), m, 1, 12);
    const fimMes = new Date(f.getFullYear(), m + 1, 0, 12);
    const de = a > inicioMes ? a : inicioMes;
    const ate = f < fimMes ? f : fimMes;
    const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1;
    if (dias >= 15) avos++;
  }
  return avos;
}

/** Avos de férias proporcionais desde o último aniversário da admissão (fração de 15 dias ou mais conta um mês). */
export function avosFerias(admissao: string, fim: string): number {
  const a = data(admissao);
  const f = data(fim);
  let inicio = new Date(f.getFullYear(), a.getMonth(), a.getDate(), 12);
  if (inicio > f) inicio = new Date(f.getFullYear() - 1, a.getMonth(), a.getDate(), 12);
  let meses = 0;
  let cursor = new Date(inicio);
  for (;;) {
    const proximo = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), 12);
    // O período termina na véspera do "aniversário" mensal.
    const fimPeriodo = new Date(proximo.getTime() - 86_400_000);
    if (fimPeriodo <= f) {
      meses++;
      cursor = proximo;
    } else {
      const dias = Math.round((f.getTime() - cursor.getTime()) / 86_400_000) + 1;
      if (dias >= 15) meses++;
      break;
    }
    if (meses >= 12) break;
  }
  return Math.min(12, meses);
}

export interface EntradaRescisao {
  salario: number;
  admissao: string;
  desligamento: string;
  motivo: MotivoRescisao;
  aviso: AvisoPrevio;
  feriasVencidasDias: number;
  saldoFgts: number;
  dependentes: number;
}

export function rescisao(e: EntradaRescisao, t: { inss: TabInss; irrf: TabIrrf; fgts: TabFgts; aviso: TabAviso }) {
  const valorDia = e.salario / 30;
  const fim = data(e.desligamento);
  const temAviso = e.motivo === 'sem_justa_causa' || e.motivo === 'acordo';
  const diasAviso = diasAvisoPrevio(e.admissao, e.desligamento, t.aviso);

  // Aviso indenizado: integral na dispensa sem justa causa, metade no acordo (CLT, art. 484-A).
  const diasIndenizados = temAviso && e.aviso === 'indenizado' ? (e.motivo === 'acordo' ? diasAviso / 2 : diasAviso) : 0;
  const avisoIndenizado = arred(valorDia * diasIndenizados);
  // O aviso indenizado projeta o contrato para 13º e férias (CLT, art. 487, § 1º).
  const projetado = new Date(fim);
  projetado.setDate(projetado.getDate() + Math.round(diasIndenizados));
  const fimProjetado = iso(projetado);

  const diasSaldo = Math.min(30, fim.getDate());
  const saldoSalario = arred(valorDia * diasSaldo);

  const semProporcionais = e.motivo === 'justa_causa';
  const avos13 = semProporcionais ? 0 : avosDecimoTerceiro(e.admissao, fimProjetado);
  const decimo = arred((e.salario / 12) * avos13);
  const avosFer = semProporcionais ? 0 : avosFerias(e.admissao, fimProjetado);
  const feriasProporcionais = arred((e.salario / 12) * avosFer);
  const feriasVencidas = arred(valorDia * e.feriasVencidasDias);
  const tercoFerias = arred((feriasProporcionais + feriasVencidas) / 3);

  // Pedido de demissão sem cumprir o aviso: a empresa pode descontar o período (CLT, art. 487, § 2º).
  const descontoAviso = e.motivo === 'pedido_demissao' && e.aviso === 'nao_cumprido' ? arred(e.salario) : 0;

  // FGTS do mês e multa rescisória.
  const baseFgtsRescisao = saldoSalario + decimo + avisoIndenizado;
  const fgtsRescisao = arred((baseFgtsRescisao * t.fgts.aliquota) / 100);
  const percentualMulta = e.motivo === 'sem_justa_causa' ? t.fgts.multa_sem_justa_causa : e.motivo === 'acordo' ? t.fgts.multa_acordo : 0;
  const multaFgts = arred(((e.saldoFgts + fgtsRescisao) * percentualMulta) / 100);

  // INSS e IRRF: saldo de salário e 13º são tributados separadamente; verbas indenizatórias ficam fora.
  const inssSaldo = inssEmpregado(saldoSalario, t.inss);
  const inss13 = inssEmpregado(decimo, t.inss);
  const irrfSaldo = irrfMensal({ rendimento: saldoSalario, inss: inssSaldo.valor, dependentes: e.dependentes, pensao: 0, outras: 0 }, t.irrf);
  const irrf13 = irrfMensal({ rendimento: decimo, inss: inss13.valor, dependentes: e.dependentes, pensao: 0, outras: 0 }, t.irrf);

  const proventos = arred(saldoSalario + avisoIndenizado + decimo + feriasProporcionais + feriasVencidas + tercoFerias);
  const descontos = arred(inssSaldo.valor + inss13.valor + irrfSaldo.imposto + irrf13.imposto + descontoAviso);
  return {
    diasAviso, diasIndenizados, fimProjetado, diasSaldo, saldoSalario, avisoIndenizado, avos13, decimo, avosFer, feriasProporcionais, feriasVencidas, tercoFerias,
    descontoAviso, fgtsRescisao, percentualMulta, multaFgts, inssSaldo, inss13, irrfSaldo, irrf13, proventos, descontos,
    liquido: arred(proventos - descontos),
    saqueFgts: e.motivo === 'sem_justa_causa' || e.motivo === 'termino_contrato' ? 100 : e.motivo === 'acordo' ? 80 : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Simples Nacional                                                            */
/* -------------------------------------------------------------------------- */

export interface ResultadoSimples {
  anexo: string;
  faixa: number;
  aliquotaNominal: number;
  deducao: number;
  aliquotaEfetiva: number;
  das: number;
  reparticao: { tributo: string; percentual: number; valor: number }[];
  issLimitado: boolean;
  acimaDoSublimite: boolean;
  acimaDoLimite: boolean;
}

/** Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 (LC 123, art. 18, § 1º-A). */
export function simplesNacional(e: { rbt12: number; receitaMes: number; anexo: string }, tab: TabSimples): ResultadoSimples | { erro: string } {
  const anexo = tab.anexos[e.anexo];
  if (!anexo) return { erro: 'Anexo não encontrado na tabela do Simples.' };
  if (e.rbt12 <= 0) return { erro: 'Informe a receita bruta acumulada dos 12 meses anteriores (RBT12).' };
  const indice = anexo.faixas.findIndex((f) => e.rbt12 <= f.ate);
  const i = indice === -1 ? anexo.faixas.length - 1 : indice;
  const f = anexo.faixas[i];
  const efetiva = ((e.rbt12 * f.aliquota) / 100 - f.deducao) / e.rbt12 * 100;

  // ISS dentro do DAS é limitado a 5% efetivos; o excedente vai, proporcionalmente, aos tributos federais.
  let percentuais = [...f.reparticao];
  let issLimitado = false;
  const posIss = anexo.tributos.indexOf('ISS');
  if (posIss >= 0 && efetiva > 0) {
    const issEfetivo = (efetiva * percentuais[posIss]) / 100;
    if (issEfetivo > 5) {
      issLimitado = true;
      const issPerc = (5 / efetiva) * 100;
      const sobra = percentuais[posIss] - issPerc;
      const somaOutros = percentuais.reduce((s, p, k) => (k === posIss ? s : s + p), 0);
      percentuais = percentuais.map((p, k) => (k === posIss ? issPerc : p + (sobra * p) / somaOutros));
    }
  }
  const das = arred((e.receitaMes * efetiva) / 100);
  return {
    anexo: e.anexo,
    faixa: i + 1,
    aliquotaNominal: f.aliquota,
    deducao: f.deducao,
    aliquotaEfetiva: efetiva,
    das,
    reparticao: anexo.tributos.map((tributo, k) => ({ tributo, percentual: percentuais[k], valor: arred((das * percentuais[k]) / 100) })),
    issLimitado,
    acimaDoSublimite: e.rbt12 > tab.sublimite,
    acimaDoLimite: e.rbt12 > tab.limite,
  };
}

/** Fator R = folha de salários (12 meses) ÷ receita bruta (12 meses). A partir do percentual da tabela, Anexo III; abaixo, Anexo V. */
export function fatorR(folha12: number, rbt12: number, tab: TabSimples) {
  const fator = rbt12 > 0 ? (folha12 / rbt12) * 100 : 0;
  return { fator, anexo: fator >= tab.fator_r ? 'III' : 'V' };
}

export function dasMei(e: { atividade: 'comercio' | 'servicos' | 'ambos'; caminhoneiro: boolean }, salarioMinimo: number, tab: TabMei) {
  const inss = arred((salarioMinimo * (e.caminhoneiro ? tab.caminhoneiro_percentual : tab.inss_percentual)) / 100);
  const icms = e.atividade !== 'servicos' ? tab.icms : 0;
  const iss = e.atividade !== 'comercio' ? tab.iss : 0;
  return { inss, icms, iss, total: arred(inss + icms + iss), limite: e.caminhoneiro ? tab.limite_caminhoneiro : tab.limite_anual };
}

/* -------------------------------------------------------------------------- */
/* Lucro Presumido e Lucro Real                                                */
/* -------------------------------------------------------------------------- */

export function lucroPresumido(e: { receita: number; atividade: string; meses: number }, tab: TabPresumido) {
  const p = tab.presuncao[e.atividade];
  if (!p) return { erro: 'Atividade não encontrada na tabela do Lucro Presumido.' } as const;
  const baseIrpj = arred((e.receita * p.irpj) / 100);
  const baseCsll = arred((e.receita * p.csll) / 100);
  const irpj = arred((baseIrpj * tab.irpj) / 100);
  const limiteAdicional = tab.limite_adicional_mensal * e.meses;
  const adicional = arred((Math.max(0, baseIrpj - limiteAdicional) * tab.adicional_irpj) / 100);
  const csll = arred((baseCsll * tab.csll) / 100);
  const pis = arred((e.receita * tab.pis) / 100);
  const cofins = arred((e.receita * tab.cofins) / 100);
  const total = arred(irpj + adicional + csll + pis + cofins);
  return { presuncao: p, baseIrpj, baseCsll, irpj, limiteAdicional, adicional, csll, pis, cofins, total, efetiva: e.receita > 0 ? (total / e.receita) * 100 : 0 };
}

export function lucroReal(e: { receita: number; lucro: number; creditosPisCofins: number; meses: number }, tab: TabReal) {
  const lucro = Math.max(0, e.lucro);
  const irpj = arred((lucro * tab.irpj) / 100);
  const adicional = arred((Math.max(0, lucro - tab.limite_adicional_mensal * e.meses) * tab.adicional_irpj) / 100);
  const csll = arred((lucro * tab.csll) / 100);
  const basePisCofins = Math.max(0, e.receita - e.creditosPisCofins);
  const pis = arred((basePisCofins * tab.pis) / 100);
  const cofins = arred((basePisCofins * tab.cofins) / 100);
  const total = arred(irpj + adicional + csll + pis + cofins);
  return { irpj, adicional, csll, pis, cofins, total, efetiva: e.receita > 0 ? (total / e.receita) * 100 : 0 };
}

/* -------------------------------------------------------------------------- */
/* Projeção de faturamento e limites                                           */
/* -------------------------------------------------------------------------- */

export function projecaoFaturamento(e: { acumulado: number; mesesDecorridos: number; limite: number }) {
  const meses = Math.min(12, Math.max(1, Math.floor(e.mesesDecorridos)));
  const media = e.acumulado / meses;
  const projecao = arred(media * 12);
  const restante = Math.max(0, e.limite - e.acumulado);
  const mesesRestantes = 12 - meses;
  // Em que mês do ano o limite seria ultrapassado, mantida a média.
  const mesDoEstouro = media > 0 && projecao > e.limite ? Math.floor(e.limite / media) + 1 : null;
  return {
    media: arred(media),
    projecao,
    percentualUsado: e.limite > 0 ? (e.acumulado / e.limite) * 100 : 0,
    percentualProjetado: e.limite > 0 ? (projecao / e.limite) * 100 : 0,
    restante: arred(restante),
    mediaPermitida: mesesRestantes > 0 ? arred(restante / mesesRestantes) : 0,
    mesesRestantes,
    mesDoEstouro: mesDoEstouro && mesDoEstouro <= 12 ? mesDoEstouro : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Acréscimos legais (tributos federais em atraso)                             */
/* -------------------------------------------------------------------------- */

export function acrescimosFederais(e: { valor: number; vencimento: string; pagamento: string; selicAcumulada: number }, tab: TabAcrescimos) {
  const v = data(e.vencimento);
  const p = data(e.pagamento);
  const dias = Math.max(0, Math.round((p.getTime() - v.getTime()) / 86_400_000));
  const percentualMulta = Math.min(tab.multa_teto, dias * tab.multa_dia);
  const multa = arred((e.valor * percentualMulta) / 100);
  // Juros: Selic acumulada do mês seguinte ao vencimento até o mês anterior ao pagamento, mais 1% no mês do pagamento.
  const mesesDeDiferenca = (p.getFullYear() - v.getFullYear()) * 12 + p.getMonth() - v.getMonth();
  const percentualJuros = dias === 0 || mesesDeDiferenca === 0 ? 0 : (mesesDeDiferenca > 1 ? e.selicAcumulada : 0) + tab.juros_mes_pagamento;
  const juros = arred((e.valor * percentualJuros) / 100);
  return { dias, percentualMulta, multa, mesesSelic: Math.max(0, mesesDeDiferenca - 1), percentualJuros, juros, total: arred(e.valor + multa + juros) };
}

/* -------------------------------------------------------------------------- */
/* Dias úteis                                                                  */
/* -------------------------------------------------------------------------- */

export function contarDiasUteis(inicio: string, fim: string, ehUtil: (d: Date) => boolean): { uteis: number; corridos: number } {
  const a = data(inicio);
  const b = data(fim);
  if (b < a) return { uteis: 0, corridos: 0 };
  let uteis = 0;
  // Conta do dia seguinte ao início até o fim, inclusive (regra usual de contagem de prazo).
  for (const d = new Date(a.getTime() + 86_400_000); d <= b; d.setDate(d.getDate() + 1)) if (ehUtil(d)) uteis++;
  return { uteis, corridos: Math.round((b.getTime() - a.getTime()) / 86_400_000) };
}

export function somarDiasUteis(inicio: string, dias: number, ehUtil: (d: Date) => boolean): string {
  const d = data(inicio);
  let faltam = Math.max(0, Math.floor(dias));
  while (faltam > 0) {
    d.setDate(d.getDate() + 1);
    if (ehUtil(d)) faltam--;
  }
  return iso(d);
}

/* -------------------------------------------------------------------------- */
/* CPF e CNPJ                                                                  */
/* -------------------------------------------------------------------------- */

export function cpfValido(valor: string): boolean {
  const c = valor.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/**
 * CNPJ numérico e alfanumérico (IN RFB 2.229/2024): as 12 primeiras posições
 * podem ter letras; cada caractere vale o código ASCII menos 48, e os dois
 * dígitos verificadores continuam numéricos, com o mesmo módulo 11.
 */
export function cnpjValidoAlfanumerico(valor: string): boolean {
  const c = valor.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (c.length !== 14 || !/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const v = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = base.split('').reduce((s, ch, i) => s + v(ch) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}
