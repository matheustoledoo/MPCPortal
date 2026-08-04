# Arquitetura

## Visão geral

```
Navegador
   │  cookie de sessão (Supabase Auth)
   ▼
Next.js 15 — App Router
   ├── middleware.ts .................. renova sessão, barra rota sem login
   ├── Server Components .............. leem o Supabase já sob a sessão do usuário
   ├── Client Components .............. tabela editável, filtros, formulários
   └── /api/exportar .................. gera o Excel com permissão do servidor
   │
   ▼  PostgREST (chave pública) + RLS
Supabase / PostgreSQL
   ├── auth.users ..................... autenticação
   ├── profiles ....................... área + função + situação
   ├── legalizacao_empresas ........... base geral
   ├── legalizacao_dados_administrativos  🔒 confidencial
   ├── audit_logs ..................... trilha imutável
   └── tabelas de referência
```

O navegador nunca fala com o banco sem passar pela RLS. Não existe uma "API de confiança"
com chave privilegiada respondendo ao cliente.

---

## Decisões e o porquê

### Duas tabelas em vez de colunas escondidas

A alternativa seria manter honorários em `legalizacao_empresas` e filtrar no `select`.
Isso é frágil: qualquer `select=*` esquecido, qualquer rota nova, qualquer consulta
direta ao PostgREST vazaria o dado.

Com a tabela separada e RLS de admin, um usuário de Legalização **não tem como** alcançar
os valores. A prova está em `docs/SEGURANCA.md` §3.3.

### Catálogo de colunas como fonte única

`src/lib/colunas.ts` descreve cada campo: rótulo, tipo, largura, se é editável, se é
confidencial, opções de select e de onde veio na planilha. A tabela, o formulário lateral,
os filtros e a exportação leem daí.

Acrescentar uma coluna é uma entrada no array — não uma caçada por cinco arquivos.

### Normalização compartilhada entre ETL e aplicação

`src/lib/normalizacao.ts` é importado tanto pelo `scripts/import-planilhas.ts` quanto
pelos componentes. Um CNPJ digitado na tela passa exatamente pelo mesmo tratamento que um
CNPJ vindo da planilha — não há duas verdades sobre o que é um dado válido.

### Exportação no servidor

Gerar o Excel no navegador exigiria mandar todos os dados para o cliente e confiar nele
para omitir colunas. Gerando em `/api/exportar` (runtime Node), o servidor decide o que
entra no arquivo e ainda registra a exportação na auditoria.

### Auditoria por gatilho, não por código de aplicação

Um gatilho `AFTER INSERT/UPDATE/DELETE` em cada tabela sensível grava em `audit_logs`.
Assim, alteração feita pela tela, por script, pelo painel do Supabase ou por SQL direto
é registrada igualmente. Se dependesse do código da aplicação, bastaria um caminho
esquecido para abrir um buraco na trilha.

O gatilho compara os valores e ignora `UPDATE` que não mudou nada, para a auditoria não
encher de ruído.

---

## Como acrescentar um novo módulo

Exemplo: módulo Fiscal.

**1. Migration** — tabelas + RLS espelhando as políticas existentes:

```sql
create table public.fiscal_apuracoes ( ... );
alter table public.fiscal_apuracoes enable row level security;

create policy fiscal_select on public.fiscal_apuracoes
  for select to authenticated using (public.can_read_fiscal());
```

**2. Helpers de permissão** — em `0001_core_perfis_e_permissoes.sql`, no mesmo formato
de `can_read_legalizacao()`.

**3. Frontend**:

| Passo | Arquivo |
| --- | --- |
| Funções de permissão | `src/lib/permissoes.ts` |
| Catálogo de colunas | `src/lib/colunas-fiscal.ts` |
| Acesso a dados | `src/lib/fiscal.ts` |
| Página | `src/app/(portal)/fiscal/page.tsx` (substitui o `AreaEmConstrucao`) |
| Item de menu | `ITENS` em `src/components/layout/MenuLateral.tsx` |

O design system (`src/components/ui`) e a tabela (`src/components/planilha`) são
reaproveitados como estão.

---

## Convenções

- **Idioma**: código, comentários e nomes de tabela em português — o time do escritório
  lê e mantém isso.
- **Componentes**: um arquivo por responsabilidade; nada de componente com mil linhas.
- **Server vs Client**: Server Component por padrão; `'use client'` só onde há estado ou
  evento. `src/lib/cn.ts` existe separado de `components/ui` justamente porque um Server
  Component não pode importar função de módulo marcado como cliente.
- **Tipos**: `src/types/banco.ts` espelha o schema; nada de `any` na fronteira com o banco.
- **Migrations**: numeradas e imutáveis. Corrigir = nova migration.

---

## Fluxo de autenticação

```
/login
  └─ signInWithPassword
       ├─ credenciais inválidas → mensagem específica em português
       ├─ perfil inexistente    → signOut + "procure o administrador"
       ├─ perfil inativo        → signOut + "acesso desativado"
       └─ sucesso → grava ultimo_acesso → "/" → rotaInicial(perfil)
                                                 ├─ admin        → /dashboard
                                                 ├─ legalizacao  → /legalizacao
                                                 ├─ fiscal       → /fiscal
                                                 ├─ contabil     → /contabil
                                                 └─ dep. pessoal → /departamento-pessoal
```

Recuperação de senha: `/recuperar-senha` → e-mail → `/auth/callback` (troca o código por
sessão) → `/redefinir-senha`. A resposta é idêntica para e-mail existente ou não, para não
revelar quem tem conta no portal.

---

## Desempenho

- Paginação, busca, ordenação e filtros acontecem **no banco** (`range`, `ilike`, `order`),
  não no navegador. A tela funciona igual com 373 ou 50 mil empresas.
- Índices GIN `pg_trgm` em `razao_social` e `cnpj` para busca por trecho; índices comuns
  em `cidade`, `status`, `origem`, `codigo`.
- A busca global tem *debounce* de 350 ms.
- Edição de célula é otimista: a tela atualiza na hora e reverte se o banco recusar.
- `!inner` no join com a tabela administrativa só entra quando há filtro por campo
  confidencial — do contrário as 15 empresas sem bloco financeiro sumiriam do resultado.
