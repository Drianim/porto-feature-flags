---
spec: 0017
titulo: flags:help mostra o comando certo conforme a branch atual
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0017 — flags:help mostra o comando certo conforme a branch atual

## Resumo

Como **quem vai criar, alterar ou remover uma FF**, quero **que `npm run flags:help` me diga o que fazer a
partir de onde eu estou** — se estou na `main` (ou outra branch que não é `feature/*`/`update/*`/`remove/*`), quero
ver os três fluxos completos (criar a branch certa + o comando); se já estou numa `feature/*`, `update/*` ou
`remove/*`, quero ver só o comando daquele fluxo, sem repetir o `git checkout` que já não preciso mais fazer —
para que **eu não precise adivinhar qual comando roda em qual branch**.

## Contexto

A spec 0016 criou `npm run flags:help`, mas ele sempre imprime a mesma lista fixa dos três comandos
(`new:flag`/`update:flag`/`remove:flag`), sem olhar a branch atual nem mostrar o `git checkout -b` necessário.
Rodando na `main`, o usuário só via o nome do comando `npm run new:flag`, sem saber que precisa primeiro criar uma
branch `feature/*` (spec 0015: `new-flag.js` já recusa rodar fora dela). `scripts/lib/preflight.js` já expõe
`branchKind(branch)`, que reconhece `feature/`, `update/`, `remove/`, `release/` pelo prefixo — mesma lógica
reaproveitada em `new-flag.js` (spec 0015).

## Objetivo e fora de escopo

**Objetivo:** `flags-help.js` lê a branch atual (`git rev-parse --abbrev-ref HEAD`) e decide o que mostrar:

- Se a branch **não é** `feature/*`, `update/*` nem `remove/*` (ex.: `main`, `chore/*`, `release/*`, HEAD
  destacado): mostra os **três** fluxos, em sequência (1. criar FF nova, 2. alterar FF existente, 3. remover FF),
  cada um com o `git checkout -b <tipo>/<nome>` e o comando `npm run` correspondente logo abaixo.
- Se a branch **é** `feature/*`, `update/*` ou `remove/*`: mostra só o comando `npm run` do fluxo daquele tipo
  (sem `git checkout`, já que a branch já está certa), e lista os outros dois comandos abaixo como referência
  rápida (sem o `git checkout`, só para lembrete).

**Fora de escopo:** implementar `update:flag`/`remove:flag` de verdade (continuam "ainda não implementado");
mudar `new-flag.js` ou qualquer outro script além de `flags-help.js`; tratar `release/*` como um quarto fluxo de
FF (não cria FF, é promoção a PROD — fica de fora do `flags:help`, que é só new/update/remove).

## Critérios de aceite

- [x] CA-1: rodando `npm run flags:help` na `main` (ou em `chore/*`, `release/*`, HEAD destacado), a saída lista
      os três fluxos em sequência (criar, alterar, remover), cada um com `git checkout -b <tipo>/<nome>` seguido
      do comando `npm run` daquele tipo.
- [x] CA-2: rodando numa branch `feature/*`, a saída mostra só o comando `npm run new:flag -- ...` (sem
      `git checkout`), e ainda lista `update:flag`/`remove:flag` abaixo como referência (sem `git checkout`).
- [x] CA-3: o mesmo vale, de forma simétrica, para `update/*` (destaca `update:flag`) e `remove/*` (destaca
      `remove:flag`).
- [x] CA-4: `update:flag` e `remove:flag` continuam marcados como "ainda não implementado" em qualquer um dos
      casos acima.
- [x] CA-5: `npm test` cobre os três casos de branch (main/outra, feature/*, update/*, remove/*) e passa.

## Desenho

`flags-help.js` ganha `const { execSync } = require('child_process')` e `const { root } = require('./lib/common')`
e `const { branchKind } = require('./lib/preflight')`, obtém a branch atual do mesmo jeito que `new-flag.js` já
faz (spec 0015), e monta a saída em duas funções puras: `ajudaCompleta()` (os três fluxos com `git checkout`) e
`ajudaFoco(tipo)` (o comando do tipo atual, sem `git checkout`, mais os outros dois como referência). A lista de
comandos continua estática (mesmo array de hoje, com `git checkout` associado a cada um), só a escolha de qual
função chamar muda com `branchKind(branch)`.

## Arquivos afetados

- `scripts/flags-help.js`: lê a branch, decide entre os dois formatos de saída.
- `scripts/flags-help.test.js`: novos casos por branch.

## Plano de implementação

### Task 1: flags-help.js sensível à branch

**Files:** `scripts/flags-help.js`, `scripts/flags-help.test.js`

**Interfaces:** reaproveita `branchKind` de `scripts/lib/preflight.js` e `root` de `scripts/lib/common.js`;
nenhuma interface nova.

1. Definir os três fluxos como dados: `{ tipo: 'feature', cmd: 'new:flag', status: 'ok', desc: '...', args: '-- <chave> --team ...' }` (e os mesmos para `update`/`remove`, `status: 'pendente'`).
2. Obter a branch atual via `execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim()`
   e `const tipoAtual = branchKind(branch)`.
3. Se `tipoAtual` for `'feature'`, `'update'` ou `'remove'`: imprimir só o comando desse tipo (`npm run
   <cmd> <args>` ou "ainda não implementado"), depois uma seção "Outros comandos (referência)" com os dois
   restantes, sem `git checkout`.
4. Senão (inclui `null`, `'release'`): imprimir os três fluxos, cada um numerado, com
   `git checkout -b <tipo>/<nome>` seguido do comando `npm run` (ou "ainda não implementado").
5. Comando: `npm test` (novos casos, um por branch: `main`, `feature/x`, `update/x`, `remove/x`).

## Verificação

- `npm test` passa, incluindo os novos casos de `flags-help.test.js`.
- Manual: `npm run flags:help` na `main` mostra os três fluxos com `git checkout`; numa `feature/*` mostra só
  `new:flag` sem `git checkout`, com os outros dois abaixo como referência.

## Riscos e reversão

- **Nenhum de fora:** só muda a saída de texto de `flags-help.js`; nenhum outro script ou arquivo de FF é
  tocado. Reversão: remover a leitura de branch e voltar à lista fixa (o que a spec 0016 já deixou funcionando).

## Decisões

- `release/*` fica de fora do `flags:help` (que é só new/update/remove): promoção a PROD é um fluxo diferente
  (`npm run new:rm`), já documentado em README/skill; misturar aqui confundiria o propósito do comando.
- Mostrar os três fluxos completos em qualquer branch que não seja `feature/*`/`update/*`/`remove/*` (não só
  `main`): mais simples que enumerar exceções (`chore/*`, `release/*`, HEAD destacado) e ainda é a informação
  certa nesses casos (nenhum dos três comandos de FF roda ali mesmo).
