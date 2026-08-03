# Relatório de importação — Módulo de Legalização

Consolidação de `Planilha_Saude.xlsx` e `Adm.xlsx` numa única base.
Execução registrada em `import_logs` (`import_log_id = a8d3f724-2d78-4074-bcaa-272dbc08d6a9`).

---

## 1. Análise das planilhas

### 1.1 `Planilha_Saude.xlsx`

Seis abas. A base de trabalho é a aba **`Bese`** (o nome tem um erro de digitação no
arquivo original — mantido como está para não quebrar a rastreabilidade).

| Aba | Conteúdo | Destino no portal |
| --- | --- | --- |
| **`Bese`** | Base de trabalho — 331 empresas | `legalizacao_empresas` |
| `Caminhos` | 42 linhas: links de prefeitura por cidade | `legalizacao_cidades_links` (40 após deduplicar) |
| `Docs Necessários ` | Checklist de documentos | `legalizacao_documentos_necessarios` (17) |
| `Base` | Listas de valores dos selects | `legalizacao_opcoes` (25) |
| `Status` | 3 modelos de parecer por órgão | `legalizacao_checklist_referencia` |
| `Conferência` | 1 modelo de conferência | `legalizacao_checklist_referencia` |

> O nome da aba `Docs Necessários ` termina com espaço; o nome da aba `Caminhos` está correto.

**Estrutura da aba `Bese`** — cabeçalho na **linha 3**, dados a partir da **linha 5**
(a linha 4 traz a legenda `MPC` / `TERCEIROS`, indicando quem executa cada etapa).

| Col | Cabeçalho | Tipo | Preenchimento | Observação |
| --- | --- | --- | --- | --- |
| A | `N` | inteiro | 331/331 | numeração da planilha, **com repetições** (249 valores distintos) |
| B | `CNPJ` | texto | 331/331 | todos distintos |
| C | `RAZÃO SOCIAL` | texto | 331/331 | 328 distintos — 3 nomes repetidos, filiais com CNPJ diferente |
| D | `COD` | inteiro | 331/331 | código interno |
| E | `CIDADE` | texto | 331/331 | 40 variações para ~38 cidades reais |
| F | `INICIO` | data | 331/331 | — |
| G | `SOCIO` | texto | 82/331 | |
| H | `ESTABELICIDO` | SIM/NÃO | 77/331 | erro de digitação no original |
| I | `SEGUIMENTO` | texto | 75/331 | 25 valores distintos |
| J | `INS. MUNICIPAL` | misto | 305/331 | contém 19 `#N/A`, 9 `N/P`, 3 `N/L` |
| K | `ALVARÁ` | SIM/NÃO | 197/331 | grafias `NÃO` e `NAO` |
| L | `AVCB / CLCB` | **texto ou data** | 69/331 | 59 textos + 10 datas de validade |
| M | `LTA` | texto | 72/331 | |
| N | `CNES` | texto | 73/331 | |
| O | `CETESB` | texto | 73/331 | |
| P | `AMLURB (TX LIXO)` | texto | 74/331 | |
| Q | `VIGILÂNCIA SANITÁRIA` | **texto ou data** | 134/331 | 129 textos + 5 datas |
| R | `EXTRAMUROS` | texto | 73/331 | |
| S | `RESPONSÁVEL TÉCNICO` | texto | 70/331 | |
| T | `PROFISSIONAL` | texto | 68/331 | |
| U | `ÓRGÃO` | texto | 70/331 | CRM, CREA-SP, CREF, COREN… |
| V | `VALIDADE` | **texto ou data** | 68/331 | 66 textos + 2 datas |

### 1.2 `Adm.xlsx`

Uma aba: **`Pagadores (4)`**. Cabeçalho na linha 1, dados a partir da linha 2.

> A planilha declara 16.305 colunas por resíduo de formatação; apenas **A–M** contêm dados.

| Col | Cabeçalho | Tipo | Preenchimento | Observação |
| --- | --- | --- | --- | --- |
| A | `N` | inteiro | 358/358 | numeração sequencial |
| B | `CNPJ` | texto/número | 358/358 | 3 gravados como número → normalizados com zeros à esquerda |
| C | `EMPRESAS` | texto | 358/358 | razão social |
| D | `COD` | misto | 355/358 | 331 numéricos + 19 `MEI` + 5 `D` |
| E | `CIDADE` | texto | 358/358 | 38 variações |
| F | `INÍCIO` | data | 358/358 | |
| G | `SAÍDA` | texto | 358/358 | 357 são `-`; 1 valor de hora inválido |
| H | `TRIBUTAÇÃO` | texto | 358/358 | SIMPLES (274), Não OPTANTE (58), MEI (20), DOMESTICA (5), LUCRO REAL (1) |
| I | `TIPO` | texto | 358/358 | 25 valores distintos |
| J | `STATUS` | texto | 358/358 | ATIVO (357), SUSPENSO (1) |
| K | `DATA DE\nVENCIM.` | inteiro | 358/358 | dias 5, 10, 15, 20, 25, 30 e 4 registros com `-` |
| L | `OBS.` | texto | 358/358 | **regras de honorários** ("Até 3 func. Após R$ 35,00") |
| M | `jul/26` | número | 345/358 | **valor do honorário mensal** |

### 1.3 Cabeçalhos equivalentes com nomes diferentes

| Planilha Saúde | Adm.xlsx | Campo no banco |
| --- | --- | --- |
| `RAZÃO SOCIAL` | `EMPRESAS` | `razao_social` |
| `INICIO` | `INÍCIO` | `data_inicio` |
| `CNPJ`, `COD`, `CIDADE` | idem | `cnpj`, `codigo`, `cidade` |

### 1.4 Campos exclusivos de cada fonte

- **Só na Planilha Saúde** (o trabalho de legalização): `SOCIO`, `ESTABELICIDO`,
  `SEGUIMENTO`, `INS. MUNICIPAL`, `ALVARÁ`, `AVCB / CLCB`, `LTA`, `CNES`, `CETESB`,
  `AMLURB`, `VIGILÂNCIA SANITÁRIA`, `EXTRAMUROS`, `RESPONSÁVEL TÉCNICO`,
  `PROFISSIONAL`, `ÓRGÃO`, `VALIDADE`.
- **Só no Adm.xlsx**: `TRIBUTAÇÃO`, `TIPO`, `STATUS` (gerais) e `SAÍDA`,
  `DATA DE VENCIM.`, `OBS.`, `jul/26` (confidenciais).

### 1.5 Problemas encontrados nos dados

| Problema | Quantidade | Tratamento |
| --- | --- | --- |
| Linha de **TOTAL** no Adm.xlsx (linha 360, soma 159.135,98) | 1 | descartada — não é empresa |
| CNPJ com dígito verificador inválido | 7 | importados e marcados `necessita_revisao` |
| CNPJ gravado como número | 3 | zeros à esquerda restaurados |
| `Jundiaí` vs `JundiaÍ` | 62 linhas | canonicalizadas para a grafia mais frequente |
| `#N/A` do Excel em `INS. MUNICIPAL` | 19 | convertidos para nulo |
| `NÃO` vs `NAO` em `ALVARÁ` | 1 | preservado (valor de negócio, não ruído) |
| Colunas de tipo misto (texto **e** data) | 3 | texto preservado + data extraída em coluna própria |
| `N` repetido na Planilha Saúde | 82 linhas | não usado como chave; guardado em `numero_origem_saude` |

> `N/P` (não possui), `N/L` (não localizado) e `NA` (não aplicável) foram **preservados**:
> carregam significado. Só `-`, `#N/A` e afins viraram nulo.

---

## 2. Regras da mesclagem

1. Chave principal: **CNPJ normalizado** (só dígitos, 14 posições).
2. Sem CNPJ: chave composta `razão social + nome fantasia + município` (não foi necessária —
   as duas planilhas têm CNPJ em 100% das linhas).
3. Empresa presente nas duas fontes entra **uma única vez**.
4. Empresa presente em uma só fonte também entra.
5. Campo vazio numa fonte e preenchido na outra → usa o preenchido.
6. Valores diferentes → **Adm.xlsx prevalece** e a divergência é gravada em
   `import_divergencias`. Nada é descartado em silêncio.
7. Datas, CNPJ, telefone, e-mail, texto, números e status normalizados
   (`src/lib/normalizacao.ts`, compartilhado entre ETL e aplicação).
8. Linhas totalmente vazias e a linha de total foram removidas.
9. Nenhuma soma de registros — "unir" significa consolidar.
10. Origem preservada em `origem`, com as linhas de cada arquivo em
    `linha_origem_saude` / `linha_origem_adm`.

---

## 3. Resultado

| Métrica | Valor |
| --- | --- |
| Linhas na Planilha Saúde (aba `Bese`) | 331 |
| Linhas no Adm.xlsx (aba `Pagadores (4)`) | 359 (1 descartada = **358** válidas) |
| **Empresas únicas consolidadas** | **373** |
| Duplicadas dentro da Planilha Saúde | 0 |
| Duplicadas dentro do Adm.xlsx | 0 |
| Presentes nas duas planilhas (deduplicadas) | 316 |
| Somente na Planilha Saúde | 15 |
| Somente no Adm.xlsx | 42 |
| Divergências entre as fontes | **0** |
| Registros importados | **373** |
| Blocos administrativos criados | **358** |
| Precisam de revisão manual | **7** |

Conferência aritmética: `331 + 358 − 316 = 373` ✓

### 3.1 Por que zero divergências

Os quatro campos comuns (`razao_social`, `codigo`, `cidade`, `data_inicio`) foram
comparados nas 316 empresas presentes nas duas fontes — **byte a byte**, sem
normalização — e são idênticos. As planilhas estavam sincronizadas nesses campos.

A máquina de divergências está implementada e ativa: se numa próxima importação as
fontes discordarem, o valor do Adm.xlsx é aplicado e a diferença aparece na tela
**Importações**.

### 3.2 Registros para revisão manual

Sete empresas com CNPJ cujo dígito verificador não fecha. Foram **importadas normalmente**
(nenhum dado foi perdido) e marcadas com `necessita_revisao = true`. Ficam filtráveis na
Planilha Legalização pela coluna *Revisão*.

| Linha no Adm.xlsx | CNPJ normalizado |
| --- | --- |
| 107 | 53086339000165 |
| 115 | 00022238696881 |
| 170 | 03026289000170 |
| 179 | 00030130674893 |
| 264 | 00042223900895 |
| 288 | 00006783811867 |
| 304 | 00015698675856 |

Cinco deles parecem ser **CPF** gravado no campo CNPJ (padrão `000` + 11 dígitos),
o que é coerente com os 5 registros de tributação `DOMESTICA`.

### 3.3 Validação independente

A soma dos honorários importados bate **exatamente** com a linha de TOTAL da planilha
original, que foi descartada da importação:

```
Linha 360 do Adm.xlsx (TOTAL)               159.135,98
SUM(valor_honorario) em 358 registros       159.135,98   ✓
```

Nenhum valor foi perdido, duplicado ou somado indevidamente.

---

## 4. Conferência no banco

```sql
select
  (select count(*) from legalizacao_empresas)                          as empresas,          -- 373
  (select count(*) from legalizacao_empresas where origem='ambas')     as ambas,             -- 316
  (select count(*) from legalizacao_empresas where origem='planilha_saude') as so_saude,     -- 15
  (select count(*) from legalizacao_empresas where origem='planilha_adm')   as so_adm,       -- 42
  (select count(distinct cnpj) from legalizacao_empresas)              as cnpjs_distintos,   -- 373
  (select count(*) from legalizacao_empresas where necessita_revisao)  as revisao,           -- 7
  (select count(*) from legalizacao_dados_administrativos)             as dados_adm,         -- 358
  (select sum(valor_honorario) from legalizacao_dados_administrativos) as honorarios;        -- 159135.98
```

---

## 5. Divisão entre geral e confidencial

A especificação menciona "as colunas da coluna N em diante do `adm.xlsx`". **O arquivo
entregue tem dados apenas até a coluna M** (13 colunas), então não existe coluna N.

Adotamos o critério que preserva a intenção: o **bloco financeiro e contratual** do
Adm.xlsx — exatamente o conteúdo que não pode chegar a um usuário de Legalização — foi
movido para a tabela protegida.

| Coluna no Adm.xlsx | Campo | Tabela |
| --- | --- | --- |
| G `SAÍDA` | `data_saida`, `saida_raw` | `legalizacao_dados_administrativos` 🔒 |
| K `DATA DE VENCIM.` | `dia_vencimento` | `legalizacao_dados_administrativos` 🔒 |
| L `OBS.` (regras de cobrança) | `observacoes_honorarios` | `legalizacao_dados_administrativos` 🔒 |
| M `jul/26` | `valor_honorario` + `honorarios_historico` | `legalizacao_dados_administrativos` 🔒 |
| H `TRIBUTAÇÃO` | `tributacao` | `legalizacao_empresas` |
| I `TIPO` | `tipo` | `legalizacao_empresas` |
| J `STATUS` | `status` | `legalizacao_empresas` |

`TRIBUTAÇÃO`, `TIPO` e `STATUS` ficaram na base geral porque a área de Legalização
precisa deles para filtrar, e a especificação pede `Status` na tabela de dados gerais.

**Para mover um campo entre os dois grupos** basta editar `COLUNAS_GERAIS` /
`COLUNAS_ADMINISTRATIVAS` em `src/lib/colunas.ts` e ajustar a montagem em
`scripts/import-planilhas.ts`. Confirme conosco se o corte deve ser outro.

Cada coluna mensal nova (`ago/26`, `set/26`…) é reconhecida automaticamente pelo ETL e
acumulada em `honorarios_historico` — não é preciso alterar o schema.

---

## 6. Abas auxiliares importadas

Conteúdo que antes era consultado abrindo a planilha, agora disponível na tela
**Consultas por cidade**:

| Origem | Registros | Tabela |
| --- | --- | --- |
| Aba `Caminhos` | 40 cidades | `legalizacao_cidades_links` |
| Aba `Docs Necessários ` | 17 documentos | `legalizacao_documentos_necessarios` |
| Aba `Base` | 25 opções em 5 grupos | `legalizacao_opcoes` |
| Abas `Status` + `Conferência` | 49 itens em 4 blocos | `legalizacao_checklist_referencia` |
