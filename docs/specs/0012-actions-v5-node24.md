---
spec: 0012
titulo: Atualizar actions/checkout e actions/setup-node para v5 (Node 24), sem warning de depreciação
status: aprovada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0012 — Atualizar actions/checkout e actions/setup-node para v5 (Node 24), sem warning de depreciação

## Resumo

Como **quem opera a pipeline deste repositório**, quero **trocar `actions/checkout@v4` e `actions/setup-node@v4` por
`@v5` em todos os workflows**, para que **os jobs parem de mostrar o aviso de depreciação do Node 20 e rodem no
runtime suportado (Node 24)**.

## Contexto

Toda execução de `main.yml`, `pr.yml`, `sync-nonprod.yml`, `verify-nonprod.yml`, `prod-scheduler.yml` e
`plan-prod.yml` mostra em Annotations: "Node.js 20 is deprecated. The following actions target Node.js 20 but are
being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4" (`https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/`).
As duas actions já têm release v5 com suporte nativo a Node 24 (`actions/checkout` v5.0.0, `actions/setup-node` v5),
sem mudança de comportamento nos parâmetros usados aqui (`with: fetch-depth`, `node-version`, `cache`).

## Objetivo e fora de escopo

**Objetivo:** trocar `@v4` por `@v5` nas 20 ocorrências de `actions/checkout` e `actions/setup-node` nos 6 arquivos
de `.github/workflows/`, sem mudar nenhum outro parâmetro ou comportamento de job.

**Fora de escopo:** o aviso de "ubuntu-latest vai migrar para Ubuntu 26" (é só um notice informativo, sem ação
disponível hoje); qualquer outra atualização de action ou versão de Node do projeto.

## Critérios de aceite

- [x] CA-1: nenhuma ocorrência de `actions/checkout@v4` ou `actions/setup-node@v4` resta em `.github/workflows/`.
- [x] CA-2: `scripts/lib/workflows.test.js` continua passando (formato e segurança dos workflows).
- [x] CA-3: `npm test` passa.
- [ ] CA-4: a próxima execução da pipeline (PR ou push na `main`) não mostra o warning de Node 20 nas Annotations.

## Desenho

Substituição mecânica de string (`@v4` → `@v5`) nas linhas `uses: actions/checkout@v4` e `uses: actions/setup-node@v4`
dos 6 arquivos de workflow. Nenhum `with:` muda.

## Arquivos afetados

- `.github/workflows/main.yml`, `pr.yml`, `sync-nonprod.yml`, `verify-nonprod.yml`, `prod-scheduler.yml`,
  `plan-prod.yml`: `@v4` → `@v5` em `actions/checkout` e `actions/setup-node`.

## Plano de implementação

### Task 1: Trocar as versões das actions

**Files:** os 6 arquivos de `.github/workflows/` listados acima

**Interfaces:** nenhuma; só a tag da action usada em `uses:`.

1. Substituir `actions/checkout@v4` → `actions/checkout@v5` e `actions/setup-node@v4` → `actions/setup-node@v5` nos 6 arquivos.
2. Comando: `npm test` (esperado: passa, `workflows.test.js` incluso).

## Verificação

- `grep -rn "actions/checkout@v4\|actions/setup-node@v4" .github/workflows/` não retorna nada.
- `npm test` e `npm run specs` passam.
- Próxima execução da pipeline no GitHub sem o warning de Node 20 (2 warnings a menos nas Annotations).

## Riscos e reversão

- **v5 poderia mudar comportamento default:** os parâmetros usados aqui (`fetch-depth`, `node-version`, `cache`) são
  estáveis entre v4 e v5 nas duas actions; risco baixo. Reversão: voltar `@v5` para `@v4` no merge revert, sem efeito
  em FF, dado ou deploy.

## Decisões

- Só a troca de versão, nada de reescrever os workflows: mudança mínima e mecânica, sem introduzir outro
  comportamento junto (evita misturar uma correção de warning com qualquer outra mudança).
