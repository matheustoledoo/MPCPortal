/**
 * Integração de Clientes — o roteiro da reunião de integração do cliente
 * novo, por departamento.
 *
 * O conteúdo abaixo (FICHA_BASE e ROTEIROS) foi copiado sem alteração do
 * Portal Meta Plano (index.html, revisado pela equipe em out/2026) por um
 * script que lê o arquivo original — nada foi redigitado à mão.
 *
 * Cada departamento preenche só o seu roteiro; ao finalizar, libera o
 * relatório em PDF daquele departamento. A ficha do cliente é comum a todos.
 */

import type { Departamento } from '@/types/banco';

export type DepartamentoIntegracao = "Qualidade" | "Legalização" | "Fiscal" | "Contabilidade" | "Departamento Pessoal";

export interface CampoFicha {
  id: string;
  l: string;
  /** "date" | "radio" (com op) | texto */
  t?: string;
  op?: string[];
  full?: boolean | number;
  cnpj?: boolean;
  area?: boolean | number;
  /** Valor sugerido. */
  d?: string;
}

export interface ItemRoteiro {
  id: string;
  n: string;
  t: string;
  /** Obrigatório (★). */
  e?: number;
  /** Escolha múltipla. */
  multi?: number;
  op?: string[];
  /** Rótulo das opções. */
  opl?: string;
  campos?: CampoFicha[];
  /** O que orientar o cliente. */
  o?: string;
}

export interface Roteiro {
  titulo?: string;
  assinatura: string;
  ficha: CampoFicha[];
  secoes: { titulo: string; itens: ItemRoteiro[] }[];
  prazos: { id: string; q: string; oq: string; p: string; obs: string }[];
  checklist: { grupo: string; cond?: "abertura" | "transferencia"; itens: [string, string, string][] }[];
}

export const INTEG_DEPTS: DepartamentoIntegracao[] = [
  "Qualidade",
  "Legalização",
  "Fiscal",
  "Contabilidade",
  "Departamento Pessoal"
];

export const CANAL_ACESSORIAS = "Documentos e solicitações sempre pelo Acessórias. WhatsApp e e-mail ficam para recados, para nada se perder.";

export const FICHA_BASE: CampoFicha[] = [
  {
    "id": "empresa",
    "l": "Cliente (razão social)",
    "full": true
  },
  {
    "id": "cnpj",
    "l": "CNPJ",
    "cnpj": true
  },
  {
    "id": "responsavel",
    "l": "Responsável / sócio"
  },
  {
    "id": "abertura",
    "l": "Data de abertura",
    "t": "date"
  },
  {
    "id": "dataReuniao",
    "l": "Data da reunião",
    "t": "date"
  },
  {
    "id": "atividade",
    "l": "Atividade",
    "full": true
  },
  {
    "id": "regime",
    "l": "Regime tributário",
    "t": "radio",
    "op": [
      "MEI",
      "Simples Nacional",
      "Lucro Presumido",
      "Lucro Real"
    ],
    "full": true
  },
  {
    "id": "inicio",
    "l": "Início na Meta Plano",
    "t": "radio",
    "op": [
      "Abertura de empresa com a MPC",
      "Transferida de outro contador"
    ],
    "full": true
  },
  {
    "id": "contadorAnterior",
    "l": "Contador anterior / contato (se transferida)",
    "full": true
  },
  {
    "id": "canal",
    "l": "Contato / canal de envio combinado"
  },
  {
    "id": "telefone",
    "l": "Telefone"
  },
  {
    "id": "email",
    "l": "E-mail"
  },
  {
    "id": "modalidade",
    "l": "Modalidade da reunião",
    "t": "radio",
    "op": [
      "Presencial",
      "On-line",
      "Telefone"
    ]
  }
];

export const ROTEIROS: Record<DepartamentoIntegracao, Roteiro> = {
  "Qualidade": {
    "assinatura": "Responsável Qualidade — Meta Plano",
    "ficha": [
      {
        "id": "respContabil",
        "l": "Responsável Contábil"
      },
      {
        "id": "respFiscal",
        "l": "Responsável Fiscal"
      },
      {
        "id": "respDP",
        "l": "Responsável Departamento Pessoal"
      },
      {
        "id": "respSoc",
        "l": "Responsável Societário / Legalização"
      }
    ],
    "secoes": [
      {
        "titulo": "1 Abertura da reunião",
        "itens": [
          {
            "id": "boasvindas",
            "n": "1.1",
            "t": "Boas-vindas e apresentação da Meta Plano",
            "e": 1,
            "o": "Apresentar o escritório, a equipe e como funciona o atendimento. Explicar como a reunião vai acontecer até o final."
          },
          {
            "id": "participantes",
            "n": "1.2",
            "t": "Explicar como será a reunião e quem vai participar",
            "e": 1,
            "multi": 1,
            "op": [
              "Societário / Legalização",
              "Fiscal",
              "Contábil",
              "Departamento Pessoal"
            ],
            "o": "A Qualidade abre, apresenta os portais e os canais; depois cada departamento faz o seu roteiro."
          },
          {
            "id": "origem",
            "n": "1.3",
            "t": "A empresa é nova ou foi transferida de outro contador?",
            "e": 1,
            "op": [
              "Abertura",
              "Transferência"
            ],
            "o": "Enviar o e-mail de boas-vindas. Se for transferência, avisar que os departamentos vão pedir a documentação do contador anterior."
          }
        ]
      },
      {
        "titulo": "2 Portais do cliente",
        "itens": [
          {
            "id": "portais",
            "n": "2.1",
            "t": "Apresentar os portais (Acessórias e Onvio)",
            "e": 1,
            "o": "Acessórias: solicitações gerais e envio de guias e documentos. Onvio: informações do Departamento Pessoal (admissão, rescisão, férias, afastamento e folha)."
          },
          {
            "id": "acesso",
            "n": "2.2",
            "t": "Criar o acesso do cliente no Acessórias e no Onvio",
            "e": 1,
            "campos": [
              {
                "id": "u1",
                "l": "Usuário 1 (nome)"
              },
              {
                "id": "e1",
                "l": "E-mail do usuário 1"
              },
              {
                "id": "u2",
                "l": "Usuário 2 (nome)"
              },
              {
                "id": "e2",
                "l": "E-mail do usuário 2"
              }
            ],
            "o": "Quem terá acesso (sócio, financeiro, RH)? Cadastrar cada um com o próprio e-mail."
          },
          {
            "id": "pratica",
            "n": "2.3",
            "t": "Mostrar na prática",
            "e": 1,
            "multi": 1,
            "op": [
              "Como enviar um documento",
              "Onde baixar guias, folha e relatórios",
              "Notificações e avisos de vencimento",
              "Aplicativo no celular"
            ]
          },
          {
            "id": "primeiro",
            "n": "2.4",
            "t": "O cliente fez o primeiro acesso durante a reunião?",
            "op": [
              "Sim",
              "Não"
            ],
            "campos": [
              {
                "id": "motivo",
                "l": "Se não, qual o motivo"
              }
            ]
          },
          {
            "id": "sempreportal",
            "n": "2.5",
            "t": "Combinar que os documentos vão sempre pelos portais",
            "e": 1,
            "o": "WhatsApp e e-mail ficam para recados. Documento enviado fora do portal pode se perder ou atrasar o fechamento."
          }
        ]
      },
      {
        "titulo": "3 Canais de atendimento",
        "itens": [
          {
            "id": "canais",
            "n": "3.1",
            "t": "Passar os canais oficiais da Meta Plano",
            "e": 1,
            "campos": [
              {
                "id": "horario",
                "l": "Horário de atendimento"
              }
            ],
            "o": "Acessórias: solicitações gerais e envio de guias e documentos · Onvio: documentos da folha · WhatsApp: recados e dúvidas rápidas · Telefone: atendimento · E-mail: assuntos formais."
          },
          {
            "id": "quem",
            "n": "3.2",
            "t": "Quem procurar por assunto",
            "e": 1,
            "o": "Mostrar o quadro de responsáveis por departamento (na ficha acima)."
          },
          {
            "id": "sla",
            "n": "3.3",
            "t": "Prazo de retorno das solicitações",
            "o": "Conforme o SLA."
          },
          {
            "id": "contatos",
            "n": "3.4",
            "t": "Quem da empresa pode falar com a Meta Plano?",
            "e": 1,
            "campos": [
              {
                "id": "c1",
                "l": "Contato 1 (nome · função · telefone/e-mail)",
                "full": 1
              },
              {
                "id": "c2",
                "l": "Contato 2",
                "full": 1
              },
              {
                "id": "c3",
                "l": "Contato 3",
                "full": 1
              }
            ]
          }
        ]
      }
    ],
    "prazos": [],
    "checklist": []
  },
  "Legalização": {
    "titulo": "Societário / Legalização",
    "assinatura": "Responsável Societário / Legalização — Meta Plano",
    "ficha": [
      {
        "id": "capital",
        "l": "Capital social (R$)"
      },
      {
        "id": "socios",
        "l": "Sócios / administrador",
        "full": true
      }
    ],
    "secoes": [
      {
        "titulo": "1 Boas-vindas e comunicação",
        "itens": [
          {
            "id": "resp",
            "n": "1.1",
            "t": "Apresentar o responsável do departamento e como falar com ele",
            "e": 1,
            "campos": [
              {
                "id": "nome",
                "l": "Nome do responsável"
              },
              {
                "id": "contato",
                "l": "Contato"
              }
            ]
          },
          {
            "id": "canal",
            "n": "1.2",
            "t": "Canal oficial de envio de documentos",
            "e": 1,
            "o": "Documentos e solicitações sempre pelo Acessórias. WhatsApp e e-mail ficam para recados, para nada se perder."
          },
          {
            "id": "transf",
            "n": "1.3",
            "t": "A empresa foi transferida de outro contador?",
            "e": 1,
            "op": [
              "Não (abertura)",
              "Sim"
            ],
            "o": "Se sim, pedir o termo de transferência e as senhas/acessos que estavam com o contador anterior."
          }
        ]
      },
      {
        "titulo": "2 Roteiro societário / legalização",
        "itens": [
          {
            "id": "contrato",
            "n": "2.1",
            "t": "Conferir contrato social, sócios, administrador e capital",
            "e": 1,
            "o": "Confirmar se o que está no contrato corresponde à realidade da empresa."
          },
          {
            "id": "certificado",
            "n": "2.2",
            "t": "Tem certificado digital e-CNPJ?",
            "e": 1,
            "op": [
              "Sim",
              "Não"
            ],
            "campos": [
              {
                "id": "validade",
                "l": "Validade",
                "t": "date"
              }
            ],
            "o": "Sem certificado: emitir ou passar procuração eletrônica no e-CAC. Avisar a renovação antes do vencimento."
          },
          {
            "id": "alvaras",
            "n": "2.3",
            "t": "Alvarás e licenças da atividade estão em dia?",
            "e": 1,
            "op": [
              "Sim",
              "Não",
              "Não sabe"
            ],
            "o": "Verificar exigências da atividade (funcionamento, vigilância sanitária, bombeiros) e anotar vencimentos."
          },
          {
            "id": "endereco",
            "n": "2.4",
            "t": "Endereço da empresa",
            "op": [
              "Próprio",
              "Alugado",
              "Fiscal / virtual"
            ],
            "o": "Alugado: guardar e enviar o contrato de locação. Mudança de endereço precisa de alteração contratual antes."
          },
          {
            "id": "alteracao",
            "n": "2.5",
            "t": "Pretende alterar endereço, sócios, capital ou atividade?",
            "op": [
              "Não",
              "Sim"
            ],
            "o": "Avisar a MPC antes de qualquer mudança para fazermos a alteração contratual primeiro."
          }
        ]
      }
    ],
    "prazos": [
      {
        "id": "mudanca",
        "q": "Cliente → MPC",
        "oq": "Mudança de endereço, sócios, capital ou atividade",
        "p": "Antes de mudar",
        "obs": "A alteração contratual vem primeiro"
      },
      {
        "id": "certif",
        "q": "Cliente → MPC",
        "oq": "Renovação do certificado digital",
        "p": "Antes do vencimento",
        "obs": "Validade anotada no item 2.2"
      },
      {
        "id": "alvara",
        "q": "MPC → Cliente",
        "oq": "Aviso de vencimento de alvarás e licenças",
        "p": "",
        "obs": "Conforme exigência da atividade"
      }
    ],
    "checklist": [
      {
        "grupo": "Todos os clientes",
        "itens": [
          [
            "contrato",
            "Contrato social e alterações (ou requerimento de empresário)",
            ""
          ],
          [
            "cartao",
            "Cartão CNPJ e inscrições estadual / municipal",
            ""
          ],
          [
            "docsocios",
            "Documentos pessoais dos sócios (RG/CPF, comprovante de endereço)",
            ""
          ],
          [
            "certificado",
            "Certificado digital e-CNPJ ou procuração eletrônica (e-CAC)",
            "Anotar validade"
          ],
          [
            "alvaras",
            "Alvarás e licenças da atividade",
            "Funcionamento, vigilância sanitária, bombeiros…"
          ],
          [
            "locacao",
            "Contrato de locação do imóvel",
            "Se alugado"
          ]
        ]
      },
      {
        "grupo": "Abertura de empresa",
        "cond": "abertura",
        "itens": [
          [
            "integralizacao",
            "Comprovante de integralização do capital social",
            "Depósito ou bens"
          ]
        ]
      },
      {
        "grupo": "Transferência — solicitar ao contador anterior",
        "cond": "transferencia",
        "itens": [
          [
            "termo",
            "Termo de transferência / entrega de documentos assinado",
            ""
          ],
          [
            "senhas",
            "Senhas e acessos que estavam com o contador anterior",
            ""
          ],
          [
            "pastas",
            "Pastas societárias (atos, alterações, licenças)",
            ""
          ]
        ]
      }
    ]
  },
  "Fiscal": {
    "assinatura": "Responsável Fiscal — Meta Plano",
    "ficha": [
      {
        "id": "ie",
        "l": "Inscrição estadual / municipal"
      },
      {
        "id": "emite",
        "l": "Emite nota de",
        "t": "radio",
        "op": [
          "Serviço",
          "Produto",
          "Serviço e produto",
          "Ainda não emite"
        ],
        "full": true
      },
      {
        "id": "ondeEmite",
        "l": "Onde emite as notas"
      },
      {
        "id": "primeiroFat",
        "l": "Primeiro faturamento em"
      },
      {
        "id": "valorFat",
        "l": "Valor faturado (R$)"
      }
    ],
    "secoes": [
      {
        "titulo": "1 Boas-vindas e comunicação",
        "itens": [
          {
            "id": "resp",
            "n": "1.1",
            "t": "Apresentar o responsável do departamento e como falar com ele",
            "e": 1,
            "campos": [
              {
                "id": "nome",
                "l": "Nome do responsável"
              },
              {
                "id": "contato",
                "l": "Contato"
              }
            ]
          },
          {
            "id": "canal",
            "n": "1.2",
            "t": "Canal oficial de envio de documentos",
            "e": 1,
            "o": "Documentos e solicitações sempre pelo Acessórias. WhatsApp e e-mail ficam para recados, para nada se perder."
          },
          {
            "id": "transf",
            "n": "1.3",
            "t": "A empresa foi transferida de outro contador?",
            "e": 1,
            "op": [
              "Não (abertura)",
              "Sim"
            ],
            "o": "Se sim, pedir declarações, apurações e guias anteriores e levantar a situação fiscal (CND / relatório do e-CAC) — checklist no final."
          }
        ]
      },
      {
        "titulo": "2 Roteiro fiscal",
        "itens": [
          {
            "id": "resumo",
            "n": "2.1",
            "t": "Pedir ao cliente um breve resumo da atividade da empresa",
            "e": 1,
            "campos": [
              {
                "id": "texto",
                "l": "Resumo da atividade",
                "area": 1,
                "full": 1
              }
            ]
          },
          {
            "id": "regime",
            "n": "2.2",
            "t": "Explicar o regime tributário e como os impostos são calculados",
            "e": 1,
            "opl": "Atividade do Anexo V do Simples?",
            "op": [
              "Não",
              "Sim — Fator R explicado"
            ],
            "o": "Anotar o regime na ficha e explicar o que muda conforme o faturamento. Se a empresa tiver atividade do Anexo V do Simples Nacional, explicar o Fator R."
          },
          {
            "id": "notas",
            "n": "2.3",
            "t": "Como emite as notas fiscais?",
            "e": 1,
            "op": [
              "Prefeitura",
              "Sistema próprio",
              "Ainda não emite"
            ],
            "campos": [
              {
                "id": "estimativa",
                "l": "Estimativa de faturamento (se ainda não emitiu nenhuma NF)"
              }
            ],
            "o": "Todo recebimento deve ter nota. Enviar também as notas canceladas. Se a empresa ainda não emitiu nenhuma NF, perguntar qual a estimativa de faturamento."
          },
          {
            "id": "compras",
            "n": "2.4",
            "t": "Notas de compras e serviços tomados",
            "e": 1,
            "o": "Enviar XML/PDF todo mês, até o 3º dia útil, pelo Acessórias. Atenção às retenções em serviços tomados."
          },
          {
            "id": "vendas",
            "n": "2.5",
            "t": "Notas de venda e relatório de faturamento",
            "e": 1,
            "o": "Enviar as notas de venda (XML/PDF) e o relatório de faturamento até o 3º dia útil, pelo Acessórias."
          },
          {
            "id": "guias",
            "n": "2.6",
            "t": "Envio e pagamento das guias",
            "e": 1,
            "o": "As guias são enviadas pela MPC. O vencimento será no mês seguinte à emissão da NF."
          }
        ]
      }
    ],
    "prazos": [
      {
        "id": "compras",
        "q": "Cliente → MPC",
        "oq": "Notas de compras e serviços tomados (XML/PDF)",
        "p": "Até o 3º dia útil",
        "obs": "Pelo Acessórias"
      },
      {
        "id": "vendas",
        "q": "Cliente → MPC",
        "oq": "Notas de venda (XML/PDF) e relatório de faturamento",
        "p": "Até o 3º dia útil",
        "obs": "Pelo Acessórias"
      }
    ],
    "checklist": [
      {
        "grupo": "Todos os clientes",
        "itens": [
          [
            "prefeitura",
            "Acesso ao portal da prefeitura / emissor de notas",
            ""
          ],
          [
            "sefaz",
            "Acesso à SEFAZ",
            "Se tiver inscrição estadual"
          ],
          [
            "xml",
            "Notas emitidas e recebidas do mês de início (XML)",
            ""
          ]
        ]
      },
      {
        "grupo": "Transferência — solicitar ao contador anterior",
        "cond": "transferencia",
        "itens": [
          [
            "declaracoes",
            "Últimas declarações (DEFIS/PGDAS-D ou DCTFWeb, EFD, SPED Fiscal)",
            ""
          ],
          [
            "apuracoes",
            "Apurações e guias pagas dos últimos 12 meses",
            ""
          ],
          [
            "parcelamentos",
            "Parcelamentos ativos e relatório de situação fiscal / CNDs",
            ""
          ]
        ]
      }
    ]
  },
  "Contabilidade": {
    "titulo": "Contábil",
    "assinatura": "Responsável Contábil — Meta Plano",
    "ficha": [
      {
        "id": "capital",
        "l": "Capital social (R$)"
      },
      {
        "id": "bancos",
        "l": "Banco(s) que utiliza"
      },
      {
        "id": "primeiroFat",
        "l": "Primeiro faturamento em"
      },
      {
        "id": "valorFat",
        "l": "Valor faturado (R$)"
      },
      {
        "id": "despesas",
        "l": "Despesas fixas mensais",
        "full": true
      },
      {
        "id": "cartao",
        "l": "Usa máquina de cartão?",
        "t": "radio",
        "op": [
          "Sim",
          "Não"
        ]
      }
    ],
    "secoes": [
      {
        "titulo": "1 Boas-vindas e comunicação",
        "itens": [
          {
            "id": "resp",
            "n": "1.1",
            "t": "Apresentar o responsável do departamento e como falar com ele",
            "e": 1,
            "campos": [
              {
                "id": "nome",
                "l": "Nome do responsável"
              },
              {
                "id": "contato",
                "l": "Contato"
              }
            ]
          },
          {
            "id": "canal",
            "n": "1.2",
            "t": "Canal oficial de envio de documentos",
            "e": 1,
            "o": "Documentos e solicitações sempre pelo Acessórias. WhatsApp e e-mail ficam para recados, para nada se perder."
          },
          {
            "id": "transf",
            "n": "1.3",
            "t": "A empresa foi transferida de outro contador?",
            "e": 1,
            "op": [
              "Não (abertura)",
              "Sim"
            ],
            "o": "Se sim, solicitar a documentação contábil do contador anterior (checklist no final)."
          }
        ]
      },
      {
        "titulo": "2 Roteiro contábil",
        "itens": [
          {
            "id": "conciliacao",
            "n": "2.1",
            "t": "Faz conciliação bancária (baixa de pagamentos e recebimentos conforme o extrato)? Como?",
            "e": 1,
            "op": [
              "Sistema",
              "Planilha",
              "Não faz"
            ],
            "campos": [
              {
                "id": "sistema",
                "l": "Qual sistema"
              }
            ],
            "o": "Planilha: enviar pelo Acessórias para análise e combinar que, se não atender a contabilidade, enviaremos a nossa planilha padrão."
          },
          {
            "id": "estoque",
            "n": "2.2",
            "t": "A empresa tem controle de estoque?",
            "e": 1,
            "op": [
              "Sim",
              "Não"
            ],
            "o": "Se sim: enviar o estoque final todo mês, para contabilização. Se não: as compras são lançadas direto nos custos."
          },
          {
            "id": "ativo",
            "n": "2.3",
            "t": "Já comprou, ou pretende comprar, algum ativo (veículo, equipamento)?",
            "e": 1,
            "op": [
              "Sim",
              "Não"
            ],
            "o": "Principalmente quando não há NF. Ex.: veículo exige documento do veículo, data e valor da compra."
          },
          {
            "id": "mensais",
            "n": "2.4",
            "t": "Documentos mensais — enviar até o 5º dia útil",
            "e": 1,
            "multi": 1,
            "op": [
              "Extratos da conta corrente e da aplicação financeira, em PDF e Excel (reforçar as aplicações)",
              "Planilha de conciliação bancária e/ou acesso ao sistema (API) para busca dos lançamentos",
              "Controle de estoque (quando houver)",
              "Documentos de suporte: termos de empréstimos, financiamentos, consórcios — conforme surgir",
              "Relação de ativos, se houver",
              "Locação de imóvel: contrato e data de pagamento"
            ]
          },
          {
            "id": "fiscalcontabil",
            "n": "2.5",
            "t": "Explicar a diferença entre fiscal e contábil",
            "e": 1,
            "o": "Fiscal: regime tributário, nota fiscal e impostos. Contábil: DRE, balancete e balanço."
          },
          {
            "id": "retirada",
            "n": "2.6",
            "t": "Retirada dos sócios",
            "e": 1,
            "op": [
              "Pró-labore",
              "Distribuição de lucros",
              "Os dois",
              "Ainda não definiu"
            ],
            "o": "Dinheiro que o sócio tira da empresa não é despesa da empresa. Toda retirada precisa ser registrada como pró-labore (passa pela folha e tem INSS; valor mínimo = salário mínimo) ou como distribuição de lucros (isenta, limitada ao lucro apurado pela contabilidade). Não pagar contas pessoais pela conta da empresa e informar à contabilidade as retiradas feitas no mês."
          },
          {
            "id": "prazos",
            "n": "2.7",
            "t": "Combinar os prazos de entrega",
            "e": 1,
            "o": "A contabilidade fecha após a conclusão do fiscal. Exemplo: o balancete de janeiro é concluído até 31/03."
          }
        ]
      }
    ],
    "prazos": [
      {
        "id": "extratos",
        "q": "Cliente → MPC",
        "oq": "Extratos (conta corrente e aplicações), conciliação e documentos de suporte",
        "p": "Até o 5º dia útil",
        "obs": "PDF e Excel, pelo Acessórias"
      },
      {
        "id": "estoque",
        "q": "Cliente → MPC",
        "oq": "Estoque final do mês",
        "p": "Até o 5º dia útil",
        "obs": "Se tiver estoque"
      },
      {
        "id": "balancete",
        "q": "MPC → Cliente",
        "oq": "Balancete / DRE",
        "p": "Após o fechamento fiscal",
        "obs": "Ex.: balancete de janeiro concluído até 31/03"
      }
    ],
    "checklist": [
      {
        "grupo": "Todos os clientes",
        "itens": [
          [
            "extratos",
            "Extratos bancários do mês de início (conta e aplicações)",
            "Saldo inicial"
          ],
          [
            "emprestimos",
            "Contratos de empréstimos, financiamentos e consórcios",
            "Se houver"
          ],
          [
            "ativos",
            "Relação de ativos (veículos, equipamentos)",
            "Com data e valor de compra"
          ],
          [
            "locacao",
            "Contrato de locação do imóvel",
            "Valor e data de pagamento"
          ]
        ]
      },
      {
        "grupo": "Abertura de empresa",
        "cond": "abertura",
        "itens": [
          [
            "integralizacao",
            "Comprovante de integralização do capital social",
            "Depósito ou bens"
          ],
          [
            "despabertura",
            "Comprovantes das despesas de abertura",
            "Taxas, honorários, registro"
          ]
        ]
      },
      {
        "grupo": "Transferência — solicitar ao contador anterior",
        "cond": "transferencia",
        "itens": [
          [
            "balanco",
            "Balanço e DRE dos últimos exercícios",
            ""
          ],
          [
            "balancete",
            "Balancete do último mês encerrado",
            ""
          ],
          [
            "livros",
            "Livros Diário e Razão; recibos de ECD e ECF",
            ""
          ],
          [
            "imobilizado",
            "Controle do imobilizado e depreciação",
            ""
          ],
          [
            "saldoestoque",
            "Saldo de estoque",
            "Se tiver estoque"
          ]
        ]
      }
    ]
  },
  "Departamento Pessoal": {
    "assinatura": "Responsável Departamento Pessoal — Meta Plano",
    "ficha": [
      {
        "id": "funcionarios",
        "l": "Tem funcionários? Quantos?"
      },
      {
        "id": "prolabore",
        "l": "Sócios com pró-labore (quem / valor)"
      },
      {
        "id": "sindicato",
        "l": "Sindicato / convenção coletiva"
      },
      {
        "id": "dataSalario",
        "l": "Data de pagamento dos salários"
      }
    ],
    "secoes": [
      {
        "titulo": "1 Boas-vindas e comunicação",
        "itens": [
          {
            "id": "resp",
            "n": "1.1",
            "t": "Apresentar o responsável do departamento e como falar com ele",
            "e": 1,
            "campos": [
              {
                "id": "nome",
                "l": "Nome do responsável",
                "d": "Helen"
              },
              {
                "id": "contato",
                "l": "Contato",
                "d": "E-mail, telefone da área (ligação em casos de emergência) e WhatsApp"
              }
            ]
          },
          {
            "id": "canal",
            "n": "1.2",
            "t": "Canal oficial de envio de documentos",
            "e": 1,
            "o": "Solicitações e documentos pelo Acessórias; informações da folha (admissão, rescisão, férias, afastamento e folha) no Onvio. WhatsApp e e-mail ficam para recados."
          },
          {
            "id": "transf",
            "n": "1.3",
            "t": "A empresa foi transferida de outro contador?",
            "e": 1,
            "op": [
              "Não (abertura)",
              "Sim"
            ],
            "o": "Se sim, pedir ao contador anterior: fichas de registro, folhas, férias, rescisões, FGTS, eSocial, financeiro, arquivos SEFIP e senha do seguro-desemprego (checklist no final)."
          }
        ]
      },
      {
        "titulo": "2 Roteiro departamento pessoal",
        "itens": [
          {
            "id": "funcionarios",
            "n": "2.1",
            "t": "Tem funcionários?",
            "e": 1,
            "op": [
              "Não",
              "Sim"
            ],
            "campos": [
              {
                "id": "qtd",
                "l": "Quantos"
              }
            ],
            "o": "Se já são registrados, enviar os documentos; se não, enviar a programação para registro. Assuntos pontuais, dúvidas e solicitações pelos portais de atendimento."
          },
          {
            "id": "prolabore",
            "n": "2.2",
            "t": "Os sócios retiram pró-labore?",
            "e": 1,
            "op": [
              "Não",
              "Sim"
            ],
            "campos": [
              {
                "id": "valor",
                "l": "Valor (R$)"
              }
            ],
            "o": "Explicar que o pró-labore tem INSS e precisa respeitar o salário mínimo vigente (R$ 1.621,00)."
          },
          {
            "id": "admissoes",
            "n": "2.3",
            "t": "Admissões",
            "e": 1,
            "o": "Enviar os documentos do funcionário 2 dias antes do 1º dia de trabalho, para conferência — o eSocial exige o envio antes do início. Antes do 1º registro na empresa, entrar em contato para alinhar os processos e passar as orientações (benefícios e obrigações)."
          },
          {
            "id": "ferias",
            "n": "2.4",
            "t": "Férias e rescisões",
            "e": 1,
            "o": "Férias: avisar 32 ou 35 dias antes, para o envio do aviso. Rescisão: avisar antes do desligamento — 1º informar se o aviso é trabalhado ou indenizado; 2º abrir a solicitação do cálculo."
          },
          {
            "id": "folha",
            "n": "2.5",
            "t": "Fechamento da folha",
            "e": 1,
            "o": "Combinar o dia para envio dos apontamentos (horas extras, faltas, comissões) e dos demais pagamentos ou descontos que tenham que constar no holerite. Quanto antes os apontamentos chegarem, antes a folha é enviada."
          },
          {
            "id": "beneficios",
            "n": "2.6",
            "t": "Benefícios e convenção coletiva",
            "multi": 1,
            "op": [
              "VT",
              "VR / VA",
              "Plano de saúde",
              "Outros"
            ],
            "o": "Confirmar o sindicato da categoria e as regras da convenção. Os benefícios são definidos após o enquadramento sindical."
          }
        ]
      }
    ],
    "prazos": [
      {
        "id": "apontamentos",
        "q": "Cliente → MPC",
        "oq": "Apontamentos da folha (horas extras, faltas, comissões, descontos)",
        "p": "Dia 20, 25 ou 01",
        "obs": "Combinar com o DP"
      },
      {
        "id": "admissao",
        "q": "Cliente → MPC",
        "oq": "Admissão de funcionário (documentos)",
        "p": "2 dias antes do início",
        "obs": "Para conferência; o eSocial exige envio antes do 1º dia de trabalho"
      },
      {
        "id": "ferias",
        "q": "Cliente → MPC",
        "oq": "Férias",
        "p": "32 ou 35 dias antes",
        "obs": "Para o envio do aviso"
      },
      {
        "id": "rescisao",
        "q": "Cliente → MPC",
        "oq": "Rescisão",
        "p": "Antes do desligamento",
        "obs": "Informar se o aviso é trabalhado ou indenizado"
      },
      {
        "id": "folha",
        "q": "MPC → Cliente",
        "oq": "Folha, holerites e pró-labore",
        "p": "Dia 29 ou 04",
        "obs": "Salário pago até o 5º dia útil"
      },
      {
        "id": "guias",
        "q": "MPC → Cliente",
        "oq": "Guias DCTFWeb/INSS e FGTS Digital",
        "p": "Dia 15",
        "obs": "Vencimento no dia 20 (ou 30/31); a guia pode antecipar o vencimento"
      }
    ],
    "checklist": [
      {
        "grupo": "Funcionários",
        "itens": [
          [
            "admissao",
            "Documentos de admissão de cada funcionário",
            ""
          ],
          [
            "fichas",
            "Fichas / contratos de trabalho",
            ""
          ],
          [
            "convencao",
            "Convenção coletiva / sindicato da categoria",
            ""
          ],
          [
            "beneficios",
            "Benefícios (VT, VR, plano de saúde)",
            ""
          ]
        ]
      },
      {
        "grupo": "Sócios",
        "itens": [
          [
            "prolabore",
            "Dados dos sócios para pró-labore (CPF, NIT/PIS)",
            "Se tiver pró-labore"
          ]
        ]
      },
      {
        "grupo": "Transferência — solicitar ao contador anterior",
        "cond": "transferencia",
        "itens": [
          [
            "fichareg",
            "Fichas de registro dos funcionários",
            ""
          ],
          [
            "folhas",
            "Últimas folhas e holerites",
            ""
          ],
          [
            "ferias",
            "Recibos de férias e rescisões",
            ""
          ],
          [
            "fgts",
            "FGTS e eventos do eSocial enviados",
            ""
          ],
          [
            "sefip",
            "Arquivos SEFIP",
            ""
          ],
          [
            "financeiro",
            "Financeiro",
            ""
          ],
          [
            "seguro",
            "Senha do seguro-desemprego",
            ""
          ]
        ]
      }
    ]
  }
};

export function tituloDepartamento(d: string): string {
  return ROTEIROS[d as DepartamentoIntegracao]?.titulo ?? d;
}

export function ehDepartamentoIntegracao(d: string | null | undefined): d is DepartamentoIntegracao {
  return INTEG_DEPTS.includes(d as DepartamentoIntegracao);
}

/** Dados de um roteiro (integracao_departamentos.dados). */
export interface DadosRoteiro {
  itens?: Record<string, { ok?: boolean; r?: string | string[]; c?: Record<string, string>; nota?: string }>;
  ficha?: Record<string, string>;
  prazos?: Record<string, { prazo?: string; obs?: string }>;
  docs?: Record<string, boolean>;
  combinados?: string;
  retorno?: string;
}

/** Grupo do checklist vale para esta empresa? (abertura × transferência) */
export function condicaoAtende(g: { cond?: string }, ficha: Record<string, string>): boolean {
  if (!g.cond || !ficha.inicio) return true;
  return g.cond === "abertura" ? /Abertura/.test(ficha.inicio) : /Transferida/.test(ficha.inicio);
}

/** Obrigatórios (★) tratados / total — o contador do rodapé. */
export function progressoRoteiro(depto: DepartamentoIntegracao, dados: DadosRoteiro): { ok: number; total: number } {
  const obrigatorios = ROTEIROS[depto].secoes.flatMap((s) => s.itens).filter((i) => i.e);
  return { ok: obrigatorios.filter((i) => dados.itens?.[i.id]?.ok).length, total: obrigatorios.length };
}

/** Departamentos do roteiro que cada pessoa vê (Departamento do portal → roteiro). */
export function deptosDaPessoa(meuDepartamento: Departamento | null, todos: boolean): DepartamentoIntegracao[] {
  if (todos) return INTEG_DEPTS;
  return INTEG_DEPTS.filter((d) => d === meuDepartamento);
}
