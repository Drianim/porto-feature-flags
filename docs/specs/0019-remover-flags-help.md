---
spec: 0019
titulo: remover npm run flags:help (superado por npm run flags)
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0019 — remover npm run flags:help (superado por npm run flags)

## Resumo

Como **quem cria, altera ou remove uma FF**, quero **que só exista um comando guiado (`npm run flags`)** —
para que **eu não precise escolher entre dois comandos parecidos** (`flags:help`, que só informa, e `flags`, que
já faz tudo).

## Contexto

A spec 0016 criou `npm run flags:help` (lista estática dos três comandos) e a spec 0017 o tornou sensível à
branch atual. A spec 0018 criou `npm run flags`, o menu interativo que pergunta os dados, cria a branch, roda
`new-flag.js` e ainda oferece enviar e abrir o PR — cobrindo tudo que `flags:help` só descrevia em texto. Com os
dois comandos convivendo, `flags:help` virou redundante: quem quer criar uma FF já usa `npm run flags`
diretamente, sem precisar consultar antes o texto de `flags:help`.

## Objetivo e fora de escopo

**Objetivo:** remover `npm run flags:help` por completo: `scripts/flags-help.js`, `scripts/flags-help.test.js`,
a entrada `"flags:help"` em `package.json`, e toda referência a ele em README, CLAUDE.md, skill `feature-flag` e
`scripts/processos.test.js` (o processo "Listar os comandos de FF" sai do mapa; `npm run flags` já é o processo
guiado).

**Fora de escopo:** mudar `npm run flags` (spec 0018, já implementada e coberta por teste); implementar
`update:flag`/`remove:flag` de verdade.

## Critérios de aceite

- [x] CA-1: `scripts/flags-help.js` e `scripts/flags-help.test.js` são apagados.
- [x] CA-2: `package.json` não tem mais a entrada `"flags:help"`.
- [x] CA-3: README, CLAUDE.md e a skill `feature-flag` não citam mais `flags:help`; a seção/linha que o descrevia
      passa a descrever só `npm run flags`.
- [x] CA-4: `scripts/processos.test.js` não tem mais a linha do processo "Listar os comandos de FF"; o processo
      "Menu interativo para criar/alterar/remover FF" (`npm run flags`) continua coberto.
- [x] CA-5: `npm test` e `npm run specs` passam sem os arquivos removidos.

## Desenho

Remoção pura: apagar os dois arquivos de `flags-help`, tirar a linha do `package.json`, trocar o texto de
`README.md`/`CLAUDE.md`/`SKILL.md` que citava `flags:help` para citar só `npm run flags`, e remover a linha do
processo em `scripts/processos.test.js` (o mapa de processos e a cobertura ficam com um processo a menos, já que
`npm run flags` cobre o mesmo propósito).

## Arquivos afetados

- `scripts/flags-help.js` (removido).
- `scripts/flags-help.test.js` (removido).
- `package.json` (remove `"flags:help"`).
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md` (texto ajustado).
- `scripts/processos.test.js` (remove a linha do processo).

## Plano de implementação

### Task 1: Remover flags:help

**Files:** os listados acima.

**Interfaces:** nenhuma nova; só remoção de comando e referências.

1. Apagar `scripts/flags-help.js` e `scripts/flags-help.test.js`.
2. Remover `"flags:help": "node scripts/flags-help.js"` de `package.json`.
3. Em README/CLAUDE.md/SKILL.md, trocar o texto que descrevia `flags:help` para descrever só `npm run flags`
   (mesma seção, sem duplicar).
4. Remover a linha `['Listar os comandos de FF (new/update/remove)', ...]` de `scripts/processos.test.js`.
5. Comando: `npm test` e `npm run specs`.

## Verificação

- `npm test` passa (sem os testes de `flags-help`, que deixam de existir).
- `npm run specs` passa.
- Manual: `npm run flags:help` não existe mais (`npm error Missing script`); `npm run flags` continua
  funcionando como antes.

## Riscos e reversão

- **Nenhum:** remoção de um comando que virou redundante; `npm run flags` (spec 0018) continua cobrindo o mesmo
  propósito de forma mais completa. Reversão: `git revert` do commit desta spec.

## Decisões

- Remover por completo em vez de manter como atalho de consulta: o usuário pediu a remoção explicitamente, já
  que `npm run flags` cobre tudo que `flags:help` fazia (e mais).
