# PortalMPC

Sistema interno de gestão da **Meta Plano Contábil**. Esta primeira etapa entrega o
**módulo de Legalização** completo — autenticação, controle de acesso modular por
permissão, base de dados no Supabase, importação real das planilhas de trabalho e uma
tela de edição no estilo planilha.

O administrador cria os usuários pela própria interface, define o time de cada um, marca
em checkbox quais telas ele abre e o que pode alterar, e distribui responsabilidades
recorrentes com prazo e aviso ("fulano atualiza a coluna Alvará todo mês").

A arquitetura já está preparada para os módulos Fiscal, Contábil e Departamento Pessoal.

---

## Sumário

- [Como executar](#como-executar)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Banco de dados](#banco-de-dados)
- [Segurança e permissões](#segurança-e-permissões)
- [Atribuições](#atribuições-quem-faz-o-quê-e-até-quando)
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

> A `service_role` é usada pelos scripts de linha de comando (`scripts/`) e pela rota
> `POST /api/admin/usuarios`, que roda **no servidor** — criar conta no Supabase Auth
> exige essa chave. Ela nunca é importada por nenhum componente de cliente e não aparece
> no bundle do navegador.

### 4. Aplicar as migrations

As migrations `0001` a `0009` já estão aplicadas no projeto. As três seguintes —
permissões modulares, atribuições e restrição de coluna — precisam ser executadas:

```bash
npm run migrations:juntar     # gera supabase/APLICAR_NO_SQL_EDITOR.sql (0010 em diante)
```

Abra **Supabase → SQL Editor**, cole o arquivo inteiro e execute. O script é idempotente
(`create or replace`, `if not exists`, `drop policy if exists`), então rodar duas vezes não
quebra nada. Ao final, os usuários existentes recebem automaticamente as permissões
equivalentes ao que já podiam fazer — ninguém ganha nem perde acesso na virada.

Para regerar desde o começo (banco novo): `npm run migrations:juntar -- 0001`.

### 5. Rodar

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
| Marca | SVG em `public/` | Trocar a logo não exige mexer em código |

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
│   │   ├── usuarios/             # criação de usuários, times e checkboxes de permissão
│   │   ├── atribuicoes/          # quem cuida do quê, com que frequência e até quando
│   │   ├── auditoria/            # trilha de alterações
│   │   ├── importacoes/          # relatório da consolidação
│   │   ├── referencias/          # portais das prefeituras e checklists
│   │   ├── perfil/
│   │   ├── configuracoes/
│   │   └── fiscal|contabil|departamento-pessoal/   # módulos futuros
│   ├── api/admin/usuarios/       # criação de conta e reset de senha (service_role)
│   ├── api/exportar/             # exportação Excel com permissão no servidor
│   ├── login/ recuperar-senha/ redefinir-senha/ auth/callback/
│   └── sem-acesso/
├── components/
│   ├── ui/                       # design system (botão, campo, selo, modal, avisos)
│   ├── layout/                   # menu lateral, cabeçalho, área em construção
│   ├── atribuicoes/              # bloco "minhas responsabilidades" da tela de início
│   └── planilha/                 # tabela, célula editável, filtros, painel lateral
├── lib/
│   ├── supabase/                 # clientes de navegador e servidor
│   ├── permissoes.ts             # ponto único de decisão de permissão no frontend
│   ├── atribuicoes.ts            # cálculo de prazo e mapa coluna → responsável
│   ├── colunas.ts                # catálogo de colunas (dirige tabela, form e export)
│   ├── empresas.ts               # acesso a dados da base de Legalização
│   ├── normalizacao.ts           # normalizadores compartilhados com o ETL
│   └── mascaras.ts               # máscaras de CNPJ, telefone e data
├── types/banco.ts                # tipos espelhando o schema
└── middleware.ts                 # renova sessão e barra rotas sem autenticação

scripts/
├── import-planilhas.ts           # ETL de mesclagem (reproduzível)
├── import-referencias.ts         # abas auxiliares → tabelas de referência
├── juntar-migrations.ts          # junta migrations para colar no SQL Editor
└── seed-usuarios.ts              # criação de usuários

supabase/
├── migrations/                   # 0001 … 0012
├── APLICAR_NO_SQL_EDITOR.sql     # gerado por `npm run migrations:juntar`
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
| `profiles` | Perfil de aplicação ligado ao Supabase Auth (nome, e-mail, time, função, ativo) |
| `permissoes_catalogo` | Catálogo do que pode ser concedido — alimenta os checkboxes |
| `usuario_permissoes` | O que cada usuário recebeu |
| `usuario_colunas` | Quais colunas cada usuário pode editar (vazio = todas) |
| `atribuicoes` | Responsabilidades recorrentes: quem cuida do quê, com que frequência |
| `atribuicao_execucoes` | Histórico de ciclos concluídos |
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

O acesso **não** vem mais da função (`role`): vem das permissões que o administrador
marca por usuário. `admin` continua tendo tudo, sempre.

| Grupo | Chaves |
| --- | --- |
| Telas | `tela.inicio`, `tela.legalizacao`, `tela.referencias`, `tela.importacoes`, `tela.atribuicoes`, `tela.fiscal`, `tela.contabil`, `tela.dp`, `tela.dashboard` |
| Telas **exclusivas de admin** | `tela.administrativo`, `tela.auditoria`, `tela.configuracoes` |
| Dados | `dados.legalizacao.criar`, `.editar`, `.excluir`, `.exportar` |
| Dados **exclusivos de admin** | `dados.administrativo.editar`, `dados.administrativo.exportar` |
| Administração | `admin.usuarios.gerenciar`, `admin.usuarios.permissoes`, `admin.atribuicoes.gerenciar` |

As chaves marcadas como **exclusivas de admin** não podem ser concedidas a mais ninguém
— e isso é garantido em quatro lugares independentes:

1. O checkbox nem aparece na tela de criação para quem não é admin.
2. `pode()` (`src/lib/permissoes.ts`) recusa a chave mesmo que ela apareça na lista do
   usuário, então um dado corrompido não libera a tela.
3. A rota `POST /api/admin/usuarios` filtra as chaves antes de gravar.
4. O gatilho `proteger_permissoes_de_admin` no PostgreSQL levanta `42501` no `INSERT`.
   Rebaixar alguém de admin apaga automaticamente essas permissões
   (`limpar_permissoes_ao_rebaixar`).

Camadas de proteção, da mais externa para a mais interna:

1. **`middleware.ts`** — sem sessão, nenhuma rota do portal abre.
2. **Layout e páginas** — cada página confere a permissão exigida antes de renderizar
   (`ROTAS_PROTEGIDAS` em `src/lib/permissoes.ts` é a fonte única, compartilhada com o menu).
3. **Rota de exportação** — decide as colunas permitidas no servidor, ignorando o pedido do cliente.
4. **RLS no PostgreSQL** — a barreira que vale. Acesso direto pela URL, pelo PostgREST
   ou por SQL devolve zero linhas confidenciais para quem não é admin.
5. **Gatilho de coluna** — `aplicar_colunas_permitidas` recusa alterações fora das colunas
   atribuídas ao usuário, já que RLS não distingue coluna.

Ver [`docs/SEGURANCA.md`](docs/SEGURANCA.md) para as evidências dos testes executados.

### Atribuições (quem faz o quê, e até quando)

Uma atribuição diz: *"fulano@metaplano.com, do time de Legalização, mantém a coluna
Alvará de todos os clientes atualizada todo mês"*. Ela guarda responsável, colunas,
periodicidade (semanal a anual, ou avulsa), próximo prazo e com quantos dias de
antecedência avisar.

- O responsável vê tudo em **Início**, com selo verde/âmbar/vermelho conforme o prazo.
- Ao concluir um ciclo, `concluir_atribuicao()` registra a competência e **adianta o prazo
  sozinho** conforme a periodicidade. Atribuição avulsa se encerra ao ser concluída.
- Quem cuida de cada coluna aparece no cabeçalho da planilha (ícone de pessoa) para
  **qualquer** usuário — saber a quem recorrer não depende de permissão.
- Criar, editar e apagar atribuições exige `admin.atribuicoes.gerenciar`.

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

### Criar um usuário (pela tela)

**Usuários → Novo usuário.** Preencha nome, e-mail, senha inicial, time e função; os
checkboxes já vêm sugeridos conforme o time escolhido e podem ser ajustados antes de
salvar. A conta nasce confirmada e o usuário já entra.

A criação passa por `POST /api/admin/usuarios`, que roda **no servidor** porque exige a
`service_role` — chave que nunca é enviada ao navegador. Configure
`SUPABASE_SERVICE_ROLE_KEY` no `.env.local`; sem ela a tela responde com uma mensagem
clara em vez de falhar em silêncio.

Quem pode criar: qualquer usuário com `admin.usuarios.gerenciar`. Só um **admin** cria
outro admin.

### Ajustar permissões

Na mesma tela, selecione a pessoa na lista. O painel da direita traz:

- **Time e função** — o time é o que agrupa a pessoa na operação;
- **Permissões** — checkboxes por grupo (telas / dados / administração), salvos na hora;
- **Colunas que pode editar** — deixe tudo desmarcado para liberar todas as colunas;
  marcando alguma, o usuário passa a editar somente aquelas, e as demais ficam em
  modo leitura na planilha (com cadeado no cabeçalho e explicação no tooltip).

Delegação funciona: dê `admin.usuarios.gerenciar` + `admin.usuarios.permissoes` a um
gestor e ele passa a configurar o próprio time — sem nunca alcançar as telas de admin.

### Criar usuários por script

```bash
npm run seed:usuarios
```

Ou pelo painel: **Supabase → Authentication → Users → Add user**, preenchendo
*User Metadata* com:

```json
{ "nome": "Maria Silva", "area": "legalizacao", "role": "colaborador" }
```

O gatilho `handle_new_user` cria o registro em `profiles` automaticamente. Contas criadas
assim nascem **sem permissão nenhuma** — conceda pela tela de Usuários.

**Times:** `legalizacao`, `fiscal`, `contabil`, `departamento_pessoal`, `administracao`
**Funções:** `admin`, `gestor`, `colaborador`

Um usuário não consegue alterar a própria função, área ou situação — o gatilho
`protect_profile_privileges` bloqueia, mesmo por chamada direta à API.

### Contas de teste

| E-mail | Senha | Função / área | Cai em |
| --- | --- | --- | --- |
| `admin@portalmpc.local` | `PortalMPC@2026` | admin / administração | `/dashboard` |
| `gestor.legalizacao@portalmpc.local` | `Gestor@2026` | gestor / legalização | `/legalizacao` |
| `legalizacao@portalmpc.local` | `Legalizacao@2026` | colaborador / legalização | `/legalizacao` |
| `fiscal@portalmpc.local` | `Fiscal@2026` | colaborador / fiscal | `/fiscal` |

> Troque essas senhas antes de colocar o portal em uso real.

### Se o login não passar

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| Clica em Entrar e nada acontece | Versão anterior usava `router.replace` + `router.refresh`, que competiam entre si | Já corrigido: a navegação agora é um load completo |
| "O servidor de autenticação recusou a consulta" | Conta criada por SQL com colunas de token em NULL | Rode a migration `0009` ou recrie com `npm run seed:usuarios` |
| "Chave do Supabase inválida" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` errada ou ausente | Confira o `.env.local` |
| "A sessão não pôde ser salva" | Navegador bloqueando cookies de `localhost` | Libere cookies para o site |
| Entra e volta para o login, com `AuthRetryableFetchError: fetch failed` no terminal | Rede corporativa com inspeção de TLS: o Node não confia no certificado da empresa | Suba com `$env:NODE_OPTIONS="--use-system-ca"` (veja abaixo) |

#### Rede corporativa (proxy com inspeção de TLS)

O navegador confia no certificado da empresa porque ele está no Windows; o
Node.js usa a própria lista de autoridades e recusa a conexão. O portal abre,
o login autentica, mas o servidor não consegue validar a sessão — e o usuário
volta para a tela de login.

```powershell
# PowerShell — Node 22 ou superior
$env:NODE_OPTIONS="--use-system-ca"
npm run start
```

```powershell
# Alternativa: apontar o certificado raiz exportado da empresa
$env:NODE_EXTRA_CA_CERTS="C:\caminho\ca-empresa.cer"
npm run start
```

Quando isso acontece, o portal agora mostra uma tela explicando a causa e o
comando, em vez de ficar repetindo a tela de login.

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
