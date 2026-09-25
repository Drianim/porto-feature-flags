---
spec: 0014
titulo: Referência completa dos campos de flags/*.json, env/*.json e rm/*.json
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0014 — Referência completa dos campos de flags/*.json, env/*.json e rm/*.json

## Resumo

Como **quem cria ou altera uma FF pelo repositório**, quero **uma tabela única, campo a campo, de
`flags/<key>.json`, `env/<ambiente>/<key>.json` e `rm/RM-*.json`**, para que **eu saiba exatamente o que cada
campo espera e para que serve, sem precisar inferir isso lendo `scripts/validate.js` ou `scripts/lib/flags.js`**.

## Contexto

A seção "Modelo de uma FF" do `README.md` explica o formato em prosa (chave, plataformas, versão mínima, equipe,
grupo, tipo no Firebase) mas nunca lista os campos em forma de tabela nem cobre `rm/RM-*.json`. O deck
`docs/processo-de-deploy-de-feature-flags.html` (spec 0011) também não tem essa referência campo a campo. Quem
abre uma `feature/*`/`update/*`/`release/*` pela primeira vez não tem onde conferir, de forma rápida, se um campo é
obrigatório, qual o formato aceito e o que ele controla — precisou perguntar e eu tive que ler
`scripts/lib/flags.js` e `scripts/validate.js` para montar a resposta. `rm/TEMPLATE.json` já existe como exemplo,
mas sem explicação campo a campo ao lado.

## Objetivo e fora de escopo

**Objetivo:** acrescentar, na seção "Modelo de uma FF" do `README.md`, três tabelas de referência (uma para
`flags/<key>.json`, uma para `env/<ambiente>/<key>.json`, uma para `rm/RM-*.json`) com as colunas Campo,
Obrigatório, Regra/formato e Para que serve — extraídas do comportamento real de `scripts/lib/flags.js` e
`scripts/validate.js`, sem inventar regra nova.

**Fora de escopo:** mudar qualquer validação ou comportamento de script; reescrever a prosa já existente da seção
(as tabelas complementam, não substituem os parágrafos atuais); documentar `catalog/keys.json` (é gerado, não
escrito à mão, já coberto em "Mapa de pastas").

## Critérios de aceite

- [x] CA-1: `README.md`, seção "Modelo de uma FF", tem uma tabela com todos os campos de `flags/<key>.json`
      (`key`, `description`, `team`, `criticality`, `platforms`, `minVersion`, `group` opcional, e a nota de que
      `owner`/`valueType` não devem ser usados), cada um com obrigatoriedade, regra e propósito.
- [x] CA-2: mesma seção tem uma tabela para `env/<ambiente>/<key>.json` (`default`, `ios`/`android`,
      `value`, `rolloutPercent`).
- [x] CA-3: mesma seção (ou a seção de PROD/RM, "PROD, RM e criticidade") tem uma tabela para `rm/RM-*.json`
      cobrindo `id`, `flags`, `targetEnvironments`, `criticality`, `squad`, `rollback`, `prodSchedule`,
      `rolloutPlan` e `approvals.team`/`approvals.platform`.
- [x] CA-4: `npm run specs` e `npm test` continuam passando.

## Desenho

Três tabelas Markdown simples, inseridas como parte da seção existente (a de `flags/`/`env/` dentro de "Modelo de
uma FF", a de `rm/` dentro de "PROD, RM e criticidade", perto do exemplo de `rm/TEMPLATE.json` já referenciado
ali). Conteúdo derivado diretamente das checagens de `scripts/validate.js` e `scripts/lib/flags.js` (campo por
campo, sem reinterpretar regra nenhuma). Sem mudança de script, hook ou pipeline.

## Arquivos afetados

- `README.md`: novas tabelas nas seções "Modelo de uma FF" e "PROD, RM e criticidade".

## Plano de implementação

### Task 1: Adicionar as três tabelas de referência ao README

**Files:** `README.md`

**Interfaces:** nenhuma; é documentação.

1. Na seção "Modelo de uma FF", logo após o parágrafo de plataforma/versão mínima e antes do exemplo em bloco de
   código, inserir a tabela de `flags/<key>.json` e a tabela de `env/<ambiente>/<key>.json`.
2. Na seção "PROD, RM e criticidade", perto da referência a `rm/TEMPLATE.json`, inserir a tabela de
   `rm/RM-*.json`.
3. Comando: `npm run specs` (esperado: passa, spec no formato); `npm test` (esperado: passa).

## Verificação

- `npm run specs` passa.
- `npm test` passa (documentação não altera nenhum script).
- Leitura manual: as três tabelas cobrem todo campo hoje checado em `scripts/validate.js` (`description`, `team`,
  `criticality`, `platforms`, `minVersion`, `group`, `default`, `ios`/`android`.`value`/`rolloutPercent`, e os
  campos de RM validados só com `--prod`).

## Riscos e reversão

- **Nenhum:** é só documentação; nenhum script, hook ou pipeline muda. Reverter é remover as tabelas do PR.

## Decisões

- Spec nova (0014) em vez de reabrir a 0001 (plataforma e versão mínima) ou a 0004 (equipe obrigatória): esta
  spec cobre a referência completa de todos os campos, não só um campo específico; reabrir uma spec já
  `implementada` de um campo isolado ficaria fora de escopo dela.
- Tabela em vez de reescrever a prosa: a explicação em texto corrido já existe e funciona para quem lê a seção
  inteira; a tabela serve como referência rápida para quem já conhece o processo e só quer conferir um campo.
