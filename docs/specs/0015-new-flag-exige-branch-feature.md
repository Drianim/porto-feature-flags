---
spec: 0015
titulo: new-flag.js exige rodar numa branch feature/*
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0015 — new-flag.js exige rodar numa branch feature/*

## Resumo

Como **quem cria uma FF nova pelo `npm run new:flag`**, quero **que o script recuse rodar fora de uma branch
`feature/*`**, para que **eu não crie `flags/<key>.json` na branch errada (ex.: `main` ou uma `chore/*`) e só
descubra isso depois, no PR ou no preflight**.

## Contexto

Hoje `scripts/new-flag.js` escreve `flags/<key>.json` e `env/nonprod/<key>.json` sem olhar em qual branch o
comando está rodando. O erro só aparece depois: `check-scope.js`/`check-new-flags.js` no `preflight` ou na
pipeline do PR. Rodar `npm run new:flag` numa branch errada (por exemplo, esquecer de trocar de branch antes) gera
um commit que depois precisa ser desfeito ou movido manualmente. `scripts/lib/preflight.js` já tem `branchKind()`,
que reconhece `feature/`, `update/`, `remove/`, `release/` pelo prefixo — mesma lógica que decide o "Escopo da
branch" no PR.

## Objetivo e fora de escopo

**Objetivo:** `scripts/new-flag.js` lê a branch atual (`git rev-parse --abbrev-ref HEAD`) antes de escrever
qualquer arquivo; se não começar com `feature/`, imprime uma mensagem explicando o motivo e por que (`update/*`
altera FF existente, `remove/*` só apaga, `chore/*` não mexe em FF) e sai com erro, sem criar nada.

**Fora de escopo:** mudar `new-rm.js` ou qualquer outro script (fica para uma spec futura, se pedido); mudar
`check-scope.js`/`check-new-flags.js`/preflight/pipeline (já cobrem isso no PR; esta spec só antecipa o aviso
local); permitir bypass por flag (se a branch estiver errada, o certo é trocar de branch, não ignorar o aviso).

## Critérios de aceite

- [x] CA-1: rodando `node scripts/new-flag.js ...` numa branch que não começa com `feature/` (ex.: `main`,
      `chore/algo`, `update/algo`), o script não cria `flags/` nem `env/nonprod/` e sai com código de erro,
      explicando que FF nova exige uma branch `feature/*`.
- [x] CA-2: rodando numa branch `feature/*`, o comportamento não muda em nada (continua criando os dois arquivos
      normalmente).
- [x] CA-3: a mensagem de erro nomeia a branch atual e o que fazer (criar/trocar para uma `feature/*`).
- [x] CA-4: `npm test` cobre os dois casos (branch feature/* passa, branch fora do prefixo bloqueia) e passa.

## Desenho

`new-flag.js` ganha, logo no início (antes de qualquer `fs.writeFileSync`), uma checagem que roda
`git rev-parse --abbrev-ref HEAD` (via `child_process.execSync`, mesmo padrão de `check-scope.js`) e usa
`branchKind()` de `scripts/lib/preflight.js` para decidir. Se `branchKind(branch) !== 'feature'`, imprime erro e
sai com `process.exit(1)`. Nenhuma outra ordem de validação muda (os `if` de argumentos continuam antes,
já que não faz sentido gastar uma chamada de `git` se o comando já está errado de outro jeito) — a checagem de
branch entra logo após a validação de argumentos e antes de qualquer escrita em disco.

## Arquivos afetados

- `scripts/new-flag.js`: nova checagem de branch antes de escrever os arquivos.
- `scripts/new-flag.test.js` (novo ou existente): casos de branch certa e branca errada.

## Plano de implementação

### Task 1: Checagem de branch em new-flag.js

**Files:** `scripts/new-flag.js`

**Interfaces:** reaproveita `branchKind` de `scripts/lib/preflight.js` (já exportado); nenhuma interface nova.

1. Importar `branchKind` de `./lib/preflight`.
2. Depois da validação de argumentos (linha 18 atual) e antes de `fs.existsSync(file)`, obter a branch atual
   (`execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim()`) e, se
   `branchKind(branch) !== 'feature'`, imprimir
   `✗ branch "${branch}" não é feature/*: criar FF nova exige uma branch feature/* (troque com "git checkout -b feature/<nome>"; update/* altera FF existente, remove/* só apaga, chore/* não mexe em FF)`
   e sair com `process.exit(1)`.
3. Comando: `npm test` (novo teste cobrindo os dois casos).

## Verificação

- `npm test` passa, incluindo os casos novos de `new-flag.js`.
- Manual: `git checkout -b chore/teste-bloqueio && node scripts/new-flag.js ft_x --team squad-poc --criticality baixa --description "x" --platforms ambas --min-version 2.61.0` sai com erro e não cria arquivo; o mesmo comando numa `feature/*` funciona como antes.

## Riscos e reversão

- **Ambiente de teste automatizado sem branch de verdade (`HEAD` destacado, CI de PR):** `git rev-parse
  --abbrev-ref HEAD` devolve `HEAD` nesse caso, que não bate com `feature/`; isso é aceitável porque o script é
  de uso local (o CI nunca roda `new-flag.js`, só valida os arquivos já commitados). Reversão: remover a
  checagem, sem efeito em nenhum arquivo de FF já criado.

## Decisões

- Bloquear (sair com erro) em vez de só avisar: evita commit na branch errada, que depois precisa ser desfeito
  manualmente (já aconteceu nesta campanha de teste, com um commit que foi parar na `main` por engano).
- Só `new-flag.js` por agora: resolve o caso concreto observado; `new-rm.js` (que deveria exigir `release/*`) fica
  para uma spec futura, se pedido, para não misturar duas mudanças numa spec só.
- Reaproveitar `branchKind()` de `scripts/lib/preflight.js` em vez de duplicar a lista de prefixos: é a mesma
  fonte de verdade usada pelo preflight e evita as duas listas divergirem.
