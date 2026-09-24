---
spec: 0002
titulo: chore/* sem pipeline de PR e só admin mescla
status: implementada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0002 — chore/* sem pipeline de PR e só admin mescla

> Spec retroativa: escrita depois do código, como modelo de preenchimento. O SDD passa a valer a partir da 0003.

## Resumo

Como **mantenedor do repositório**, quero **que branches `chore/*` (ajuste de script, pipeline e documentação) não rodem a pipeline de PR e só possam ser mescladas por admin**, para que **as checagens de FF não atrapalhem ajustes que não são de FF e ninguém mude o motor de deploy sem passar pelo admin**.

## Contexto

O `pull-requests: '**'` de `bitbucket-pipelines.yml` rodava a pipeline de PR (escopo, nome de FF, dry-run) em qualquer branch, inclusive `chore/*`, que não mexe em FF. O Bitbucket também não restringe o merge pela branch de origem: qualquer pessoa com permissão de merge na `main` poderia mesclar uma `chore/*` que altera o motor de deploy.

## Objetivo e fora de escopo

**Objetivo:** só `feature/**`, `update/**`, `remove/**` e `release/**` disparam a pipeline de PR; o merge de `chore/*` na `main` é reprovado (e revertido por PR) se não vier de um admin.

**Fora de escopo:** impedir o merge no Bitbucket (o plano atual não tem esse recurso), proibir `feature/*` de tocar em scripts e identificar admin por conta do Bitbucket (usa o e-mail do commit de merge).

## Critérios de aceite

- [x] CA-1: `pull-requests` da pipeline só tem `feature/**`, `update/**`, `remove/**` e `release/**`, com as mesmas etapas.
- [x] CA-2: a reconferência da `main` aprova `chore/*` mesclada por e-mail listado em `admins` e reprova (com mensagem clara) qualquer outro.
- [x] CA-3: `admins` vazio ou merger não identificado reprova `chore/*`.
- [x] CA-4: outras origens (`feature/*`, `hotfix/*`) não passam por essa regra.
- [x] CA-5: reprovação de `chore/*` gera a branch `revert/pr-<n>-chore-<nome>` pela reversão automática.

## Desenho

- `bitbucket-pipelines.yml`: as chaves de `pull-requests` são as quatro pastas, reaproveitando as etapas por âncora YAML (`&pr-steps`).
- `scripts/lib/merger.js` (`evaluate`): lógica pura; `scripts/check-merger.js`: lê o e-mail do committer do commit de merge (`git log -1 --format=%ce`) e `admins` de `config/approvers.json`.
- `scripts/ci/recheck-merge.sh` ganha o caso `chore/*`; `scripts/ci/revert-merge.sh` passa a reverter também `chore/*`.
- É uma barreira **depois** do merge (igual às demais reconferências); o conteúdo entra na `main`, mas a reversão fica pronta em um clique.

## Arquivos afetados

- `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`.
- `scripts/lib/merger.js`, `scripts/lib/merger.test.js`, `scripts/check-merger.js`.
- `scripts/ci/recheck-merge.sh`, `scripts/ci/revert-merge.sh` e os testes `recheck-merge.test.js`, `revert-merge.test.js`.
- `config/approvers.json`, `README.md`, `.claude/skills/feature-flag/SKILL.md`.

## Plano de implementação

### Task 1: PR de chore sem pipeline

**Files:** `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`

**Interfaces:** `pipelines['pull-requests']` tem exatamente as chaves `feature/**`, `update/**`, `remove/**`, `release/**`, com o mesmo conteúdo.

1. Teste: `pipeline.test.js` confere as chaves e a igualdade das etapas.
2. Implementação: âncora `&pr-steps` em `feature/**` e referência nas outras três.
3. Comando: `node --test scripts/lib/pipeline.test.js`.

### Task 2: Regra de admin no merge

**Files:** `scripts/lib/merger.js`, `scripts/lib/merger.test.js`, `scripts/check-merger.js`, `config/approvers.json`

**Interfaces:** produz `evaluate({ source, mergerEmail, admins }) -> { ok, problems }`; `check-merger.js <branch> [commit]` sai com 1 se reprovar.

1. Teste: admin (ignorando maiúsculas) passa; outro e-mail, lista vazia e merger desconhecido reprovam; origens que não são `chore/*` passam.
2. Implementação: `evaluate`, a CLI e `admins` em `config/approvers.json`.
3. Comando: `node --test scripts/lib/merger.test.js`.

### Task 3: Ligar na reconferência e na reversão

**Files:** `scripts/ci/recheck-merge.sh`, `scripts/ci/revert-merge.sh`, `scripts/ci/recheck-merge.test.js`, `scripts/ci/revert-merge.test.js`

**Interfaces:** consome `check-merger.js`; `recheck-merge.sh` roda `check-merger` para `chore/*`; `revert-merge.sh` aceita `chore/*` na lista de origens.

1. Teste: repositório temporário com merge feito por admin passa, por outra pessoa reprova; `hotfix/*` não reverte, `chore/*` reprovada reverte.
2. Implementação: os dois `case` dos scripts.
3. Comando: `npm test`.

## Verificação

- `npm test`, `npm run validate` e `npm run specs`.
- `node scripts/check-merger.js chore/revert-automatico 1c264d1` (merge real feito pelo admin) imprime `✓`.
- Depois do merge, conferir que um PR de `chore/*` não abre pipeline no Bitbucket.

## Riscos e reversão

- **E-mail do commit de merge não bate com o cadastrado:** a reconferência reprova e prepara uma reversão. Ajustar `admins` (e-mail que o Bitbucket usa no commit de merge).
- **Sem teste antes do merge:** PR de `chore/*` mexendo em script não roda testes no PR; rode `npm test` antes e confie na pipeline da `main`.
- **Reversão:** reverter o merge desta chore devolve `pull-requests: '**'` e tira a regra de admin.

## Decisões

- Barreira depois do merge, porque o Bitbucket não restringe merge pela branch de origem e o merge check por build não bloqueia no plano atual.
- Identificar o admin pelo e-mail do committer do merge (o commit já traz); o `account_id` do Bitbucket exigiria token.
- `chore/*` não roda pipeline de PR: o que ela muda não é FF e as checagens de PR são sobre FF.
