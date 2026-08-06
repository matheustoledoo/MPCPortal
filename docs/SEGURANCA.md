# Segurança e permissões

A regra do PortalMPC: **a permissão vive no banco de dados**. A interface apenas reflete
o que o PostgreSQL já decidiu. Esconder um botão não é segurança.

---

## 1. Camadas

| Camada | Arquivo | O que impede |
| --- | --- | --- |
| 1. Middleware | `src/middleware.ts` | Navegar no portal sem sessão |
| 2. Layout do portal | `src/app/(portal)/layout.tsx` | Entrar com perfil inexistente ou inativo |
| 3. Guarda de página | cada `page.tsx` | Abrir uma tela sem a permissão exigida |
| 4. Rota de exportação | `src/app/api/exportar/route.ts` | Pedir colunas confidenciais no corpo da requisição |
| 5. Rota de criação de usuário | `src/app/api/admin/usuarios/route.ts` | Criar admin sem ser admin; conceder permissão confidencial |
| 6. **RLS no PostgreSQL** | `supabase/migrations/0006`, `0010`, `0011` | **Tudo o mais** — inclusive acesso direto à API |
| 7. Gatilhos | `0010` e `0012` | Conceder permissão de admin a quem não é; alterar coluna fora da atribuição |

As camadas 1 a 5 existem para dar boa experiência (redirecionar, avisar). As camadas 6 e 7
são as que valem: se todas as outras falhassem, o banco continuaria devolvendo zero linhas
confidenciais e recusando as gravações indevidas.

### Permissões modulares (migration 0010)

O acesso deixou de vir da função (`role`) e passa a vir de permissões concedidas por
usuário, marcadas em checkbox pelo administrador. `admin` continua tendo tudo.

Três permissões de tela e duas de dados são **exclusivas de admin**:
`tela.administrativo`, `tela.auditoria`, `tela.configuracoes`,
`dados.administrativo.editar` e `dados.administrativo.exportar`.

Nenhum caminho concede essas chaves a outra função:

| Tentativa | O que acontece |
| --- | --- |
| Marcar o checkbox na tela | O item vem desabilitado para quem não é admin; não aparece no formulário de criação |
| `POST /api/admin/usuarios` com a chave no corpo | A rota filtra a chave antes de gravar (`PERMISSOES_SOMENTE_ADMIN`) |
| `INSERT` direto em `usuario_permissoes` pela API | Gatilho `proteger_permissoes_de_admin` levanta `42501` |
| Linha gravada por engano no banco | `pode()` no frontend recusa a chave mesmo estando na lista do usuário |
| Rebaixar um admin para gestor | Gatilho `limpar_permissoes_ao_rebaixar` apaga as chaves confidenciais |
| Promover-se a admin com `admin.usuarios.gerenciar` | `protect_profile_privileges` levanta `42501` — só admin promove admin |

E, mesmo que uma dessas barreiras caísse, `legalizacao_dados_administrativos` continua com
`FORCE ROW LEVEL SECURITY` e política exclusiva de `is_admin()`: a tela abriria vazia.

### Restrição por coluna (migration 0012)

RLS decide **linha**, não coluna. Para que "fulano só edita a coluna Alvará" fosse regra de
banco e não só de tela, o gatilho `aplicar_colunas_permitidas` compara `old` e `new` a cada
`UPDATE` em `legalizacao_empresas` e levanta `42501` citando exatamente quais colunas foram
recusadas. Lista de colunas vazia = sem restrição, para que o time inteiro siga podendo
editar a planilha.

---

## 2. Políticas de RLS

RLS habilitada em: `profiles`, `legalizacao_empresas`, `legalizacao_dados_administrativos`,
`audit_logs`, `import_logs`, `import_divergencias` e nas quatro tabelas de referência.
`legalizacao_dados_administrativos` usa ainda `FORCE ROW LEVEL SECURITY`, para que nem o
dono da tabela escape.

### `legalizacao_dados_administrativos` — a tabela confidencial

```sql
create policy dados_administrativos_admin_select on legalizacao_dados_administrativos
  for select to authenticated using (public.is_admin());
-- políticas equivalentes para insert, update e delete
```

Não existe nenhuma política que conceda acesso a não-admin. Em RLS, ausência de política
permissiva significa **negado**.

### `legalizacao_empresas` — a base geral

| Operação | Condição |
| --- | --- |
| `select` | `can_read_legalizacao()` — admin, área `legalizacao` ou `administracao` |
| `insert` / `update` | `can_write_legalizacao()` — admin ou área `legalizacao` |
| `delete` | `can_delete_legalizacao()` — admin ou **gestor** de `legalizacao` |

### `audit_logs`

`select` apenas para admin. **Não há política de insert, update ou delete** — a trilha é
imutável para qualquer cliente. As gravações acontecem por gatilhos `SECURITY DEFINER`.

### `profiles`

Cada usuário lê o próprio registro; gestores leem a própria área; admin lê todos.
O gatilho `protect_profile_privileges` levanta exceção se um não-admin tentar mudar
`role`, `area` ou `ativo` — inclusive por chamada direta à API.

### Funções auxiliares

`is_admin()`, `can_read_legalizacao()` e as demais são `SECURITY DEFINER` para poderem
ler `profiles` sem disparar recursão infinita nas políticas da própria tabela. Todas usam
`set search_path = ''` para evitar sequestro de resolução de nomes.

---

## 3. Evidências dos testes executados

Testes rodados no banco real, assumindo a identidade de cada usuário
(`set local role authenticated` + claims de JWT reais).

### 3.1 Leitura

| Usuário | Função / área | Empresas | **Dados adm.** | **Soma honorários** | Auditoria | Perfis |
| --- | --- | --: | --: | --: | --: | --: |
| `admin@portalmpc.local` | admin / administracao | 373 | **358** | **R$ 159.135,98** | 735 | 4 |
| `gestor.legalizacao@…` | gestor / legalizacao | 373 | **0** | **R$ 0,00** | 0 | 2 |
| `legalizacao@…` | colaborador / legalizacao | 373 | **0** | **R$ 0,00** | 0 | 1 |
| `fiscal@…` | colaborador / fiscal | **0** | **0** | **R$ 0,00** | 0 | 1 |

### 3.2 Escrita

| Tentativa | Admin | Gestor Legal. | Colab. Legal. | Fiscal |
| --- | --- | --- | --- | --- |
| Inserir dados administrativos | permitido | **bloqueado (RLS)** | **bloqueado (RLS)** | **bloqueado (RLS)** |
| Alterar honorário existente | permitido | **bloqueado (0 linhas)** | **bloqueado (0 linhas)** | **bloqueado (0 linhas)** |
| Editar campo geral | permitido | permitido | permitido | **bloqueado (0 linhas)** |
| Excluir empresa | permitido | permitido | **bloqueado (0 linhas)** | **bloqueado (0 linhas)** |
| Autopromover-se a admin | permitido (já é) | **exceção do gatilho** | **exceção do gatilho** | **exceção do gatilho** |
| RPC `admin_estatisticas_financeiras` | retorna dados | **"Acesso restrito a administradores."** | idem | idem |

> "bloqueado (0 linhas)" é o comportamento correto da RLS em `UPDATE`/`DELETE`: a linha
> simplesmente não existe para aquele usuário, então nada é afetado.

### 3.3 Prova do isolamento na resposta da API

Mesma empresa, mesma consulta aninhada que o PostgREST executa para
`legalizacao_empresas?select=*,legalizacao_dados_administrativos(*)`:

**Como `admin@portalmpc.local`:**

```json
{
  "razao_social": "2AF SERVICOS ADMINISTRATIVOS LTDA",
  "cnpj": "61409208000153",
  "cidade": "Jundiaí",
  "legalizacao_dados_administrativos": [{
    "valor_honorario": 350,
    "dia_vencimento": 30,
    "competencia_label": "jul/26",
    "observacoes_honorarios": "Até 3 func. Após R$ 35,00",
    "honorarios_historico": [{ "label": "jul/26", "valor": 350, "competencia": "2026-07-01" }]
  }]
}
```

**Como `legalizacao@portalmpc.local`:**

```json
{
  "razao_social": "2AF SERVICOS ADMINISTRATIVOS LTDA",
  "cnpj": "61409208000153",
  "cidade": "Jundiaí",
  "legalizacao_dados_administrativos": []
}
```

O array volta **vazio**. O usuário de Legalização não recebe os campos administrativos em
nenhuma resposta da API — não é uma coluna escondida na tela, é o banco recusando a linha.

### 3.4 Auditoria

Com valores distintos por usuário (para não cair na proteção "nada mudou → não registra"):

| Usuário | UPDATE afetou linha | Registros de auditoria criados | Atribuído a |
| --- | --- | --: | --- |
| admin | sim | 1 | `admin@portalmpc.local` |
| legalizacao | sim | 1 | `legalizacao@portalmpc.local` |
| fiscal | não | 0 | — |

Todos os testes de escrita rodaram dentro de transações revertidas. Verificação posterior
confirmou **0 registros com resíduo de teste** e os totais intactos
(373 empresas / 358 blocos administrativos / R$ 159.135,98).

---

## 4. Exportação para Excel

`POST /api/exportar` monta o universo de colunas permitidas **no servidor**:

```ts
const permitidas = administrador ? TODAS_COLUNAS : COLUNAS_GERAIS;
const pedidas = permitidas.filter((c) => corpo.colunas.includes(c.campo));
```

O cliente escolhe apenas **dentro** do que já lhe é permitido. Um usuário comum que
forjasse `{"colunas": ["valor_honorario"]}` receberia uma planilha sem essa coluna — e,
mesmo se passasse, a RLS devolveria nulo no join.

Filtros por campo confidencial também são descartados para não-admin, evitando inferir
valores por tentativa e erro.

Cada exportação grava um registro `EXPORT` em `audit_logs` com usuário, quantidade de
registros, colunas e se incluiu dados administrativos. O arquivo gerado traz uma aba
**Informações** com essa mesma procedência.

---

## 5. Chaves e segredos

- A `service_role` **nunca** aparece no navegador — só em `scripts/` executados na linha de comando.
- O cliente do navegador usa apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `.env.local` está no `.gitignore`.
- As planilhas de origem (`data/planilhas/*.xlsx`) e os SQL gerados a partir delas estão
  no `.gitignore`: contêm dados reais de clientes e honorários.

### Edge Function `importar-legalizacao`

Usada apenas na carga inicial, para que a `service_role` permanecesse dentro do Supabase
em vez de trafegar pelo ambiente de execução. **Após a importação a função foi desativada**:
foi redeployada com `verify_jwt = true` e corpo que responde `410 Gone`. Verificado:
requisição de escrita agora retorna **401** no gateway.

O código-fonte da versão funcional está em
`supabase/functions/importar-legalizacao/index.ts` e exige o segredo `IMPORT_TOKEN`
configurado no projeto — sem ele, a função recusa toda requisição.

---

## 6. Pendências de segurança

| Item | Situação | Ação recomendada |
| --- | --- | --- |
| **Proteção contra senhas vazadas** | Desligada | Ativar em Supabase → Authentication → Policies (checagem no HaveIBeenPwned) |
| **Senhas dos usuários de teste** | Senhas iniciais conhecidas | Trocar no primeiro acesso ou remover as contas `@portalmpc.local` antes de produção |
| Helpers `SECURITY DEFINER` expostos a `authenticated` | Por design | Cada um devolve apenas o status do próprio chamador; `authenticated` precisa de `EXECUTE` para a RLS funcionar. Nenhuma função é executável por `anon`. |
| MFA para administradores | Não configurado | Avaliar TOTP no Supabase Auth quando o portal for para produção |
| **`service_role` exposta em conversa** | A chave foi colada em texto durante o desenvolvimento | **Rotacionar** em Supabase → Project Settings → API e atualizar o `.env.local` |
| Migrations `0010`, `0011` e `0012` | Escritas, **ainda não aplicadas** | Rodar `npm run migrations:juntar` e executar o arquivo gerado no SQL Editor |

O linter de segurança do Supabase não aponta nenhuma tabela sem RLS nem nenhuma função
executável por `anon`.

> As evidências da seção 3 foram colhidas com as migrations `0001`–`0009` aplicadas. As
> políticas de `0010`–`0012` estão escritas e revisadas, mas os testes de impersonação
> equivalentes só podem ser refeitos depois que elas forem executadas no banco.
