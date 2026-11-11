/**
 * Catálogo das Ferramentas: campos de cada calculadora e a tradução do
 * resultado em linhas, explicação passo a passo e avisos de limitação.
 *
 * A matemática fica em `calculos.ts`; os números (alíquotas, faixas, limites)
 * vêm das tabelas do banco. Aqui não há valor tributário escrito à mão.
 */

import * as c from '@/lib/ferramentas/calculos';
import type { TabelaFerramenta } from '@/types/banco';

export type TipoCampo = 'moeda' | 'numero' | 'percentual' | 'data' | 'selecao' | 'booleano' | 'texto';
export type Valores = Record<string, string | boolean>;
export type Tabelas = Record<string, TabelaFerramenta>;

export interface CampoFerramenta {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  padrao: string | boolean;
  opcoes?: { valor: string; rotulo: string }[];
  opcoesDe?: (t: Tabelas) => { valor: string; rotulo: string }[];
  dica?: string;
  visivel?: (v: Valores) => boolean;
}

export interface LinhaResultado {
  rotulo: string;
  valor: string;
  tipo?: 'provento' | 'desconto' | 'total' | 'info' | 'titulo';
}

export interface Resultado {
  destaques: { rotulo: string; valor: string; tom?: 'marca' | 'sucesso' | 'alerta' | 'erro' | 'neutro' }[];
  linhas: LinhaResultado[];
  passos: string[];
  avisos: string[];
}

export interface Extras {
  ehUtil: (d: Date) => boolean;
  hoje: string;
}

export interface Ferramenta {
  id: string;
  titulo: string;
  descricao: string;
  grupo: 'Folha e pessoal' | 'Tributos da empresa' | 'Planejamento' | 'Utilitários';
  /** Chaves de `ferramentas_tabelas` usadas — viram a seção "Base legal". */
  tabelas: string[];
  campos: CampoFerramenta[];
  /** `null` = ainda falta preencher algo; `{ erro }` = entrada inválida. */
  calcular: (v: Valores, t: Tabelas, x: Extras) => Resultado | { erro: string } | null;
  limitacoes: string[];
}

/* -------------------------------------------------------------------------- */

/** Lê "1.234,56", "1234,56", "1234.56" ou "R$ 1.234". */
export function ler(valor: string | boolean | undefined): number {
  if (typeof valor !== 'string') return 0;
  let s = valor.replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const d = <T,>(t: Tabelas, chave: string) => t[chave]?.dados as T;
const { brl, pct } = c;

const DEPENDENTES: CampoFerramenta = { id: 'dependentes', rotulo: 'Dependentes para o IR', tipo: 'numero', padrao: '0' };
const PENSAO: CampoFerramenta = { id: 'pensao', rotulo: 'Pensão alimentícia judicial', tipo: 'moeda', padrao: '', dica: 'Só a fixada por decisão judicial ou escritura pública é dedutível.' };

function linhasInss(r: c.ResultadoInss): string[] {
  return r.faixas.map((f) => `${brl(f.base)} na faixa de ${brl(f.de)} a ${brl(f.ate)} × ${pct(f.aliquota, 1)} = ${brl(f.valor)}`);
}

function passosIrrf(r: c.ResultadoIrrf, rendimento: number, irrf: c.TabIrrf): string[] {
  const passos = [
    r.usouSimplificado
      ? `Deduções legais somam ${brl(r.deducoesLegais)}; o desconto simplificado de ${brl(r.descontoSimplificado)} é maior, então é ele que se aplica.`
      : `Deduções legais somam ${brl(r.deducoesLegais)}, mais que o desconto simplificado (${brl(r.descontoSimplificado)}), então valem as deduções legais.`,
    `Base de cálculo: ${brl(rendimento)} − ${brl(r.usouSimplificado ? r.descontoSimplificado : r.deducoesLegais)} = ${brl(r.base)}.`,
    r.aliquota === 0
      ? 'A base fica na faixa isenta da tabela progressiva.'
      : `Tabela progressiva: ${brl(r.base)} × ${pct(r.aliquota, 1)} − ${brl(r.parcelaADeduzir)} (parcela a deduzir) = ${brl(r.impostoTabela)}.`,
  ];
  if (irrf.reducao && r.impostoTabela > 0) {
    if (r.reducao > 0 && rendimento <= irrf.reducao.isento_ate) passos.push(`Redução da Lei 15.270/2025: rendimento tributável até ${brl(irrf.reducao.isento_ate)} — o imposto é reduzido em ${brl(r.reducao)} e fica zerado.`);
    else if (r.reducao > 0) passos.push(`Redução da Lei 15.270/2025: ${brl(irrf.reducao.constante)} − ${String(irrf.reducao.fator).replace('.', ',')} × ${brl(rendimento)} = ${brl(r.reducao)}.`);
    else passos.push(`Rendimento acima de ${brl(irrf.reducao.limite)}: não há redução da Lei 15.270/2025.`);
  }
  passos.push(`IRRF devido: ${brl(r.imposto)} (alíquota efetiva de ${pct(r.efetiva)} sobre o rendimento).`);
  return passos;
}

const AVISO_ARREDONDAMENTO = 'O arredondamento pode variar em centavos conforme o sistema de folha.';

/* -------------------------------------------------------------------------- */

export const FERRAMENTAS: Ferramenta[] = [
  {
    id: 'inss',
    titulo: 'INSS do empregado',
    descricao: 'Contribuição previdenciária pela tabela progressiva, faixa a faixa.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_empregado'],
    campos: [{ id: 'salario', rotulo: 'Salário de contribuição', tipo: 'moeda', padrao: '' }],
    limitacoes: ['Vale para empregado, doméstico e trabalhador avulso. Para pró-labore e autônomos use “Pró-labore”.', AVISO_ARREDONDAMENTO],
    calcular(v, t) {
      const salario = ler(v.salario);
      if (salario <= 0) return null;
      const r = c.inssEmpregado(salario, d<c.TabInss>(t, 'inss_empregado'));
      return {
        destaques: [{ rotulo: 'INSS a descontar', valor: brl(r.valor) }, { rotulo: 'Alíquota efetiva', valor: pct(r.efetiva), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Salário de contribuição', valor: brl(salario), tipo: 'info' },
          ...r.faixas.map((f) => ({ rotulo: `${pct(f.aliquota, 1)} sobre ${brl(f.base)}`, valor: brl(f.valor), tipo: 'desconto' as const })),
          { rotulo: 'Total de INSS', valor: brl(r.valor), tipo: 'total' },
        ],
        passos: [...linhasInss(r), `Soma das faixas: ${brl(r.valor)}.`],
        avisos: r.acimaDoTeto ? [`O salário supera o teto de ${brl(r.base)}: a contribuição é calculada só até o teto.`] : [],
      };
    },
  },
  {
    id: 'irrf',
    titulo: 'IRRF mensal',
    descricao: 'Imposto de renda retido na fonte, com desconto simplificado e a redução para rendas de até R$ 7.350.',
    grupo: 'Folha e pessoal',
    tabelas: ['irrf_mensal', 'inss_empregado'],
    campos: [
      { id: 'rendimento', rotulo: 'Rendimento tributável do mês', tipo: 'moeda', padrao: '' },
      { id: 'inssAuto', rotulo: 'Calcular o INSS pela tabela do empregado', tipo: 'booleano', padrao: true },
      { id: 'inss', rotulo: 'Contribuição previdenciária', tipo: 'moeda', padrao: '', visivel: (v) => v.inssAuto === false },
      DEPENDENTES,
      PENSAO,
      { id: 'outras', rotulo: 'Outras deduções legais', tipo: 'moeda', padrao: '', dica: 'Ex.: previdência privada/Funpresp nos limites da lei.' },
    ],
    limitacoes: ['Cálculo da retenção mensal; o ajuste anual (declaração) pode gerar imposto a pagar ou a restituir.', 'Não trata rendimentos acumulados (RRA), PLR nem rendimentos do exterior.'],
    calcular(v, t) {
      const rendimento = ler(v.rendimento);
      if (rendimento <= 0) return null;
      const tab = d<c.TabIrrf>(t, 'irrf_mensal');
      const inss = v.inssAuto === false ? ler(v.inss) : c.inssEmpregado(rendimento, d<c.TabInss>(t, 'inss_empregado')).valor;
      const dependentes = Math.max(0, Math.floor(ler(v.dependentes)));
      const r = c.irrfMensal({ rendimento, inss, dependentes, pensao: ler(v.pensao), outras: ler(v.outras) }, tab);
      return {
        destaques: [{ rotulo: 'IRRF a reter', valor: brl(r.imposto) }, { rotulo: 'Alíquota efetiva', valor: pct(r.efetiva), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Rendimento tributável', valor: brl(rendimento), tipo: 'info' },
          { rotulo: 'Contribuição previdenciária', valor: brl(inss), tipo: 'info' },
          { rotulo: `Dependentes (${dependentes} × ${brl(tab.dependente)})`, valor: brl(dependentes * tab.dependente), tipo: 'info' },
          { rotulo: r.usouSimplificado ? 'Desconto simplificado aplicado' : 'Deduções legais aplicadas', valor: brl(r.usouSimplificado ? r.descontoSimplificado : r.deducoesLegais), tipo: 'desconto' },
          { rotulo: 'Base de cálculo', valor: brl(r.base), tipo: 'info' },
          { rotulo: 'Imposto pela tabela progressiva', valor: brl(r.impostoTabela), tipo: 'info' },
          { rotulo: 'Redução (Lei 15.270/2025)', valor: `− ${brl(r.reducao)}`, tipo: 'desconto' },
          { rotulo: 'IRRF devido', valor: brl(r.imposto), tipo: 'total' },
        ],
        passos: passosIrrf(r, rendimento, tab),
        avisos: [],
      };
    },
  },
  {
    id: 'salario-liquido',
    titulo: 'Salário líquido',
    descricao: 'Do bruto ao líquido: INSS, IRRF e demais descontos, mais o FGTS depositado pela empresa.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_empregado', 'irrf_mensal', 'fgts'],
    campos: [
      { id: 'bruto', rotulo: 'Salário bruto', tipo: 'moeda', padrao: '' },
      DEPENDENTES,
      PENSAO,
      { id: 'outros', rotulo: 'Outros descontos (VT, plano de saúde, adiantamento…)', tipo: 'moeda', padrao: '' },
    ],
    limitacoes: ['Considera o salário como única verba tributável do mês (sem horas extras, adicionais, comissões ou faltas).', AVISO_ARREDONDAMENTO],
    calcular(v, t) {
      const bruto = ler(v.bruto);
      if (bruto <= 0) return null;
      const irrfTab = d<c.TabIrrf>(t, 'irrf_mensal');
      const fgts = d<c.TabFgts>(t, 'fgts');
      const pensao = ler(v.pensao);
      const outros = ler(v.outros);
      const r = c.salarioLiquido({ bruto, dependentes: Math.floor(ler(v.dependentes)), pensao, outrosDescontos: outros }, d<c.TabInss>(t, 'inss_empregado'), irrfTab);
      return {
        destaques: [{ rotulo: 'Salário líquido', valor: brl(r.liquido), tom: 'sucesso' }, { rotulo: 'Total de descontos', valor: brl(bruto - r.liquido), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Salário bruto', valor: brl(bruto), tipo: 'provento' },
          { rotulo: 'INSS', valor: `− ${brl(r.inss.valor)}`, tipo: 'desconto' },
          { rotulo: 'IRRF', valor: `− ${brl(r.irrf.imposto)}`, tipo: 'desconto' },
          ...(pensao ? [{ rotulo: 'Pensão alimentícia', valor: `− ${brl(pensao)}`, tipo: 'desconto' as const }] : []),
          ...(outros ? [{ rotulo: 'Outros descontos', valor: `− ${brl(outros)}`, tipo: 'desconto' as const }] : []),
          { rotulo: 'Líquido a receber', valor: brl(r.liquido), tipo: 'total' },
          { rotulo: `FGTS depositado pela empresa (${pct(fgts.aliquota, 0)})`, valor: brl(c.arred((bruto * fgts.aliquota) / 100)), tipo: 'info' },
        ],
        passos: ['INSS:', ...linhasInss(r.inss), 'IRRF:', ...passosIrrf(r.irrf, bruto, irrfTab), `Líquido: ${brl(bruto)} − descontos = ${brl(r.liquido)}.`],
        avisos: r.inss.acimaDoTeto ? ['Salário acima do teto do INSS: a contribuição foi limitada ao teto.'] : [],
      };
    },
  },
  {
    id: 'pro-labore',
    titulo: 'Pró-labore',
    descricao: 'Retenções do sócio (INSS de 11% e IRRF) e o custo para a empresa.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_individual', 'irrf_mensal', 'salario_minimo'],
    campos: [
      { id: 'valor', rotulo: 'Valor do pró-labore', tipo: 'moeda', padrao: '' },
      { id: 'cpp', rotulo: 'A empresa paga CPP de 20% fora do DAS', tipo: 'booleano', padrao: false, dica: 'Marque para Lucro Presumido, Lucro Real e Simples no Anexo IV. Nos Anexos I, II, III e V a CPP já está no DAS.' },
      DEPENDENTES,
      PENSAO,
    ],
    limitacoes: ['Não inclui RAT nem contribuições a terceiros, que não incidem sobre pró-labore.', 'Sócio com outra fonte de contribuição pode ter o INSS limitado ao teto somando as fontes — informe à folha.'],
    calcular(v, t) {
      const valor = ler(v.valor);
      if (valor <= 0) return null;
      const ind = d<c.TabInssIndividual>(t, 'inss_individual');
      const irrfTab = d<c.TabIrrf>(t, 'irrf_mensal');
      const r = c.proLabore({ valor, dependentes: Math.floor(ler(v.dependentes)), pensao: ler(v.pensao), cppForaDoDas: v.cpp === true }, ind, irrfTab);
      const avisos: string[] = [];
      if (r.inss.abaixoDoMinimo) avisos.push(`Pró-labore abaixo do salário mínimo (${brl(ind.minimo)}): a competência pode não contar como tempo de contribuição sem complementação.`);
      if (r.inss.acimaDoTeto) avisos.push(`Valor acima do teto do INSS (${brl(ind.teto)}): a retenção de 11% foi limitada ao teto. A CPP patronal, quando devida, incide sobre o valor integral.`);
      return {
        destaques: [{ rotulo: 'Líquido do sócio', valor: brl(r.liquido), tom: 'sucesso' }, { rotulo: 'Custo para a empresa', valor: brl(r.custoTotal), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Pró-labore bruto', valor: brl(valor), tipo: 'provento' },
          { rotulo: `INSS retido (${pct(ind.aliquota_prolabore, 0)})`, valor: `− ${brl(r.inss.valor)}`, tipo: 'desconto' },
          { rotulo: 'IRRF', valor: `− ${brl(r.irrf.imposto)}`, tipo: 'desconto' },
          { rotulo: 'Líquido do sócio', valor: brl(r.liquido), tipo: 'total' },
          { rotulo: `CPP patronal (${pct(ind.patronal, 0)})`, valor: brl(r.patronal), tipo: 'info' },
          { rotulo: 'Custo total para a empresa', valor: brl(r.custoTotal), tipo: 'total' },
        ],
        passos: [`INSS: ${brl(r.inss.base)} × ${pct(ind.aliquota_prolabore, 0)} = ${brl(r.inss.valor)}.`, ...passosIrrf(r.irrf, valor, irrfTab), v.cpp === true ? `CPP patronal: ${brl(valor)} × ${pct(ind.patronal, 0)} = ${brl(r.patronal)}.` : 'CPP patronal não calculada: informada como incluída no DAS.'],
        avisos,
      };
    },
  },
  {
    id: 'fgts',
    titulo: 'FGTS',
    descricao: 'Depósito mensal e multa rescisória sobre o saldo.',
    grupo: 'Folha e pessoal',
    tabelas: ['fgts'],
    campos: [
      { id: 'remuneracao', rotulo: 'Remuneração do mês', tipo: 'moeda', padrao: '' },
      { id: 'aprendiz', rotulo: 'Contrato de aprendizagem', tipo: 'booleano', padrao: false },
      { id: 'saldo', rotulo: 'Saldo do FGTS para fins rescisórios (opcional)', tipo: 'moeda', padrao: '', dica: 'Informe para ver a multa de 40% e a de 20% do acordo.' },
    ],
    limitacoes: ['Não calcula juros e atualização monetária da conta vinculada.', 'O saldo para fins rescisórios deve ser consultado no extrato da Caixa.'],
    calcular(v, t) {
      const rem = ler(v.remuneracao);
      const saldo = ler(v.saldo);
      if (rem <= 0 && saldo <= 0) return null;
      const f = d<c.TabFgts>(t, 'fgts');
      const aliq = v.aprendiz === true ? f.aliquota_aprendiz : f.aliquota;
      const deposito = c.arred((rem * aliq) / 100);
      return {
        destaques: [{ rotulo: 'Depósito mensal', valor: brl(deposito) }, ...(saldo > 0 ? [{ rotulo: `Multa de ${pct(f.multa_sem_justa_causa, 0)}`, valor: brl(c.arred((saldo * f.multa_sem_justa_causa) / 100)), tom: 'neutro' as const }] : [])],
        linhas: [
          { rotulo: `Depósito mensal (${pct(aliq, 0)} de ${brl(rem)})`, valor: brl(deposito), tipo: 'total' },
          { rotulo: 'Depósitos em 12 meses + 13º', valor: brl(c.arred(deposito * 13)), tipo: 'info' },
          ...(saldo > 0
            ? [
                { rotulo: `Multa na dispensa sem justa causa (${pct(f.multa_sem_justa_causa, 0)})`, valor: brl(c.arred((saldo * f.multa_sem_justa_causa) / 100)), tipo: 'info' as const },
                { rotulo: `Multa na rescisão por acordo (${pct(f.multa_acordo, 0)})`, valor: brl(c.arred((saldo * f.multa_acordo) / 100)), tipo: 'info' as const },
              ]
            : []),
        ],
        passos: [`Depósito: ${brl(rem)} × ${pct(aliq, 0)} = ${brl(deposito)}. O FGTS é custo da empresa, não é descontado do empregado.`],
        avisos: [],
      };
    },
  },
  {
    id: 'ferias',
    titulo: 'Férias',
    descricao: 'Férias com 1/3 constitucional, abono pecuniário e descontos.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_empregado', 'irrf_mensal'],
    campos: [
      { id: 'salario', rotulo: 'Salário mensal', tipo: 'moeda', padrao: '' },
      { id: 'dias', rotulo: 'Dias de férias gozadas', tipo: 'selecao', padrao: '30', opcoes: [30, 20, 15, 14, 10].map((n) => ({ valor: String(n), rotulo: `${n} dias` })) },
      { id: 'abono', rotulo: 'Vender 10 dias (abono pecuniário)', tipo: 'booleano', padrao: false },
      DEPENDENTES,
    ],
    limitacoes: [
      'Não inclui médias de horas extras, comissões e adicionais, nem redução por faltas injustificadas.',
      'O abono pecuniário e o seu 1/3 foram tratados como isentos de INSS e IRRF.',
      'A redução da Lei 15.270/2025 foi aplicada à tributação em separado das férias; confira com o sistema de folha.',
    ],
    calcular(v, t) {
      const salario = ler(v.salario);
      if (salario <= 0) return null;
      const dias = ler(v.dias) || 30;
      const abonoDias = v.abono === true ? 10 : 0;
      if (dias + abonoDias > 30) return { erro: 'Dias gozados mais os 10 dias vendidos não podem passar de 30.' };
      const irrfTab = d<c.TabIrrf>(t, 'irrf_mensal');
      const r = c.ferias({ salario, dias, abonoDias, dependentes: Math.floor(ler(v.dependentes)) }, d<c.TabInss>(t, 'inss_empregado'), irrfTab);
      return {
        destaques: [{ rotulo: 'Líquido de férias', valor: brl(r.liquido), tom: 'sucesso' }],
        linhas: [
          { rotulo: `Férias (${dias} dias)`, valor: brl(r.valorFerias), tipo: 'provento' },
          { rotulo: '1/3 constitucional', valor: brl(r.terco), tipo: 'provento' },
          ...(abonoDias ? [{ rotulo: 'Abono pecuniário (10 dias)', valor: brl(r.abono), tipo: 'provento' as const }, { rotulo: '1/3 sobre o abono', valor: brl(r.tercoAbono), tipo: 'provento' as const }] : []),
          { rotulo: 'INSS', valor: `− ${brl(r.inss.valor)}`, tipo: 'desconto' },
          { rotulo: 'IRRF', valor: `− ${brl(r.irrf.imposto)}`, tipo: 'desconto' },
          { rotulo: 'Líquido a receber', valor: brl(r.liquido), tipo: 'total' },
        ],
        passos: [`Férias: ${brl(salario)} ÷ 30 × ${dias} = ${brl(r.valorFerias)}; 1/3 = ${brl(r.terco)}.`, `Base de INSS e IRRF: ${brl(r.tributavel)}.`, ...linhasInss(r.inss), ...passosIrrf(r.irrf, r.tributavel, irrfTab)],
        avisos: [],
      };
    },
  },
  {
    id: 'decimo-terceiro',
    titulo: '13º salário',
    descricao: 'Primeira e segunda parcelas, com INSS e IRRF de tributação exclusiva.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_empregado', 'irrf_mensal'],
    campos: [
      { id: 'salario', rotulo: 'Salário mensal', tipo: 'moeda', padrao: '' },
      { id: 'meses', rotulo: 'Meses trabalhados no ano', tipo: 'numero', padrao: '12', dica: 'Mês com 15 dias ou mais trabalhados conta inteiro.' },
      DEPENDENTES,
    ],
    limitacoes: [
      'Não inclui médias de variáveis (horas extras, comissões, adicionais).',
      'A redução da Lei 15.270/2025 foi aplicada ao 13º; confira com o sistema de folha.',
    ],
    calcular(v, t) {
      const salario = ler(v.salario);
      if (salario <= 0) return null;
      const irrfTab = d<c.TabIrrf>(t, 'irrf_mensal');
      const r = c.decimoTerceiro({ salario, meses: ler(v.meses), dependentes: Math.floor(ler(v.dependentes)) }, d<c.TabInss>(t, 'inss_empregado'), irrfTab);
      return {
        destaques: [{ rotulo: '1ª parcela (até 30/11)', valor: brl(r.primeira) }, { rotulo: '2ª parcela (até 20/12)', valor: brl(r.segunda), tom: 'sucesso' }],
        linhas: [
          { rotulo: `13º bruto (${r.meses}/12)`, valor: brl(r.bruto), tipo: 'provento' },
          { rotulo: '1ª parcela — sem descontos', valor: brl(r.primeira), tipo: 'info' },
          { rotulo: 'INSS (na 2ª parcela)', valor: `− ${brl(r.inss.valor)}`, tipo: 'desconto' },
          { rotulo: 'IRRF (na 2ª parcela)', valor: `− ${brl(r.irrf.imposto)}`, tipo: 'desconto' },
          { rotulo: '2ª parcela', valor: brl(r.segunda), tipo: 'info' },
          { rotulo: 'Total líquido', valor: brl(r.liquido), tipo: 'total' },
        ],
        passos: [`13º bruto: ${brl(salario)} ÷ 12 × ${r.meses} = ${brl(r.bruto)}.`, `1ª parcela: metade do bruto = ${brl(r.primeira)}.`, ...linhasInss(r.inss), ...passosIrrf(r.irrf, r.bruto, irrfTab), `2ª parcela: ${brl(r.bruto)} − ${brl(r.primeira)} − INSS − IRRF = ${brl(r.segunda)}.`],
        avisos: [],
      };
    },
  },
  {
    id: 'rescisao',
    titulo: 'Rescisão trabalhista',
    descricao: 'Simulação das verbas rescisórias, descontos e multa do FGTS.',
    grupo: 'Folha e pessoal',
    tabelas: ['inss_empregado', 'irrf_mensal', 'fgts', 'aviso_previo'],
    campos: [
      { id: 'salario', rotulo: 'Último salário', tipo: 'moeda', padrao: '' },
      { id: 'admissao', rotulo: 'Data de admissão', tipo: 'data', padrao: '' },
      { id: 'desligamento', rotulo: 'Último dia trabalhado', tipo: 'data', padrao: '' },
      {
        id: 'motivo', rotulo: 'Motivo', tipo: 'selecao', padrao: 'sem_justa_causa',
        opcoes: [
          { valor: 'sem_justa_causa', rotulo: 'Dispensa sem justa causa' },
          { valor: 'pedido_demissao', rotulo: 'Pedido de demissão' },
          { valor: 'acordo', rotulo: 'Acordo entre as partes (art. 484-A)' },
          { valor: 'justa_causa', rotulo: 'Dispensa por justa causa' },
          { valor: 'termino_contrato', rotulo: 'Término de contrato por prazo determinado' },
        ],
      },
      {
        id: 'aviso', rotulo: 'Aviso prévio', tipo: 'selecao', padrao: 'indenizado',
        opcoes: [{ valor: 'indenizado', rotulo: 'Indenizado' }, { valor: 'trabalhado', rotulo: 'Trabalhado' }, { valor: 'nao_cumprido', rotulo: 'Não cumprido pelo empregado' }],
        visivel: (v) => v.motivo !== 'justa_causa' && v.motivo !== 'termino_contrato',
      },
      { id: 'feriasVencidas', rotulo: 'Dias de férias vencidas não gozadas', tipo: 'numero', padrao: '0' },
      { id: 'saldoFgts', rotulo: 'Saldo do FGTS para fins rescisórios', tipo: 'moeda', padrao: '', dica: 'Base da multa. Consulte o extrato da Caixa.' },
      DEPENDENTES,
    ],
    limitacoes: [
      'É uma SIMULAÇÃO para conferência: o valor oficial é o do sistema de folha e do TRCT.',
      'Não inclui médias de horas extras, comissões e adicionais, banco de horas, faltas, adiantamentos, pensão nem regras de convenção coletiva.',
      'Não calcula as indenizações dos arts. 479 e 480 da CLT (rescisão antecipada de contrato a prazo) nem férias em dobro.',
      'Aviso prévio indenizado e férias indenizadas foram tratados como isentos de INSS e IRRF; saldo de salário e 13º são tributados separadamente.',
    ],
    calcular(v, t) {
      const salario = ler(v.salario);
      const admissao = String(v.admissao ?? '');
      const desligamento = String(v.desligamento ?? '');
      if (salario <= 0 || !admissao || !desligamento) return null;
      if (desligamento < admissao) return { erro: 'A data do desligamento é anterior à admissão.' };
      const motivo = v.motivo as c.MotivoRescisao;
      const r = c.rescisao(
        { salario, admissao, desligamento, motivo, aviso: (v.aviso as c.AvisoPrevio) ?? 'indenizado', feriasVencidasDias: Math.max(0, ler(v.feriasVencidas)), saldoFgts: ler(v.saldoFgts), dependentes: Math.floor(ler(v.dependentes)) },
        { inss: d<c.TabInss>(t, 'inss_empregado'), irrf: d<c.TabIrrf>(t, 'irrf_mensal'), fgts: d<c.TabFgts>(t, 'fgts'), aviso: d<c.TabAviso>(t, 'aviso_previo') },
      );
      const avisos: string[] = [];
      if (r.saqueFgts === 100) avisos.push('O empregado pode sacar o saldo do FGTS.');
      if (r.saqueFgts === 80) avisos.push('No acordo, o saque do FGTS é limitado a 80% do saldo e não há seguro-desemprego.');
      if (motivo === 'pedido_demissao' || motivo === 'justa_causa') avisos.push('Sem saque do FGTS e sem multa rescisória neste motivo.');
      if (motivo === 'sem_justa_causa' && v.aviso === 'trabalhado') avisos.push(`Aviso trabalhado de ${r.diasAviso} dias: o salário desse período já deve estar no “último dia trabalhado”.`);
      return {
        destaques: [{ rotulo: 'Líquido da rescisão', valor: brl(r.liquido), tom: 'sucesso' }, { rotulo: 'Multa do FGTS', valor: brl(r.multaFgts), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Verbas rescisórias', valor: '', tipo: 'titulo' },
          { rotulo: `Saldo de salário (${r.diasSaldo} dias)`, valor: brl(r.saldoSalario), tipo: 'provento' },
          ...(r.avisoIndenizado ? [{ rotulo: `Aviso prévio indenizado (${r.diasIndenizados} dias)`, valor: brl(r.avisoIndenizado), tipo: 'provento' as const }] : []),
          { rotulo: `13º proporcional (${r.avos13}/12)`, valor: brl(r.decimo), tipo: 'provento' },
          { rotulo: `Férias proporcionais (${r.avosFer}/12)`, valor: brl(r.feriasProporcionais), tipo: 'provento' },
          ...(r.feriasVencidas ? [{ rotulo: 'Férias vencidas', valor: brl(r.feriasVencidas), tipo: 'provento' as const }] : []),
          { rotulo: '1/3 sobre férias', valor: brl(r.tercoFerias), tipo: 'provento' },
          { rotulo: 'Total de proventos', valor: brl(r.proventos), tipo: 'total' },
          { rotulo: 'Descontos', valor: '', tipo: 'titulo' },
          { rotulo: 'INSS sobre saldo de salário', valor: `− ${brl(r.inssSaldo.valor)}`, tipo: 'desconto' },
          { rotulo: 'INSS sobre 13º', valor: `− ${brl(r.inss13.valor)}`, tipo: 'desconto' },
          { rotulo: 'IRRF sobre saldo de salário', valor: `− ${brl(r.irrfSaldo.imposto)}`, tipo: 'desconto' },
          { rotulo: 'IRRF sobre 13º', valor: `− ${brl(r.irrf13.imposto)}`, tipo: 'desconto' },
          ...(r.descontoAviso ? [{ rotulo: 'Aviso prévio não cumprido', valor: `− ${brl(r.descontoAviso)}`, tipo: 'desconto' as const }] : []),
          { rotulo: 'Líquido a receber', valor: brl(r.liquido), tipo: 'total' },
          { rotulo: 'FGTS (pago na conta vinculada)', valor: '', tipo: 'titulo' },
          { rotulo: 'FGTS sobre as verbas da rescisão', valor: brl(r.fgtsRescisao), tipo: 'info' },
          { rotulo: `Multa rescisória (${pct(r.percentualMulta, 0)})`, valor: brl(r.multaFgts), tipo: 'info' },
        ],
        passos: [
          `Aviso prévio proporcional ao tempo de serviço: ${r.diasAviso} dias.`,
          r.diasIndenizados ? `Com o aviso indenizado de ${r.diasIndenizados} dias, o contrato se projeta até ${c.dataBr(r.fimProjetado)} para contar 13º e férias.` : 'Sem projeção de aviso prévio indenizado.',
          `Saldo de salário: ${brl(salario)} ÷ 30 × ${r.diasSaldo} dias = ${brl(r.saldoSalario)}.`,
          `13º proporcional: ${r.avos13} mês(es) com 15 dias ou mais no ano → ${brl(r.decimo)}.`,
          `Férias proporcionais: ${r.avosFer} avo(s) desde o último aniversário da admissão → ${brl(r.feriasProporcionais)}; 1/3 sobre férias = ${brl(r.tercoFerias)}.`,
          `FGTS da rescisão: ${pct(d<c.TabFgts>(t, 'fgts').aliquota, 0)} sobre saldo de salário, 13º e aviso indenizado = ${brl(r.fgtsRescisao)}.`,
          r.percentualMulta ? `Multa: ${pct(r.percentualMulta, 0)} sobre o saldo informado mais o FGTS da rescisão = ${brl(r.multaFgts)}.` : 'Não há multa do FGTS neste motivo de desligamento.',
        ],
        avisos,
      };
    },
  },
  {
    id: 'simples',
    titulo: 'Simples Nacional — DAS',
    descricao: 'Alíquota efetiva, valor do DAS e repartição por tributo, com Fator R.',
    grupo: 'Tributos da empresa',
    tabelas: ['simples_nacional'],
    campos: [
      { id: 'rbt12', rotulo: 'Receita bruta dos 12 meses anteriores (RBT12)', tipo: 'moeda', padrao: '' },
      { id: 'receita', rotulo: 'Receita do mês a tributar', tipo: 'moeda', padrao: '' },
      {
        id: 'anexo', rotulo: 'Anexo / atividade', tipo: 'selecao', padrao: 'I',
        opcoesDe: (t) => [
          ...Object.entries(d<c.TabSimples>(t, 'simples_nacional')?.anexos ?? {}).map(([k, a]) => ({ valor: k, rotulo: `Anexo ${k} — ${a.nome}` })),
          { valor: 'R', rotulo: 'Serviço sujeito ao Fator R (define entre III e V)' },
        ],
      },
      { id: 'folha', rotulo: 'Folha de salários dos 12 meses anteriores', tipo: 'moeda', padrao: '', dica: 'Salários, pró-labore, CPP e FGTS (LC 123, art. 18, § 24).', visivel: (v) => v.anexo === 'R' },
    ],
    limitacoes: [
      'Empresa com menos de 12 meses de atividade usa a RBT12 proporcionalizada (média mensal × 12).',
      'Não trata substituição tributária, tributação monofásica, retenção de ISS, exportação nem receitas de anexos diferentes no mesmo mês — nesses casos a segregação de receitas no PGDAS-D altera o valor.',
      'Não aplica sublimites estaduais específicos nem benefícios locais de ICMS/ISS.',
    ],
    calcular(v, t) {
      const rbt12 = ler(v.rbt12);
      const receita = ler(v.receita);
      if (rbt12 <= 0) return null;
      const tab = d<c.TabSimples>(t, 'simples_nacional');
      let anexo = String(v.anexo);
      const passos: string[] = [];
      if (anexo === 'R') {
        const folha = ler(v.folha);
        if (folha <= 0) return null;
        const f = c.fatorR(folha, rbt12, tab);
        anexo = f.anexo;
        passos.push(`Fator R: ${brl(folha)} ÷ ${brl(rbt12)} = ${pct(f.fator)} → ${f.fator >= tab.fator_r ? `igual ou acima de ${pct(tab.fator_r, 0)}: Anexo III` : `abaixo de ${pct(tab.fator_r, 0)}: Anexo V`}.`);
      }
      const r = c.simplesNacional({ rbt12, receitaMes: receita, anexo }, tab);
      if ('erro' in r) return r;
      const avisos: string[] = [];
      if (r.acimaDoLimite) avisos.push(`RBT12 acima do limite de ${brl(tab.limite)}: a empresa está sujeita à exclusão do Simples Nacional. O cálculo abaixo usa a última faixa apenas como referência.`);
      else if (r.acimaDoSublimite) avisos.push(`RBT12 acima do sublimite de ${brl(tab.sublimite)}: ICMS e ISS passam a ser recolhidos fora do DAS, pelas regras normais. O valor abaixo ainda mostra a parcela desses tributos — desconsidere-a.`);
      if (r.issLimitado) avisos.push('O ISS efetivo foi limitado a 5%; o excedente foi redistribuído aos tributos federais, como manda a LC 123.');
      passos.push(
        `RBT12 de ${brl(rbt12)} → ${r.faixa}ª faixa do Anexo ${r.anexo}: alíquota nominal de ${pct(r.aliquotaNominal)} e parcela a deduzir de ${brl(r.deducao)}.`,
        `Alíquota efetiva: (${brl(rbt12)} × ${pct(r.aliquotaNominal)} − ${brl(r.deducao)}) ÷ ${brl(rbt12)} = ${pct(r.aliquotaEfetiva, 4)}.`,
        `DAS: ${brl(receita)} × ${pct(r.aliquotaEfetiva, 4)} = ${brl(r.das)}.`,
      );
      return {
        destaques: [{ rotulo: 'DAS do mês', valor: brl(r.das) }, { rotulo: 'Alíquota efetiva', valor: pct(r.aliquotaEfetiva), tom: 'neutro' }],
        linhas: [
          { rotulo: `Anexo ${r.anexo} · ${r.faixa}ª faixa`, valor: `${pct(r.aliquotaNominal)} nominal`, tipo: 'info' },
          { rotulo: 'Repartição do DAS', valor: '', tipo: 'titulo' },
          ...r.reparticao.map((x) => ({ rotulo: `${x.tributo} (${pct(x.percentual)})`, valor: brl(x.valor), tipo: 'info' as const })),
          { rotulo: 'Total do DAS', valor: brl(r.das), tipo: 'total' },
        ],
        passos,
        avisos,
      };
    },
  },
  {
    id: 'mei',
    titulo: 'DAS-MEI',
    descricao: 'Valor mensal do DAS do microempreendedor individual.',
    grupo: 'Tributos da empresa',
    tabelas: ['mei', 'salario_minimo'],
    campos: [
      { id: 'atividade', rotulo: 'Atividade', tipo: 'selecao', padrao: 'servicos', opcoes: [{ valor: 'comercio', rotulo: 'Comércio ou indústria' }, { valor: 'servicos', rotulo: 'Serviços' }, { valor: 'ambos', rotulo: 'Comércio e serviços' }] },
      { id: 'caminhoneiro', rotulo: 'MEI transportador autônomo de cargas', tipo: 'booleano', padrao: false },
    ],
    limitacoes: ['MEI com empregado recolhe à parte a CPP de 3% e o FGTS sobre o salário do empregado.'],
    calcular(v, t) {
      const mei = d<c.TabMei>(t, 'mei');
      const sm = d<{ valor: number }>(t, 'salario_minimo').valor;
      const caminhoneiro = v.caminhoneiro === true;
      const r = c.dasMei({ atividade: v.atividade as 'comercio' | 'servicos' | 'ambos', caminhoneiro }, sm, mei);
      return {
        destaques: [{ rotulo: 'DAS mensal', valor: brl(r.total) }, { rotulo: 'Limite anual', valor: brl(r.limite), tom: 'neutro' }],
        linhas: [
          { rotulo: `INSS (${pct(caminhoneiro ? mei.caminhoneiro_percentual : mei.inss_percentual, 0)} do salário mínimo)`, valor: brl(r.inss), tipo: 'info' },
          { rotulo: 'ICMS', valor: brl(r.icms), tipo: 'info' },
          { rotulo: 'ISS', valor: brl(r.iss), tipo: 'info' },
          { rotulo: 'Total do DAS', valor: brl(r.total), tipo: 'total' },
          { rotulo: 'Limite proporcional por mês de atividade', valor: brl(c.arred(r.limite / 12)), tipo: 'info' },
        ],
        passos: [`INSS: ${brl(sm)} × ${pct(caminhoneiro ? mei.caminhoneiro_percentual : mei.inss_percentual, 0)} = ${brl(r.inss)}.`, `Valores fixos: ICMS ${brl(r.icms)} e ISS ${brl(r.iss)}, conforme a atividade.`],
        avisos: [],
      };
    },
  },
  {
    id: 'presumido',
    titulo: 'Lucro Presumido',
    descricao: 'IRPJ, adicional, CSLL, PIS e Cofins sobre a receita do período.',
    grupo: 'Tributos da empresa',
    tabelas: ['lucro_presumido'],
    campos: [
      { id: 'receita', rotulo: 'Receita bruta do período', tipo: 'moeda', padrao: '' },
      { id: 'periodo', rotulo: 'Período', tipo: 'selecao', padrao: '3', opcoes: [{ valor: '3', rotulo: 'Trimestre (apuração do IRPJ/CSLL)' }, { valor: '1', rotulo: 'Um mês (estimativa)' }, { valor: '12', rotulo: 'Ano (estimativa)' }] },
      { id: 'atividade', rotulo: 'Atividade', tipo: 'selecao', padrao: 'servicos', opcoesDe: (t) => Object.entries(d<c.TabPresumido>(t, 'lucro_presumido')?.presuncao ?? {}).map(([k, p]) => ({ valor: k, rotulo: `${p.nome} — presunção ${pct(p.irpj, 1)} IRPJ / ${pct(p.csll, 0)} CSLL` })) },
    ],
    limitacoes: [
      'Não inclui ISS, ICMS, IPI, CPP e demais encargos sobre a folha.',
      'Não soma à base ganhos de capital, rendimentos financeiros e demais receitas, nem deduz retenções na fonte.',
      'Empresa com atividades de presunções diferentes deve calcular cada receita separadamente.',
      'O acréscimo de 10% nos percentuais de presunção da LC 224/2025 (receita anual acima de R$ 5 milhões) NÃO é aplicado nesta simulação — depende de validação com a regulamentação da Receita.',
    ],
    calcular(v, t) {
      const receita = ler(v.receita);
      if (receita <= 0) return null;
      const tab = d<c.TabPresumido>(t, 'lucro_presumido');
      const meses = ler(v.periodo) || 3;
      const r = c.lucroPresumido({ receita, atividade: String(v.atividade), meses }, tab);
      if ('erro' in r) return { erro: r.erro! };
      const avisos: string[] = [];
      const lc = tab.acrescimo_lc224;
      if (lc && (receita / meses) * 12 > lc.limite_anual) avisos.push(`A receita anualizada supera ${brl(lc.limite_anual)}. A LC 224/2025 eleva em ${pct(lc.percentual, 0)} os percentuais de presunção sobre a parcela excedente — este cálculo NÃO aplica o acréscimo. Valide com a regulamentação antes de usar o número.`);
      return {
        destaques: [{ rotulo: 'Tributos federais no período', valor: brl(r.total) }, { rotulo: 'Carga sobre a receita', valor: pct(r.efetiva), tom: 'neutro' }],
        linhas: [
          { rotulo: `Base do IRPJ (${pct(r.presuncao.irpj, 1)} da receita)`, valor: brl(r.baseIrpj), tipo: 'info' },
          { rotulo: `IRPJ (${pct(tab.irpj, 0)})`, valor: brl(r.irpj), tipo: 'info' },
          { rotulo: `Adicional do IRPJ (${pct(tab.adicional_irpj, 0)} sobre o que passa de ${brl(r.limiteAdicional)})`, valor: brl(r.adicional), tipo: 'info' },
          { rotulo: `Base da CSLL (${pct(r.presuncao.csll, 0)} da receita)`, valor: brl(r.baseCsll), tipo: 'info' },
          { rotulo: `CSLL (${pct(tab.csll, 0)})`, valor: brl(r.csll), tipo: 'info' },
          { rotulo: `PIS (${pct(tab.pis)})`, valor: brl(r.pis), tipo: 'info' },
          { rotulo: `Cofins (${pct(tab.cofins, 0)})`, valor: brl(r.cofins), tipo: 'info' },
          { rotulo: 'Total', valor: brl(r.total), tipo: 'total' },
        ],
        passos: [
          `Lucro presumido para o IRPJ: ${brl(receita)} × ${pct(r.presuncao.irpj, 1)} = ${brl(r.baseIrpj)}.`,
          `IRPJ: ${brl(r.baseIrpj)} × ${pct(tab.irpj, 0)} = ${brl(r.irpj)}; adicional de ${pct(tab.adicional_irpj, 0)} sobre a base que exceder ${brl(tab.limite_adicional_mensal)} por mês (${brl(r.limiteAdicional)} no período) = ${brl(r.adicional)}.`,
          `CSLL: ${brl(receita)} × ${pct(r.presuncao.csll, 0)} = ${brl(r.baseCsll)} × ${pct(tab.csll, 0)} = ${brl(r.csll)}.`,
          `PIS e Cofins cumulativos sobre a receita: ${brl(r.pis)} + ${brl(r.cofins)}.`,
        ],
        avisos,
      };
    },
  },
  {
    id: 'comparador',
    titulo: 'Comparador de regimes',
    descricao: 'Estimativa anual: Simples Nacional × Lucro Presumido × Lucro Real.',
    grupo: 'Planejamento',
    tabelas: ['simples_nacional', 'lucro_presumido', 'lucro_real', 'inss_individual'],
    campos: [
      { id: 'receita', rotulo: 'Receita bruta anual', tipo: 'moeda', padrao: '' },
      { id: 'folha', rotulo: 'Folha anual (salários + pró-labore)', tipo: 'moeda', padrao: '' },
      {
        id: 'atividade', rotulo: 'Atividade', tipo: 'selecao', padrao: 'servicos_r',
        opcoes: [
          { valor: 'comercio', rotulo: 'Comércio (Anexo I)' },
          { valor: 'industria', rotulo: 'Indústria (Anexo II)' },
          { valor: 'servicos_iii', rotulo: 'Serviços do Anexo III' },
          { valor: 'servicos_iv', rotulo: 'Serviços do Anexo IV' },
          { valor: 'servicos_r', rotulo: 'Serviços sujeitos ao Fator R (III ou V)' },
        ],
      },
      { id: 'margem', rotulo: 'Margem de lucro antes do IRPJ/CSLL (%)', tipo: 'percentual', padrao: '20', dica: 'Usada só no Lucro Real.' },
      { id: 'creditos', rotulo: 'Compras e custos com crédito de PIS/Cofins (anual)', tipo: 'moeda', padrao: '', dica: 'Usado só no Lucro Real (regime não cumulativo).' },
      { id: 'iss', rotulo: 'ISS do município (%)', tipo: 'percentual', padrao: '5', visivel: (v) => String(v.atividade).startsWith('servicos') },
      { id: 'icms', rotulo: 'ICMS efetivo estimado sobre a receita (%)', tipo: 'percentual', padrao: '0', dica: 'Depois dos créditos. Sem estimativa, deixe 0 e leia a limitação.', visivel: (v) => !String(v.atividade).startsWith('servicos') },
      { id: 'encargos', rotulo: 'Encargos patronais sobre a folha fora do Simples (%)', tipo: 'percentual', padrao: '20', dica: 'CPP de 20%. Some RAT e terceiros se quiser (em geral, 25,8% a 28,8%).' },
    ],
    limitacoes: [
      'É uma TRIAGEM. Não substitui o planejamento tributário feito com a escrituração da empresa.',
      'No Lucro Presumido e no Lucro Real, ICMS/ISS e encargos da folha entram pelos percentuais que você informar; IPI não é considerado.',
      'No Simples, a folha anual é usada como aproximação da folha do Fator R.',
      'Não considera a LC 224/2025, benefícios fiscais, substituição tributária, retenções nem a transição para CBS/IBS.',
    ],
    calcular(v, t) {
      const receita = ler(v.receita);
      if (receita <= 0) return null;
      const folha = ler(v.folha);
      const atividade = String(v.atividade);
      const servico = atividade.startsWith('servicos');
      const simples = d<c.TabSimples>(t, 'simples_nacional');
      const presumido = d<c.TabPresumido>(t, 'lucro_presumido');
      const real = d<c.TabReal>(t, 'lucro_real');
      const municipalEstadual = c.arred((receita * (servico ? ler(v.iss) : ler(v.icms))) / 100);
      const encargos = c.arred((folha * ler(v.encargos)) / 100);

      let anexo = atividade === 'comercio' ? 'I' : atividade === 'industria' ? 'II' : atividade === 'servicos_iv' ? 'IV' : 'III';
      const passos: string[] = [];
      if (atividade === 'servicos_r') {
        const f = c.fatorR(folha, receita, simples);
        anexo = f.anexo;
        passos.push(`Fator R estimado: ${pct(f.fator)} → Anexo ${f.anexo}.`);
      }
      const s = c.simplesNacional({ rbt12: receita, receitaMes: receita, anexo }, simples);
      const foraDoSimples = receita > simples.limite;
      // No Anexo IV a CPP não está no DAS: soma-se à parte.
      const simplesTotal = 'erro' in s ? 0 : c.arred(s.das + (anexo === 'IV' ? encargos : 0));

      const p = c.lucroPresumido({ receita, atividade: servico ? 'servicos' : 'comercio', meses: 12 }, presumido);
      const presumidoTotal = 'erro' in p ? 0 : c.arred(p.total! + municipalEstadual + encargos);
      const lr = c.lucroReal({ receita, lucro: (receita * ler(v.margem)) / 100, creditosPisCofins: ler(v.creditos), meses: 12 }, real);
      const realTotal = c.arred(lr.total + municipalEstadual + encargos);

      const opcoes = [
        ...(foraDoSimples ? [] : [{ nome: `Simples Nacional (Anexo ${anexo})`, total: simplesTotal }]),
        { nome: 'Lucro Presumido', total: presumidoTotal },
        { nome: 'Lucro Real', total: realTotal },
      ].sort((a, b) => a.total - b.total);
      passos.push(
        'erro' in s ? 'Simples: não calculado.' : `Simples: alíquota efetiva de ${pct(s.aliquotaEfetiva)} sobre ${brl(receita)} = ${brl(s.das)}${anexo === 'IV' ? ` + encargos da folha ${brl(encargos)}` : ' (CPP, ICMS/ISS já incluídos)'}.`,
        'erro' in p ? 'Presumido: não calculado.' : `Presumido: tributos federais ${brl(p.total!)} + ${servico ? 'ISS' : 'ICMS'} ${brl(municipalEstadual)} + encargos da folha ${brl(encargos)}.`,
        `Real: IRPJ/CSLL sobre lucro de ${brl((receita * ler(v.margem)) / 100)} e PIS/Cofins não cumulativos = ${brl(lr.total)} + ${servico ? 'ISS' : 'ICMS'} ${brl(municipalEstadual)} + encargos ${brl(encargos)}.`,
      );
      const avisos: string[] = [];
      if (foraDoSimples) avisos.push(`Receita acima de ${brl(simples.limite)}: a empresa não pode optar pelo Simples Nacional.`);
      else if (receita > simples.sublimite) avisos.push(`Receita acima do sublimite de ${brl(simples.sublimite)}: no Simples, ICMS e ISS seriam recolhidos fora do DAS — a comparação fica menos precisa.`);
      if (!servico && ler(v.icms) === 0) avisos.push('ICMS informado como 0%: Presumido e Real estão sem ICMS, enquanto o Simples já o inclui. A comparação favorece artificialmente os dois primeiros.');
      return {
        destaques: [{ rotulo: 'Menor carga estimada', valor: opcoes[0].nome, tom: 'sucesso' }, { rotulo: 'Carga anual', valor: brl(opcoes[0].total), tom: 'neutro' }],
        linhas: [
          ...opcoes.map((o, i) => ({ rotulo: `${i + 1}º · ${o.nome} — ${pct((o.total / receita) * 100)} da receita`, valor: brl(o.total), tipo: (i === 0 ? 'total' : 'info') as 'total' | 'info' })),
          ...(opcoes.length > 1 ? [{ rotulo: `Diferença entre o 1º e o 2º`, valor: brl(c.arred(opcoes[1].total - opcoes[0].total)), tipo: 'info' as const }] : []),
        ],
        passos,
        avisos,
      };
    },
  },
  {
    id: 'projecao',
    titulo: 'Projeção de faturamento e limites',
    descricao: 'Projeta o ano e mostra a folga para os limites de MEI, ME, EPP e sublimite.',
    grupo: 'Planejamento',
    tabelas: ['mei', 'simples_nacional'],
    campos: [
      { id: 'acumulado', rotulo: 'Faturamento acumulado no ano', tipo: 'moeda', padrao: '' },
      { id: 'meses', rotulo: 'Meses já encerrados no ano', tipo: 'numero', padrao: '1' },
      {
        id: 'limite', rotulo: 'Limite a acompanhar', tipo: 'selecao', padrao: 'mei',
        opcoes: [{ valor: 'mei', rotulo: 'MEI' }, { valor: 'me', rotulo: 'Microempresa (ME)' }, { valor: 'sublimite', rotulo: 'Sublimite de ICMS/ISS no Simples' }, { valor: 'epp', rotulo: 'Simples Nacional / EPP' }],
      },
    ],
    limitacoes: [
      'Projeção linear pela média dos meses informados: não considera sazonalidade.',
      'No ano de abertura, os limites são proporcionais aos meses de atividade.',
      'O limite de microempresa (R$ 360.000,00) é o do art. 3º, I, da LC 123/2006.',
    ],
    calcular(v, t) {
      const acumulado = ler(v.acumulado);
      const meses = ler(v.meses);
      if (acumulado <= 0 || meses < 1) return null;
      if (meses > 12) return { erro: 'Informe de 1 a 12 meses.' };
      const simples = d<c.TabSimples>(t, 'simples_nacional');
      const limites: Record<string, number> = { mei: d<c.TabMei>(t, 'mei').limite_anual, me: 360000, sublimite: simples.sublimite, epp: simples.limite };
      const limite = limites[String(v.limite)] ?? limites.mei;
      const r = c.projecaoFaturamento({ acumulado, mesesDecorridos: meses, limite });
      const estoura = r.projecao > limite;
      const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const avisos: string[] = [];
      if (acumulado > limite) avisos.push('O limite já foi ultrapassado no acumulado do ano.');
      else if (r.mesDoEstouro) avisos.push(`Mantida a média, o limite é ultrapassado em ${NOMES[r.mesDoEstouro - 1]}.`);
      if (v.limite === 'mei' && estoura) avisos.push('MEI: excesso de até 20% do limite gera desenquadramento a partir de janeiro do ano seguinte; acima de 20%, o desenquadramento é retroativo ao início do ano (LC 123, art. 18-A, § 7º).');
      return {
        destaques: [{ rotulo: 'Projeção para o ano', valor: brl(r.projecao), tom: estoura ? 'erro' : 'sucesso' }, { rotulo: 'Do limite, projetado', valor: pct(r.percentualProjetado, 1), tom: estoura ? 'erro' : 'neutro' }],
        linhas: [
          { rotulo: 'Limite anual', valor: brl(limite), tipo: 'info' },
          { rotulo: 'Média mensal até agora', valor: brl(r.media), tipo: 'info' },
          { rotulo: 'Já utilizado do limite', valor: pct(r.percentualUsado, 1), tipo: 'info' },
          { rotulo: 'Ainda pode faturar no ano', valor: brl(r.restante), tipo: 'info' },
          { rotulo: `Média máxima nos ${r.mesesRestantes} mês(es) restantes`, valor: r.mesesRestantes ? brl(r.mediaPermitida) : '—', tipo: 'total' },
        ],
        passos: [`Média: ${brl(acumulado)} ÷ ${Math.floor(meses)} = ${brl(r.media)}.`, `Projeção anual: ${brl(r.media)} × 12 = ${brl(r.projecao)} (${pct(r.percentualProjetado, 1)} do limite de ${brl(limite)}).`],
        avisos,
      };
    },
  },
  {
    id: 'acrescimos',
    titulo: 'Tributo federal em atraso',
    descricao: 'Multa de mora e juros de DARF, DAS e GPS pagos depois do vencimento.',
    grupo: 'Tributos da empresa',
    tabelas: ['acrescimos_federais'],
    campos: [
      { id: 'valor', rotulo: 'Valor original', tipo: 'moeda', padrao: '' },
      { id: 'vencimento', rotulo: 'Vencimento', tipo: 'data', padrao: '' },
      { id: 'pagamento', rotulo: 'Data do pagamento', tipo: 'data', padrao: '' },
      { id: 'selic', rotulo: 'Selic acumulada no período (%)', tipo: 'percentual', padrao: '', dica: 'Do mês seguinte ao vencimento até o mês anterior ao pagamento. Consulte a tabela da Receita (link na base legal).' },
    ],
    limitacoes: [
      'A Selic acumulada precisa ser informada: o portal não consulta a tabela da Receita automaticamente.',
      'Vale para multa de mora em pagamento espontâneo. Não calcula multa de ofício, multa por atraso de declaração nem tributos estaduais e municipais.',
      'Para emitir a guia, use o Sicalc ou o PGDAS-D, que são a fonte oficial do valor atualizado.',
    ],
    calcular(v, t) {
      const valor = ler(v.valor);
      const vencimento = String(v.vencimento ?? '');
      const pagamento = String(v.pagamento ?? '');
      if (valor <= 0 || !vencimento || !pagamento) return null;
      if (pagamento < vencimento) return { erro: 'O pagamento é anterior ao vencimento: não há acréscimos.' };
      const tab = d<c.TabAcrescimos>(t, 'acrescimos_federais');
      const r = c.acrescimosFederais({ valor, vencimento, pagamento, selicAcumulada: ler(v.selic) }, tab);
      const avisos: string[] = [];
      if (r.mesesSelic > 0 && ler(v.selic) === 0) avisos.push(`Há ${r.mesesSelic} mês(es) de Selic a considerar e o campo está em branco: os juros abaixo estão subestimados.`);
      return {
        destaques: [{ rotulo: 'Total a pagar', valor: brl(r.total) }, { rotulo: 'Acréscimos', valor: brl(c.arred(r.multa + r.juros)), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Valor original', valor: brl(valor), tipo: 'info' },
          { rotulo: `Multa de mora (${pct(r.percentualMulta)} — ${r.dias} dia(s))`, valor: brl(r.multa), tipo: 'info' },
          { rotulo: `Juros (${pct(r.percentualJuros)})`, valor: brl(r.juros), tipo: 'info' },
          { rotulo: 'Total', valor: brl(r.total), tipo: 'total' },
        ],
        passos: [
          `Multa: ${r.dias} dia(s) × ${pct(tab.multa_dia)} = ${pct(r.dias * tab.multa_dia)}, limitada a ${pct(tab.multa_teto, 0)} → ${pct(r.percentualMulta)}.`,
          r.percentualJuros === 0 ? 'Pagamento no mesmo mês do vencimento: não há juros.' : `Juros: Selic de ${r.mesesSelic} mês(es) (${pct(ler(v.selic))}) + ${pct(tab.juros_mes_pagamento, 0)} do mês do pagamento = ${pct(r.percentualJuros)}.`,
        ],
        avisos,
      };
    },
  },
  {
    id: 'dias-uteis',
    titulo: 'Dias úteis e prazos',
    descricao: 'Conta dias úteis entre duas datas ou soma dias úteis a uma data.',
    grupo: 'Utilitários',
    tabelas: [],
    campos: [
      { id: 'modo', rotulo: 'O que calcular', tipo: 'selecao', padrao: 'contar', opcoes: [{ valor: 'contar', rotulo: 'Dias úteis entre duas datas' }, { valor: 'somar', rotulo: 'Data final somando dias úteis' }] },
      { id: 'inicio', rotulo: 'Data inicial', tipo: 'data', padrao: '' },
      { id: 'fim', rotulo: 'Data final', tipo: 'data', padrao: '', visivel: (v) => v.modo !== 'somar' },
      { id: 'dias', rotulo: 'Dias úteis a somar', tipo: 'numero', padrao: '5', visivel: (v) => v.modo === 'somar' },
    ],
    limitacoes: [
      'Considera sábados, domingos, feriados nacionais e os feriados cadastrados no Calendário do portal.',
      'Feriados estaduais e municipais só entram se estiverem cadastrados no Calendário. Carnaval e Corpus Christi são tratados como não úteis.',
      'A contagem começa no dia seguinte à data inicial.',
    ],
    calcular(v, _t, x) {
      const inicio = String(v.inicio ?? '');
      if (!inicio) return null;
      if (v.modo === 'somar') {
        const dias = Math.floor(ler(v.dias));
        if (dias < 1 || dias > 3660) return { erro: 'Informe de 1 a 3.660 dias úteis.' };
        const fim = c.somarDiasUteis(inicio, dias, x.ehUtil);
        const semana = new Date(`${fim}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
        return {
          destaques: [{ rotulo: 'Data final', valor: c.dataBr(fim) }, { rotulo: 'Dia da semana', valor: semana, tom: 'neutro' }],
          linhas: [{ rotulo: `${dias} dia(s) úteis depois de ${c.dataBr(inicio)}`, valor: c.dataBr(fim), tipo: 'total' }],
          passos: [`Contando a partir do dia seguinte a ${c.dataBr(inicio)} e pulando fins de semana e feriados.`],
          avisos: [],
        };
      }
      const fim = String(v.fim ?? '');
      if (!fim) return null;
      if (fim < inicio) return { erro: 'A data final é anterior à inicial.' };
      const r = c.contarDiasUteis(inicio, fim, x.ehUtil);
      return {
        destaques: [{ rotulo: 'Dias úteis', valor: String(r.uteis) }, { rotulo: 'Dias corridos', valor: String(r.corridos), tom: 'neutro' }],
        linhas: [
          { rotulo: 'Dias úteis', valor: String(r.uteis), tipo: 'total' },
          { rotulo: 'Dias corridos', valor: String(r.corridos), tipo: 'info' },
          { rotulo: 'Fins de semana e feriados', valor: String(r.corridos - r.uteis), tipo: 'info' },
        ],
        passos: [`De ${c.dataBr(inicio)} (exclusive) a ${c.dataBr(fim)} (inclusive).`],
        avisos: [],
      };
    },
  },
  {
    id: 'validador',
    titulo: 'Validador de CPF e CNPJ',
    descricao: 'Confere os dígitos verificadores, inclusive do CNPJ alfanumérico.',
    grupo: 'Utilitários',
    tabelas: [],
    campos: [{ id: 'documento', rotulo: 'CPF ou CNPJ', tipo: 'texto', padrao: '' }],
    limitacoes: [
      'Confere apenas os dígitos verificadores: não consulta a situação cadastral na Receita Federal.',
      'O CNPJ alfanumérico segue a IN RFB 2.229/2024. As demais telas do portal ainda tratam o CNPJ como numérico.',
    ],
    calcular(v) {
      const bruto = String(v.documento ?? '').trim();
      const limpo = bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (limpo.length < 11) return null;
      const ehCpf = limpo.length === 11 && /^\d+$/.test(limpo);
      if (!ehCpf && limpo.length !== 14) return { erro: 'CPF tem 11 dígitos e CNPJ tem 14 caracteres.' };
      const valido = ehCpf ? c.cpfValido(limpo) : c.cnpjValidoAlfanumerico(limpo);
      const formatado = ehCpf ? limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : limpo.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
      return {
        destaques: [{ rotulo: ehCpf ? 'CPF' : 'CNPJ', valor: valido ? 'Válido' : 'Inválido', tom: valido ? 'sucesso' : 'erro' }],
        linhas: [
          { rotulo: 'Documento', valor: formatado, tipo: 'info' },
          { rotulo: 'Dígitos verificadores', valor: valido ? 'Conferem' : 'Não conferem', tipo: 'total' },
          ...(!ehCpf ? [{ rotulo: 'Formato', valor: /[A-Z]/.test(limpo) ? 'Alfanumérico' : 'Numérico', tipo: 'info' as const }, { rotulo: 'Estabelecimento', valor: limpo.slice(8, 12) === '0001' ? 'Matriz (0001)' : `Filial (${limpo.slice(8, 12)})`, tipo: 'info' as const }] : []),
        ],
        passos: ['Os dois últimos dígitos são recalculados pelo módulo 11 a partir dos anteriores e comparados com os informados.'],
        avisos: [],
      };
    },
  },
];

export const GRUPOS_FERRAMENTAS: Ferramenta['grupo'][] = ['Folha e pessoal', 'Tributos da empresa', 'Planejamento', 'Utilitários'];

/** A tabela em vigor na data: a de maior `vigencia_inicio` que não seja futura. */
export function tabelasVigentes(todas: TabelaFerramenta[], dataRef: string): Tabelas {
  const mapa: Tabelas = {};
  for (const tb of todas) {
    if (tb.vigencia_inicio > dataRef) continue;
    const atual = mapa[tb.chave];
    if (!atual || tb.vigencia_inicio > atual.vigencia_inicio) mapa[tb.chave] = tb;
  }
  return mapa;
}

export function valoresPadrao(f: Ferramenta): Valores {
  return Object.fromEntries(f.campos.map((cp) => [cp.id, cp.padrao]));
}
