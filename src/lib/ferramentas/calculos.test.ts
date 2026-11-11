/**
 * Testes das calculadoras com valores conhecidos.
 * Rodar: `npm test`.
 *
 * As tabelas abaixo são as mesmas gravadas em `ferramentas_tabelas`
 * (migration 0031), conferidas nas fontes oficiais em 10/11/2026.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  acrescimosFederais,
  avosDecimoTerceiro,
  avosFerias,
  cnpjValidoAlfanumerico,
  contarDiasUteis,
  cpfValido,
  dasMei,
  decimoTerceiro,
  diasAvisoPrevio,
  fatorR,
  ferias,
  inssEmpregado,
  inssIndividual,
  irrfMensal,
  lucroPresumido,
  proLabore,
  projecaoFaturamento,
  rescisao,
  salarioLiquido,
  simplesNacional,
  somarDiasUteis,
  type ResultadoSimples,
  type TabInss,
  type TabIrrf,
  type TabSimples,
} from './calculos';

const INSS: TabInss = { teto: 8475.55, faixas: [{ ate: 1621, aliquota: 7.5 }, { ate: 2902.84, aliquota: 9 }, { ate: 4354.27, aliquota: 12 }, { ate: 8475.55, aliquota: 14 }] };
const IND = { minimo: 1621, teto: 8475.55, aliquota_prolabore: 11, aliquota_normal: 20, aliquota_simplificado: 11, aliquota_mei: 5, patronal: 20 };
const IRRF: TabIrrf = {
  dependente: 189.59,
  desconto_simplificado: 607.2,
  faixas: [
    { ate: 2428.8, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
    { ate: 3751.05, aliquota: 15, deducao: 394.16 },
    { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
    { ate: null, aliquota: 27.5, deducao: 908.73 },
  ],
  reducao: { isento_ate: 5000, limite: 7350, valor_maximo: 312.89, constante: 978.62, fator: 0.133145 },
};
const FGTS = { aliquota: 8, aliquota_aprendiz: 2, multa_sem_justa_causa: 40, multa_acordo: 20 };
const AVISO = { dias_base: 30, dias_por_ano: 3, maximo: 90 };
const SIMPLES: TabSimples = {
  limite: 4_800_000,
  sublimite: 3_600_000,
  fator_r: 28,
  anexos: {
    I: { nome: 'Comércio', tributos: ['IRPJ', 'CSLL', 'Cofins', 'PIS/Pasep', 'CPP', 'ICMS'], faixas: [
      { ate: 180000, aliquota: 4, deducao: 0, reparticao: [5.5, 3.5, 12.74, 2.76, 41.5, 34] },
      { ate: 360000, aliquota: 7.3, deducao: 5940, reparticao: [5.5, 3.5, 12.74, 2.76, 41.5, 34] },
      { ate: 720000, aliquota: 9.5, deducao: 13860, reparticao: [5.5, 3.5, 12.74, 2.76, 42, 33.5] },
    ] },
    III: { nome: 'Serviços', tributos: ['IRPJ', 'CSLL', 'Cofins', 'PIS/Pasep', 'CPP', 'ISS'], faixas: [
      { ate: 180000, aliquota: 6, deducao: 0, reparticao: [4, 3.5, 12.82, 2.78, 43.4, 33.5] },
      { ate: 360000, aliquota: 11.2, deducao: 9360, reparticao: [4, 3.5, 14.05, 3.05, 43.4, 32] },
      { ate: 720000, aliquota: 13.5, deducao: 17640, reparticao: [4, 3.5, 13.64, 2.96, 43.4, 32.5] },
      { ate: 1800000, aliquota: 16, deducao: 35640, reparticao: [4, 3.5, 13.64, 2.96, 43.4, 32.5] },
      { ate: 3600000, aliquota: 21, deducao: 125640, reparticao: [4, 3.5, 12.82, 2.78, 43.4, 33.5] },
      { ate: 4800000, aliquota: 33, deducao: 648000, reparticao: [35, 15, 16.03, 3.47, 30.5, 0] },
    ] },
  },
};
const perto = (a: number, b: number, tolerancia = 0.005) => assert.ok(Math.abs(a - b) <= tolerancia, `${a} ≠ ${b}`);

test('INSS: salário mínimo paga 7,5%', () => {
  assert.equal(inssEmpregado(1621, INSS).valor, 121.58);
});

test('INSS: R$ 3.000,00 soma as três primeiras faixas', () => {
  // 1.621,00 × 7,5% = 121,575 · 1.281,84 × 9% = 115,3656 · 97,16 × 12% = 11,6592
  assert.equal(inssEmpregado(3000, INSS).valor, 248.6);
});

test('INSS: acima do teto a contribuição não cresce', () => {
  const noTeto = inssEmpregado(8475.55, INSS);
  // 121,575 + 115,3656 + 174,1716 + 576,9792 = 988,0914
  assert.equal(noTeto.valor, 988.09);
  assert.equal(inssEmpregado(20000, INSS).valor, 988.09);
  assert.equal(inssEmpregado(20000, INSS).acimaDoTeto, true);
});

test('INSS do contribuinte individual: 11% limitado ao teto', () => {
  assert.equal(inssIndividual(5000, 11, IND).valor, 550);
  assert.equal(inssIndividual(10000, 11, IND).valor, 932.31);
});

test('IRRF: R$ 5.000,00 de rendimento tem imposto zerado pela redução da Lei 15.270/2025', () => {
  const inss = inssEmpregado(5000, INSS).valor;
  assert.equal(inss, 501.51);
  const r = irrfMensal({ rendimento: 5000, inss, dependentes: 0, pensao: 0, outras: 0 }, IRRF);
  assert.equal(r.usouSimplificado, true); // 607,20 > 501,51
  assert.equal(r.base, 4392.8);
  assert.equal(r.impostoTabela, 312.89); // 4.392,80 × 22,5% − 675,49
  assert.equal(r.reducao, 312.89);
  assert.equal(r.imposto, 0);
});

test('IRRF: na faixa de transição a redução é 978,62 − 0,133145 × rendimento', () => {
  const inss = inssEmpregado(6000, INSS).valor; // 641,51
  assert.equal(inss, 641.51);
  const r = irrfMensal({ rendimento: 6000, inss, dependentes: 0, pensao: 0, outras: 0 }, IRRF);
  assert.equal(r.usouSimplificado, false);
  assert.equal(r.base, 5358.49);
  assert.equal(r.impostoTabela, 564.85); // 5.358,49 × 27,5% − 908,73
  assert.equal(r.reducao, 179.75); // 978,62 − 798,87
  assert.equal(r.imposto, 385.1);
});

test('IRRF: acima de R$ 7.350,00 não há redução', () => {
  const r = irrfMensal({ rendimento: 10000, inss: 988.09, dependentes: 0, pensao: 0, outras: 0 }, IRRF);
  assert.equal(r.reducao, 0);
  assert.equal(r.imposto, 1569.55); // 9.011,91 × 27,5% − 908,73
});

test('IRRF: dependentes reduzem a base quando superam o desconto simplificado', () => {
  const r = irrfMensal({ rendimento: 8000, inss: 921.51, dependentes: 2, pensao: 0, outras: 0 }, IRRF);
  assert.equal(r.deducoesLegais, 1300.69);
  assert.equal(r.base, 6699.31);
  assert.equal(r.imposto, 933.58);
});

test('IRRF: rendimento dentro da faixa isenta', () => {
  assert.equal(irrfMensal({ rendimento: 2400, inss: 194.6, dependentes: 0, pensao: 0, outras: 0 }, IRRF).imposto, 0);
});

test('Salário líquido de R$ 3.000,00', () => {
  const r = salarioLiquido({ bruto: 3000, dependentes: 0, pensao: 0, outrosDescontos: 0 }, INSS, IRRF);
  assert.equal(r.inss.valor, 248.6);
  assert.equal(r.irrf.imposto, 0); // abaixo de R$ 5.000,00
  assert.equal(r.liquido, 2751.4);
});

test('Pró-labore de R$ 5.000,00 em empresa com CPP fora do DAS', () => {
  const r = proLabore({ valor: 5000, dependentes: 0, pensao: 0, cppForaDoDas: true }, IND, IRRF);
  assert.equal(r.inss.valor, 550);
  assert.equal(r.irrf.imposto, 0);
  assert.equal(r.patronal, 1000);
  assert.equal(r.liquido, 4450);
  assert.equal(r.custoTotal, 6000);
});

test('Férias de 30 dias com salário de R$ 3.000,00', () => {
  const r = ferias({ salario: 3000, dias: 30, abonoDias: 0, dependentes: 0 }, INSS, IRRF);
  assert.equal(r.valorFerias, 3000);
  assert.equal(r.terco, 1000);
  assert.equal(r.inss.valor, 368.6); // 121,575 + 115,3656 + 131,6592 (1.097,16 × 12%)
  assert.equal(r.liquido, 3631.4);
});

test('Férias com abono pecuniário de 10 dias', () => {
  const r = ferias({ salario: 3000, dias: 20, abonoDias: 10, dependentes: 0 }, INSS, IRRF);
  assert.equal(r.valorFerias, 2000);
  assert.equal(r.terco, 666.67);
  assert.equal(r.abono, 1000);
  assert.equal(r.tercoAbono, 333.33);
});

test('13º proporcional a 6 meses', () => {
  const r = decimoTerceiro({ salario: 3000, meses: 6, dependentes: 0 }, INSS, IRRF);
  assert.equal(r.bruto, 1500);
  assert.equal(r.primeira, 750);
  assert.equal(r.inss.valor, 112.5);
  assert.equal(r.segunda, 637.5);
});

test('Aviso prévio proporcional: 30 dias + 3 por ano completo, até 90', () => {
  assert.equal(diasAvisoPrevio('2026-01-10', '2026-10-10', AVISO), 30);
  assert.equal(diasAvisoPrevio('2021-03-01', '2026-10-31', AVISO), 45);
  assert.equal(diasAvisoPrevio('1995-01-01', '2026-10-31', AVISO), 90);
});

test('Avos de 13º e de férias', () => {
  assert.equal(avosDecimoTerceiro('2020-01-01', '2026-10-31'), 10);
  assert.equal(avosDecimoTerceiro('2026-03-20', '2026-10-14'), 6); // março (12 dias) e outubro (14 dias) não contam
  assert.equal(avosFerias('2024-03-01', '2026-10-31'), 8);
  assert.equal(avosFerias('2024-03-01', '2026-03-14'), 0);
  assert.equal(avosFerias('2024-03-01', '2026-03-15'), 1);
});

test('Rescisão sem justa causa com aviso indenizado', () => {
  const r = rescisao(
    { salario: 3000, admissao: '2024-03-01', desligamento: '2026-10-31', motivo: 'sem_justa_causa', aviso: 'indenizado', feriasVencidasDias: 0, saldoFgts: 7000, dependentes: 0 },
    { inss: INSS, irrf: IRRF, fgts: FGTS, aviso: AVISO },
  );
  assert.equal(r.diasAviso, 36); // 2 anos completos
  assert.equal(r.avisoIndenizado, 3600);
  assert.equal(r.fimProjetado, '2026-12-06');
  assert.equal(r.saldoSalario, 3000);
  assert.equal(r.avos13, 11); // a projeção do aviso alcança novembro; dezembro tem só 6 dias
  assert.equal(r.decimo, 2750);
  assert.equal(r.avosFer, 9);
  assert.equal(r.feriasProporcionais, 2250);
  assert.equal(r.tercoFerias, 750);
  assert.equal(r.fgtsRescisao, 748); // 8% de 3.000 + 2.750 + 3.600
  assert.equal(r.multaFgts, 3099.2); // 40% de 7.748
  assert.equal(r.proventos, 12350);
});

test('Rescisão por justa causa: só saldo de salário e férias vencidas', () => {
  const r = rescisao(
    { salario: 3000, admissao: '2024-03-01', desligamento: '2026-10-15', motivo: 'justa_causa', aviso: 'trabalhado', feriasVencidasDias: 30, saldoFgts: 7000, dependentes: 0 },
    { inss: INSS, irrf: IRRF, fgts: FGTS, aviso: AVISO },
  );
  assert.equal(r.saldoSalario, 1500);
  assert.equal(r.decimo, 0);
  assert.equal(r.feriasProporcionais, 0);
  assert.equal(r.feriasVencidas, 3000);
  assert.equal(r.tercoFerias, 1000);
  assert.equal(r.multaFgts, 0);
  assert.equal(r.avisoIndenizado, 0);
});

test('Rescisão por acordo: metade do aviso e multa de 20%', () => {
  const r = rescisao(
    { salario: 3000, admissao: '2024-03-01', desligamento: '2026-10-31', motivo: 'acordo', aviso: 'indenizado', feriasVencidasDias: 0, saldoFgts: 7000, dependentes: 0 },
    { inss: INSS, irrf: IRRF, fgts: FGTS, aviso: AVISO },
  );
  assert.equal(r.diasIndenizados, 18);
  assert.equal(r.avisoIndenizado, 1800);
  assert.equal(r.percentualMulta, 20);
  assert.equal(r.saqueFgts, 80);
});

test('Simples Nacional, Anexo I, RBT12 de R$ 300.000,00: alíquota efetiva de 5,32%', () => {
  const r = simplesNacional({ rbt12: 300000, receitaMes: 25000, anexo: 'I' }, SIMPLES) as ResultadoSimples;
  assert.equal(r.faixa, 2);
  perto(r.aliquotaEfetiva, 5.32, 1e-9);
  assert.equal(r.das, 1330);
  perto(r.reparticao.reduce((s, x) => s + x.valor, 0), 1330, 0.03);
});

test('Simples Nacional, Anexo III, RBT12 de R$ 200.000,00: alíquota efetiva de 6,52%', () => {
  const r = simplesNacional({ rbt12: 200000, receitaMes: 10000, anexo: 'III' }, SIMPLES) as ResultadoSimples;
  perto(r.aliquotaEfetiva, 6.52, 1e-9);
  assert.equal(r.das, 652);
  assert.equal(r.issLimitado, false);
});

test('Simples Nacional: primeira faixa usa a alíquota nominal', () => {
  const r = simplesNacional({ rbt12: 100000, receitaMes: 8000, anexo: 'III' }, SIMPLES) as ResultadoSimples;
  perto(r.aliquotaEfetiva, 6, 1e-9);
  assert.equal(r.das, 480);
});

test('Simples Nacional, Anexo III, 5ª faixa: ISS limitado a 5% e excedente redistribuído', () => {
  const r = simplesNacional({ rbt12: 3_600_000, receitaMes: 100000, anexo: 'III' }, SIMPLES) as ResultadoSimples;
  perto(r.aliquotaEfetiva, 17.51, 1e-9); // (756.000 − 125.640) ÷ 3.600.000
  assert.equal(r.issLimitado, true);
  const iss = r.reparticao.find((x) => x.tributo === 'ISS')!;
  perto((r.aliquotaEfetiva * iss.percentual) / 100, 5, 1e-9);
  // LC 123, Anexo III: do excedente, 65,26% vão para a CPP.
  const cpp = r.reparticao.find((x) => x.tributo === 'CPP')!;
  perto((r.aliquotaEfetiva * cpp.percentual) / 100, (17.51 - 5) * 0.6526, 0.001);
  perto(r.reparticao.reduce((s, x) => s + x.percentual, 0), 100, 1e-9);
});

test('Fator R decide entre Anexo III e Anexo V', () => {
  assert.equal(fatorR(84000, 300000, SIMPLES).anexo, 'III'); // 28%
  assert.equal(fatorR(83000, 300000, SIMPLES).anexo, 'V');
});

test('DAS-MEI 2026', () => {
  const mei = { limite_anual: 81000, inss_percentual: 5, icms: 1, iss: 5, caminhoneiro_percentual: 12, limite_caminhoneiro: 251600 };
  assert.equal(dasMei({ atividade: 'comercio', caminhoneiro: false }, 1621, mei).total, 82.05);
  assert.equal(dasMei({ atividade: 'servicos', caminhoneiro: false }, 1621, mei).total, 86.05);
  assert.equal(dasMei({ atividade: 'ambos', caminhoneiro: false }, 1621, mei).total, 87.05);
  assert.equal(dasMei({ atividade: 'ambos', caminhoneiro: true }, 1621, mei).inss, 194.52);
});

test('Lucro Presumido: serviços, R$ 300.000,00 no trimestre', () => {
  const tab = { irpj: 15, adicional_irpj: 10, limite_adicional_mensal: 20000, csll: 9, pis: 0.65, cofins: 3, presuncao: { servicos: { nome: 'Serviços', irpj: 32, csll: 32 }, comercio: { nome: 'Comércio', irpj: 8, csll: 12 } } };
  const r = lucroPresumido({ receita: 300000, atividade: 'servicos', meses: 3 }, tab);
  assert.ok(!('erro' in r));
  if ('erro' in r) return;
  assert.equal(r.baseIrpj, 96000);
  assert.equal(r.irpj, 14400);
  assert.equal(r.adicional, 3600); // 10% de (96.000 − 60.000)
  assert.equal(r.csll, 8640);
  assert.equal(r.pis, 1950);
  assert.equal(r.cofins, 9000);
  assert.equal(r.total, 37590);
  const c = lucroPresumido({ receita: 300000, atividade: 'comercio', meses: 3 }, tab);
  if ('erro' in c) return;
  assert.equal(c.baseIrpj, 24000);
  assert.equal(c.adicional, 0);
  assert.equal(c.csll, 3240); // 9% de 36.000
});

test('Projeção de faturamento contra o limite do MEI', () => {
  const r = projecaoFaturamento({ acumulado: 60000, mesesDecorridos: 6, limite: 81000 });
  assert.equal(r.projecao, 120000);
  assert.equal(r.mesDoEstouro, 9);
  assert.equal(r.mediaPermitida, 3500);
});

test('Acréscimos legais: multa de 0,33% ao dia limitada a 20%', () => {
  const tab = { multa_dia: 0.33, multa_teto: 20, juros_mes_pagamento: 1 };
  const curto = acrescimosFederais({ valor: 1000, vencimento: '2026-10-20', pagamento: '2026-10-30', selicAcumulada: 0 }, tab);
  assert.equal(curto.multa, 33);
  assert.equal(curto.juros, 0); // pago no mesmo mês do vencimento
  const longo = acrescimosFederais({ valor: 1000, vencimento: '2026-06-20', pagamento: '2026-10-30', selicAcumulada: 3.5 }, tab);
  assert.equal(longo.multa, 200);
  assert.equal(longo.mesesSelic, 3);
  assert.equal(longo.juros, 45); // 3,5% + 1%
  const seguinte = acrescimosFederais({ valor: 1000, vencimento: '2026-09-20', pagamento: '2026-10-05', selicAcumulada: 9 }, tab);
  assert.equal(seguinte.juros, 10); // só o 1% do mês do pagamento
});

test('Dias úteis', () => {
  const util = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !(d.getMonth() === 10 && d.getDate() === 20);
  assert.deepEqual(contarDiasUteis('2026-11-13', '2026-11-23', util), { uteis: 5, corridos: 10 }); // 20/11 é feriado
  assert.equal(somarDiasUteis('2026-11-13', 5, util), '2026-11-23');
});

test('Validação de CPF e CNPJ', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('529.982.247-26'), false);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cnpjValidoAlfanumerico('11.222.333/0001-81'), true);
  assert.equal(cnpjValidoAlfanumerico('11.222.333/0001-82'), false);
  assert.equal(cnpjValidoAlfanumerico('12.ABC.345/01DE-35'), true); // exemplo da Receita para o formato alfanumérico
});
