# PortalMPC

Sistema interno de gestão do escritório contábil MPC. Esta primeira etapa entrega o
**módulo de Legalização** completo — autenticação, controle de acesso por área e função,
base de dados no Supabase, importação real das planilhas de trabalho e uma tela de
edição no estilo planilha.

A arquitetura já está preparada para os módulos Fiscal, Contábil e Departamento Pessoal.

---

## Sumário

- [Como executar](#como-executar)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Banco de dados](#banco-de-dados)
- [Segurança e permissões](#segurança-e-permissões)
- [Importação das planilhas](#importação-das-planilhas)
- [Usuários e acessos](#usuários-e-acessos)
- [Documentação complementar](#documentação-complementar)

---

## Como executar

### 1. Pré-requisitos

- Node.js 20 ou superior
- Um projeto Supabase (este repositório está apontado para o projeto `PortalMPC`)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha `.env.local`:

| Variável | Onde encontrar | Vai para o navegador? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (`anon` / publishable) | sim |
| `NEXT_PUBLIC_SITE_URL` | URL do portal (ex.: `http://localhost:3000`) | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (`service_role`) | **nunca** |

> A `service_role` é usada apenas pelos scripts de linha de comando (`scripts/`).
> Ela nunca é importada em nenhum componente da aplicação.

### 4. Rodar

```bash
npm run dev      # desenvolvimento em http://localhost:3000
npm run build    # build de produção
npm run start    # servir o build
npm run typecheck
```

---

## Stack

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Framework | **Next.js 15** (App Router) | Server Components leem o Supabase já sob a sessão do usuário |
| Linguagem | **TypeScript** estrito | Contratos claros entre ETL, banco e interface |
| Estilo | **Tailwind CSS 4** | Tokens de design em `globals.css`, sem CSS espalhado |
| Banco / Auth | **Supabase** (PostgreSQL + Auth + RLS) | Permissão aplicada no banco, não só na tela |
| Excel | **ExcelJS** | Leitura no ETL e geração da exportação no servidor |
| Ícones | **lucide-react** | Conjunto consistente |

---

## Estrutura do projeto

```
src/
├── app/
│   ├── (portal)/                 # área autenticada (menu lateral + guarda de rota)
│   │   ├── layout.tsx            # exige sessão + perfil ativo
│   │   ├── dashboard/            # painel do administrador
│   │   ├── inicio/               # painel dos demais perfis
│   │   ├── legalizacao/          # Planilha Legalização (campos gerais)
│   │   ├── administrativo/       # Planilha ADM (inclui bloco confidencial)
│   │   ├── usuarios/             # gestão de área e função
│   │   ├── auditoria/            # trilha de alterações
│   │   ├── importacoes/          # relatório da consolidação
│   │   ├── referencias/          # portais das prefeituras e checklists
│   │   ├── perfil/
│   │   ├── configuracoes/
│   │   └── fiscal|contabil|departamento-pessoal/   # módulos futuros
│   ├── api/exportar/             # exportação Excel com permissão no servidor
│   ├── login/ recuperar-senha/ redefinir-senha/ auth/callback/
│   └── sem-acesso/
├── components/
│   ├── ui/                       # design system (botão, campo, selo, modal, avisos)
│   ├── layout/                   # menu lateral, cabeçalho, área em construção
│   └── planilha/                 # tabela, célula editável, filtros, painel lateral
├── lib/
│   ├── supabase/                 # clientes de navegador e servidor
│   ├── permissoes.ts             # ponto único de decisão de permissão no frontend
│   ├── colunas.ts                # catálogo de colunas (dirige tabela, form e export)
│   ├── empresas.ts               # acesso a dados da base de Legalização
│   ├── normalizacao.ts           # normalizadores compartilhados com o ETL
│   └── mascaras.ts               # máscaras de CNPJ, telefone e data
├── types/banco.ts                # tipos espelhando o schema
└── middleware.ts                 # renova sessão e barra rotas sem autenticação

scripts/
├── import-planilhas.ts           # ETL de mesclagem (reproduzível)
├── import-referencias.ts         # abas auxiliares → tabelas de referência
└── seed-usuarios.ts              # criação de usuários

supabase/
├── migrations/                   # 0001 … 0008
└── functions/importar-legalizacao/   # Edge Function usada na carga inicial
```

**Princípios adotados**

- Nenhum componente concentra a aplicação: interface, dados e permissão são camadas distintas.
- Toda decisão de permissão no frontend passa por `lib/permissoes.ts`.
- O catálogo `lib/colunas.ts` é a fonte única: acrescentar uma coluna ali a faz aparecer
  na tabela, no formulário, nos filtros e na exportação de uma vez.
- Chaves administrativas não existem no bundle do navegador.

---

## Banco de dados

| Tabela | Papel |
| --- | --- |
| `profiles` | Perfil de aplicação ligado ao Supabase Auth (nome, e-mail, área, função, ativo) |
| `legalizacao_empresas` | Base geral consolidada — 373 empresas |
| `legalizacao_dados_administrativos` | **Confidencial**: honorários, vencimento, condições contratuais |
| `audit_logs` | Trilha de criação, edição, exclusão, importação e exportação |
| `import_logs` | Uma linha por execução do ETL, com o relatório completo |
| `import_divergencias` | Conflitos entre as duas planilhas, para conferência |
| `legalizacao_cidades_links` | Portais das prefeituras por cidade (aba "Caminhos") |
| `legalizacao_documentos_necessarios` | Checklist de documentos (aba "Docs Necessários") |
| `legalizacao_opcoes` | Listas de valores dos selects (aba "Base") |
| `legalizacao_checklist_referencia` | Modelos de parecer (abas "Status" e "Conferência") |

### Relacionamentos

```
auth.users 1─1 profiles
profiles   1─N legalizacao_empresas          (created_by, updated_by, responsavel_id)
legalizacao_empresas 1─1 legalizacao_dados_administrativos   (ON DELETE CASCADE)
legalizacao_empresas 1─N import_divergencias
import_logs          1─N import_divergencias
```

A separação em duas tabelas é o coração da proteção: os campos confidenciais **não estão**
na mesma tabela dos campos gerais, então nenhuma consulta de um usuário comum consegue
alcançá-los — nem por engano, nem de propósito.

---

## Segurança e permissões

RLS habilitada em **todas** as tabelas sensíveis; `legalizacao_dados_administrativos` usa
`FORCE ROW LEVEL SECURITY`.

| Recurso | Admin | Gestor Legalização | Colaborador Legalização | Outras áreas |
| --- | :-: | :-: | :-: | :-: |
| Ler base geral | ✅ | ✅ | ✅ | ❌ |
| Criar / editar empresas | ✅ | ✅ | ✅ | ❌ |
| Excluir empresas | ✅ | ✅ | ❌ | ❌ |
| Ler dados administrativos | ✅ | ❌ | ❌ | ❌ |
| Editar dados administrativos | ✅ | ❌ | ❌ | ❌ |
| Exportar colunas ADM | ✅ | ❌ | ❌ | ❌ |
| Gerenciar usuários | ✅ | ❌ | ❌ | ❌ |
| Consultar auditoria | ✅ | ❌ | ❌ | ❌ |

Camadas de proteção, da mais externa para a mais interna:

1. **`middleware.ts`** — sem sessão, nenhuma rota do portal abre.
2. **Layout e páginas** — cada página confere área e função antes de renderizar.
3. **Rota de exportação** — decide as colunas permitidas no servidor, ignorando o pedido do cliente.
4. **RLS no PostgreSQL** — a barreira que vale. Acesso direto pela URL, pelo PostgREST
   ou por SQL devolve zero linhas confidenciais para quem não é admin.

Ver [`docs/SEGURANCA.md`](docs/SEGURANCA.md) para as evidências dos testes executados.

---

## Importação das planilhas

```bash
# Coloque os arquivos em data/planilhas/ (fora do controle de versão):
#   data/planilhas/Planilha_Saude.xlsx
#   data/planilhas/Adm.xlsx

npm run import:planilhas          # grava direto no Supabase (usa a service_role)
npm run import:planilhas:sql      # gera supabase/seed/legalizacao_import.sql
npx tsx scripts/import-referencias.ts --sql   # abas auxiliares
```

O ETL é **idempotente**: o conflito é resolvido por `chave_identificacao`
(CNPJ normalizado), então reexecutar atualiza em vez de duplicar.

Resultado da carga já executada:

| Métrica | Valor |
| --- | --- |
| Empresas consolidadas | **373** |
| Presentes nas duas planilhas | 316 |
| Só na Planilha Saúde | 15 |
| Só no Adm.xlsx | 42 |
| Registros administrativos | 358 |
| Divergências entre fontes | 0 |
| Precisam de revisão manual | 7 |

Relatório completo em [`docs/RELATORIO-IMPORTACAO.md`](docs/RELATORIO-IMPORTACAO.md).

---

## Usuários e acessos

### Criar um usuário

```bash
npm run seed:usuarios
```

Ou pelo painel: **Supabase → Authentication → Users → Add user**, preenchendo
*User Metadata* com:

```json
{ "nome": "Maria Silva", "area": "legalizacao", "role": "colaborador" }
```

O gatilho `handle_new_user` cria o registro em `profiles` automaticamente.

### Definir área e função

Pela tela **Usuários** (somente admin) ou por SQL:

```sql
update public.profiles
set area = 'legalizacao', role = 'gestor'
where email = 'maria@escritoriompc.com.br';
```

**Áreas:** `legalizacao`, `fiscal`, `contabil`, `departamento_pessoal`, `administracao`
**Funções:** `admin`, `gestor`, `colaborador`

Um usuário não consegue alterar a própria função, área ou situação — o gatilho
`protect_profile_privileges` bloqueia, mesmo por chamada direta à API.

### Redirecionamento após o login

| Perfil | Destino |
| --- | --- |
| `admin` | `/dashboard` |
| área `legalizacao` | `/legalizacao` |
| área `fiscal` | `/fiscal` |
| área `contabil` | `/contabil` |
| área `departamento_pessoal` | `/departamento-pessoal` |
| inativo ou sem área válida | `/sem-acesso` |

---

## Documentação complementar

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — decisões técnicas e como acrescentar um módulo
- [`docs/RELATORIO-IMPORTACAO.md`](docs/RELATORIO-IMPORTACAO.md) — análise das planilhas e resultado da mesclagem
- [`docs/SEGURANCA.md`](docs/SEGURANCA.md) — políticas de RLS e evidências dos testes
