---
spec: 0020
titulo: npm run flags:help volta como atalho de npm run flags
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0020 — npm run flags:help volta como atalho de npm run flags

## Resumo

Como **quem digita de cabeça `npm run flags:help`** (hábito de antes da spec 0019), quero **que o comando exista
de novo, mas rodando o menu interativo (`npm run flags`)** — para que **eu não precise trocar de comando na
cabeça, mesmo já não existindo mais o texto estático que `flags:help` mostrava**.

## Contexto

A spec 0016 criou `npm run flags:help` (lista estática dos comandos); a spec 0018 criou `npm run flags` (menu
interativo que já faz tudo); a spec 0019 removeu `flags:help` por completo, já que ficou redundante. Na prática,
porém, `flags:help` virou hábito de digitação — o usuário continua tentando `npm run flags:help` (e até
`flags:help` sem `npm run`, que o shell não reconhece). Esta spec reintroduz `flags:help` só como **atalho**: em
vez de imprimir texto, ele chama o mesmo `scripts/flags-menu.js` do `npm run flags`. Não é uma reversão da spec
0019 (o script `flags-help.js` e seu texto estático não voltam) — é um segundo nome de comando para o script já
existente.

## Objetivo e fora de escopo

**Objetivo:** `npm run flags:help` executa exatamente o mesmo programa que `npm run flags` (`scripts/flags-menu.js`),
sem duplicar código nem reintroduzir `scripts/flags-help.js`.

**Fora de escopo:** mudar o comportamento do menu (`flags-menu.js`, spec 0018, já implementada); qualquer texto de
ajuda estático (isso foi removido de propósito pela spec 0019); implementar `update:flag`/`remove:flag` de verdade.

## Critérios de aceite

- [x] CA-1: `npm run flags:help` roda sem erro e apresenta o mesmo menu interativo de `npm run flags` (mesma saída,
      mesmo script `scripts/flags-menu.js`).
- [x] CA-2: `package.json` não ganha um script novo (`scripts/flags-help.js` não volta a existir); `flags:help` é
      só outra entrada de `package.json` apontando para `scripts/flags-menu.js`.
- [x] CA-3: README, CLAUDE.md e a skill `feature-flag` citam `npm run flags:help` como sinônimo de `npm run flags`
      (mesma frase, sem duplicar a explicação do menu).
- [x] CA-4: `scripts/processos.test.js` continua cobrindo o processo "Menu interativo para criar/alterar/remover FF"
      com as pistas `npm run flags` e `npm run flags:help`.
- [x] CA-5: `npm test` e `npm run specs` passam.

## Desenho

`package.json` ganha `"flags:help": "node scripts/flags-menu.js"` — a mesma linha de comando de `"flags"`, só com
outro nome de script. Nenhum arquivo `.js` novo: os dois nomes de comando rodam o mesmo `scripts/flags-menu.js`.
Testes de `flags-menu.test.js` continuam rodando o script diretamente (`node scripts/flags-menu.js`), sem
precisar de um teste novo para o alias (é `npm` resolvendo dois nomes para o mesmo `node scripts/...`, não lógica
nova para testar).

## Arquivos afetados

- `package.json` (novo script `flags:help`, apontando para `scripts/flags-menu.js`).
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md` (citam `npm run flags:help` como sinônimo).
- `scripts/processos.test.js` (pista `npm run flags:help` adicionada ao processo já existente).

## Plano de implementação

### Task 1: Alias flags:help → flags-menu.js

**Files:** os listados acima.

**Interfaces:** nenhuma nova; `flags:help` é só outro nome de comando do `package.json` para o script já existente
`scripts/flags-menu.js`.

1. Adicionar `"flags:help": "node scripts/flags-menu.js"` a `package.json` (mesma linha de `"flags"`).
2. Em README/CLAUDE.md/SKILL.md, ajustar a frase existente sobre `npm run flags` para citar `npm run flags:help`
   como sinônimo (ex.: "`npm run flags` (ou `npm run flags:help`) abre um menu interativo...").
3. Em `scripts/processos.test.js`, acrescentar `'npm run flags:help'` às pistas do processo "Menu interativo para
   criar/alterar/remover FF" (README e skill).
4. Comando: `npm test` e `npm run specs`.

## Verificação

- `npm test` passa.
- `npm run specs` passa.
- Manual: `npm run flags:help` abre o mesmo menu que `npm run flags` (testar ao menos a opção 1 localmente antes
  de subir o PR).

## Riscos e reversão

- **Nenhum:** dois nomes de comando para o mesmo script, sem lógica nova. Reversão: `git revert` do commit desta
  spec (volta a só existir `npm run flags`).

## Decisões

- Alias em vez de reviver `scripts/flags-help.js`: o usuário quer o **nome do comando** de volta, não o texto
  estático que a spec 0019 removeu de propósito por ser redundante com o menu.
