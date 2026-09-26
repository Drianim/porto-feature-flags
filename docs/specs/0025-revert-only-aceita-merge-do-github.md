---
spec: 0025
titulo: revert/* — reconhecer também o formato de merge commit do GitHub
status: implementada
criado: 2026-09-26
atualizado: 2026-09-26
---

# Spec 0025 — revert/* — reconhecer também o formato de merge commit do GitHub

## Resumo

Como **quem opera a reversão automática de um merge ruim**, quero **que `scripts/lib/revert-only.js` aceite
também os commits `git revert -m 1 <merge>` de merges no formato do GitHub**, para que **uma `revert/*` gerada
automaticamente por `scripts/ci/revert-merge.sh` depois da migração para o GitHub (spec 0010) não seja recusada
pela própria checagem que deveria validá-la**.

## Contexto

`scripts/lib/revert-only.js` (`REVERT_OF_MERGE = /^Revert "Merged (in )?\S+/`) só reconhece a mensagem de revert no
formato antigo do Bitbucket: `Revert "Merged in <branch> (pull request #N)"`. Desde a spec 0010 (migração para o
GitHub), o GitHub escreve merge commits como `Merge pull request #N from <owner>/<branch>`, e `git revert -m 1
<merge>` gera a mensagem `Revert "Merge pull request #N from <owner>/<branch>"` — que **não** casa com o regex
atual.

Isso foi reproduzido de verdade: o merge do PR #20 (`feature/ft-teste-v7`) violou uma regra (permissão por equipe:
`config/teams.json` alterado fora de `chore/*`) e `scripts/ci/revert-merge.sh` criou automaticamente
`revert/pr-20-feature-ft-teste-v7` com o commit `Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"`
— um revert legítimo e correto. O job "Só reverts de merge da main" (`node scripts/ci/check-revert.js origin/main`,
`.github/workflows/pr.yml:155`) recusou esse PR (#24) com `"..." não é um revert de um merge da main`, mesmo sendo
exatamente isso. Ou seja: **toda `revert/*` criada pela reversão automática desde a migração para o GitHub falha
essa checagem**, mesmo quando é o revert correto de um merge de verdade — o oposto do que a proteção deveria fazer.

O histórico do repositório (`git log --all --format=%s`) confirma os dois formatos coexistindo: commits antigos
`Merge pull request #1..#20 from ...` (GitHub, atual) e reverts antigos `Revert "Merged in ... (pull request
#N)"` (Bitbucket, histórico, já mesclados antes da spec 0010) — a correção precisa aceitar os dois, sem quebrar o
formato antigo (ainda pode aparecer em reverts de PRs antigos ou em testes que fixam o formato histórico).

## Objetivo e fora de escopo

**Objetivo:** `revertOnlyProblems` (`scripts/lib/revert-only.js`) aceita como "revert de merge válido" tanto
`Revert "Merged in <branch> (pull request #N)"` (Bitbucket, formato histórico) quanto `Revert "Merge pull request
#N from <owner>/<branch>"` (GitHub, formato atual) — qualquer um dos dois passa; qualquer outro commit continua
recusado, com a mesma mensagem de erro de hoje.

**Fora de escopo:** mudar `scripts/ci/check-revert.js` (CLI fina, sem lógica) ou `scripts/ci/revert-merge.sh`
(já gera a mensagem certa via `git revert -m 1`, não precisa mudar); mudar o texto da mensagem de erro para commits
que não são revert de merge; qualquer regra nova sobre quais merges podem ser revertidos (isso já é decidido antes,
pela reconferência — `scripts/ci/recheck-merge.sh` — esta spec só corrige o reconhecimento do formato da mensagem).

## Critérios de aceite

- [x] CA-1: `revertOnlyProblems(['Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"'])` devolve `[]`
      (lista vazia, sem erro).
- [x] CA-2: `revertOnlyProblems(['Revert "Merged in feature/x (pull request #37)"'])` continua devolvendo `[]`
      (formato antigo do Bitbucket, sem regressão).
- [x] CA-3: um commit que não é revert de nenhum dos dois formatos (ex.: `'feat: outra coisa'`) continua sendo
      recusado, com a mesma mensagem `"..." não é um revert de um merge da main (revert/* só leva git revert -m 1
      <merge>)`.
- [x] CA-4: `npm test` cobre CA-1 a CA-3 e passa; `npm run specs` passa.

## Desenho

**`scripts/lib/revert-only.js`:** troca o regex único `REVERT_OF_MERGE` por dois padrões, aceitando qualquer um:
- `/^Revert "Merged (in )?\S+/` (mantido, formato Bitbucket).
- `/^Revert "Merge pull request #\d+ from \S+/` (novo, formato GitHub — bate com a mensagem literal que o GitHub
  escreve em merge commits e que `git revert -m 1` reaproveita entre aspas).

`revertOnlyProblems` passa a filtrar por "não casa com nenhum dos dois", mantendo a mesma mensagem de erro por
commit recusado.

## Arquivos afetados

- `scripts/lib/revert-only.js`: novo padrão para o formato de merge do GitHub.
- `scripts/lib/revert-only.test.js`: testes novos (CA-1, CA-3) e o existente (CA-2) continua passando sem mudança.

## Plano de implementação

### Task 1: aceitar o formato de merge do GitHub em `revertOnlyProblems`

**Files:** `scripts/lib/revert-only.js`, `scripts/lib/revert-only.test.js`

**Interfaces:** `revertOnlyProblems(subjects: string[]): string[]` (assinatura já existente, sem mudança).

1. Teste: `revertOnlyProblems(['Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"'])` deve devolver
   `[]` (hoje devolve 1 erro — falha antes da implementação).
2. Implementação: adicionar o segundo padrão e aceitar qualquer um dos dois.
3. Comando: `npm test` (esperado: todos passam, incluindo os novos e os já existentes de
   `scripts/lib/revert-only.test.js`).

## Verificação

- `npm test` passa, incluindo os casos novos de `scripts/lib/revert-only.test.js`.
- `npm run specs` passa.
- Manual (opcional, já reproduzido antes da spec): reexecutar a checagem "Só reverts de merge da main" no PR #24
  (`revert/pr-20-feature-ft-teste-v7`) depois do merge desta `chore/*` — deve passar a verde.

## Riscos e reversão

- Mudança aditiva (um padrão a mais aceito): nenhuma `revert/*` que hoje passa deixa de passar. Reversão: reverter
  o commit desta spec volta a recusar o formato de merge do GitHub.
- Não afeta `scripts/ci/revert-merge.sh` nem `recheck-merge.sh`: só a validação de formato da mensagem em
  `check-revert.js`/`revert-only.js`.

## Decisões

- Dois padrões alternativos (em vez de generalizar para "qualquer coisa entre aspas depois de `Revert "`) para não
  abrir demais a validação: o objetivo de `revert/*` é só levar reverts de merge de verdade, não qualquer revert de
  commit comum que por acaso comece com "Revert".
