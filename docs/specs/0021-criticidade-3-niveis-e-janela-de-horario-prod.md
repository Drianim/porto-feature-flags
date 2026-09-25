---
spec: 0021
titulo: criticidade com 3 níveis e janela de horário obrigatória em PROD
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0021 — criticidade com 3 níveis e janela de horário obrigatória em PROD

## Resumo

Como **quem agenda um RM para PROD**, quero **que a criticidade tenha só 3 níveis (baixa, media, critica) e que o
horário agendado (`prodSchedule`) seja validado contra uma janela permitida por criticidade** — para que **baixa
possa ir a qualquer hora, e media/critica só na janela de baixo tráfego (22:00–06:00, horário de Brasília)**, sem
depender de alguém lembrar disso na hora de preencher o RM.

## Contexto

Hoje `criticality` tem 4 níveis (`baixa`, `media`, `alta`, `critica`), usados em `flags/<key>.json` e em
`rm/RM-*.json` (spec 0004 e o desenho original do RM). Nenhum dado real (`flags/`, `env/`, `rm/`) usa `alta` hoje.
O usuário decidiu simplificar para 3 níveis e, junto disso, acrescentar uma regra nova: o horário de PROD
(`prodSchedule`, validado por `scripts/validate.js --prod`) precisa respeitar uma janela por criticidade — hoje
nada impede agendar um RM crítico às 14h. A regra é só de PROD: FFs em NÃO PROD (`feature/*`, `update/*`, o menu
`npm run flags`) continuam sem qualquer restrição de horário.

## Objetivo e fora de escopo

**Objetivo:**
1. Reduzir `criticality` para 3 valores válidos: `baixa`, `media`, `critica` (remove `alta` de toda validação,
   prompts, plano de rollout padrão e documentação).
2. `scripts/validate.js --prod` passa a reprovar um RM cujo `prodSchedule` caia fora da janela permitida pela
   criticidade das flags do RM:
   - `baixa`: sem restrição (qualquer horário).
   - `media` e `critica`: só entre **22:00 e 06:00, horário de Brasília** (`America/Sao_Paulo`).

**Fora de escopo:** mudar o `rolloutPlan` padrão de `media`/`critica` (continuam como estão, só perdem o nível
`alta` que era idêntico a `critica`); mudar a regra de dupla aprovação; qualquer restrição de horário em NÃO PROD
(menu `npm run flags`, `new-flag.js`, `feature/*`/`update/*`); horário de verão (o cálculo usa o fuso IANA
`America/Sao_Paulo`, que já resolve variação de horário de verão sozinho, se voltar a existir).

## Critérios de aceite

- [x] CA-1: `criticality` só aceita `baixa`, `media` ou `critica` em `scripts/validate.js`, `scripts/new-flag.js`
      (mensagem de uso), `scripts/new-rm.js` (plano padrão) e `scripts/flags-menu.js` (prompt); `alta` não aparece
      mais em nenhum dos quatro.
- [x] CA-2: um RM com flags de criticidade `media` ou `critica` cujo `prodSchedule` caia fora de 22:00–06:00
      (horário de Brasília) é reprovado por `node scripts/validate.js --prod`, com mensagem clara da janela exigida.
- [x] CA-3: um RM com flags de criticidade `media`/`critica` cujo `prodSchedule` caia dentro de 22:00–06:00
      (horário de Brasília) passa em `node scripts/validate.js --prod` (mantidas as demais regras já existentes).
- [x] CA-4: um RM com flags só de criticidade `baixa` passa em qualquer horário (sem checagem de janela).
- [x] CA-5: README (`Comandos de FF`, tabela de criticidade e a referência de campos do RM), CLAUDE.md e a skill
      `feature-flag` (e `ff-status`, que cita os valores de `--criticality`) refletem os 3 níveis e a janela de
      horário de `media`/`critica`.
- [x] CA-6: `npm test` e `npm run specs` passam.

## Desenho

**Remoção de `alta`:** troca simples de listas/enums (`CRIT`/`CRITICALITIES`/`order` em `validate.js`,
`new-rm.js`, `status.js`) e de texto (mensagens de uso, prompt do menu, tabelas do README/SKILL). O plano de
rollout de `critica` já era idêntico ao de `alta` (`plans.critica = plans.alta`) — vira só `plans.critica`
com o mesmo array, sem o alias.

**Janela de horário:** função nova em `scripts/lib/rollout.js` (mesmo arquivo que já lida com tempo/`prodSchedule`):
`horarioPermitido(criticidade, dataISO)` — para `baixa` sempre `true`; para `media`/`critica`, converte a data para
o horário civil de `America/Sao_Paulo` (via `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo', hour12: false`,
sem depender de biblioteca nova) e confere se a hora está em `[22, 24) ∪ [0, 6)`. `scripts/validate.js --prod` chama
essa função, com a **maior criticidade entre as flags do RM** (mesma lógica que `new-rm.js` já usa para escolher o
`rolloutPlan` padrão), e reprova com uma mensagem que nomeia a janela exigida (ex.: `prodSchedule 14:00 (América/São
Paulo) fora da janela exigida para criticidade "critica": 22:00–06:00`).

## Arquivos afetados

- `scripts/lib/rollout.js` (+ teste): função `horarioPermitido`.
- `scripts/validate.js` (+ teste): chama `horarioPermitido` no bloco `--prod`; `CRIT` perde `alta`.
- `scripts/new-flag.js`: mensagem de uso perde `alta`.
- `scripts/new-rm.js`: `order` perde `alta`; `plans.alta`/alias de `plans.critica` viram só `plans.critica`.
- `scripts/flags-menu.js` (+ teste, se necessário): prompt de criticidade perde `alta`.
- `scripts/lib/status.js` (+ teste): `CRITICALITIES` perde `alta`.
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.claude/skills/ff-status/SKILL.md`: texto e
  tabelas ajustados (3 níveis; janela de horário documentada).
- `rm/TEMPLATE.json`: sem mudança de estrutura (já usa `media`, que continua válido).

## Plano de implementação

### Task 1: Reduzir criticidade para 3 níveis

**Files:** `scripts/validate.js`, `scripts/new-flag.js`, `scripts/new-rm.js`, `scripts/flags-menu.js`,
`scripts/lib/status.js`, `scripts/validate.test.js`, `scripts/lib/status.test.js`, `scripts/flags-menu.test.js`,
`README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.claude/skills/ff-status/SKILL.md`.

**Interfaces:** nenhuma nova; só o conjunto de valores aceitos por `criticality` muda de 4 para 3 itens nos
mesmos pontos que já validam/listam essa string.

1. Remover `alta` de `CRIT` (`validate.js`), `CRITICALITIES` (`status.js`) e `order`/`plans` (`new-rm.js`; o plano
   de `critica` deixa de ser um alias e vira o array direto).
2. Ajustar as mensagens de uso/prompt (`new-flag.js`, `flags-menu.js`) para `<baixa|media|critica>`.
3. Ajustar README (`Comandos de FF`, tabela de criticidade, referência de campos do RM), CLAUDE.md, skill
   `feature-flag` e skill `ff-status` para citar só os 3 níveis.
4. Ajustar os testes existentes que citam `alta` (`status.test.js`) para usar um dos 3 níveis restantes, sem
   perder a asserção que cada teste já fazia.

### Task 2: Janela de horário por criticidade em PROD

**Files:** `scripts/lib/rollout.js`, `scripts/lib/rollout.test.js`, `scripts/validate.js`, `scripts/validate.test.js`,
`README.md` (referência de campos do RM).

**Interfaces:** `scripts/lib/rollout.js` exporta `horarioPermitido(criticidade, dataISO)` — devolve
`{ ok: boolean, motivo?: string }`; usada por `scripts/validate.js` no bloco `--prod`.

1. Escrever `horarioPermitido` em `scripts/lib/rollout.js`: `baixa` sempre `ok: true`; `media`/`critica` convertem
   `dataISO` para hora civil em `America/Sao_Paulo` e conferem `hora >= 22 || hora < 6`.
2. Em `scripts/validate.js`, no bloco `if (prod)`, calcular a maior criticidade entre as flags do RM (mesma lógica
   de `new-rm.js`) e chamar `horarioPermitido`; se `ok` for `false`, `err(rm.file, ...)` com a janela exigida.
3. Testes em `scripts/lib/rollout.test.js`: horário dentro/fora da janela para `media`/`critica`; `baixa` sempre
   passa, em qualquer horário.
4. Teste em `scripts/validate.test.js`: RM com flag `critica` e `prodSchedule` às 14h (horário de Brasília) é
   reprovado; o mesmo RM com `prodSchedule` às 23h passa; RM só com flags `baixa` passa em qualquer horário.
5. Atualizar a referência de campos do RM no README (`prodSchedule`, tabela de criticidade) citando a janela.
6. Comando: `npm test` e `npm run specs`.

## Verificação

- `npm test` passa, incluindo os testes novos de `horarioPermitido` e do bloco `--prod` de `validate.js`.
- `npm run specs` passa.
- Manual: `npm run flags` mostra `Criticidade (baixa|media|critica):` (sem `alta`); um RM de teste com flag
  `critica` e `prodSchedule` de manhã falha em `node scripts/validate.js --prod` com a mensagem da janela; o mesmo
  RM com horário de madrugada passa.

## Riscos e reversão

- **Nenhum dado real usa `alta` hoje** (confirmado em `flags/`, `env/`, `rm/`): a remoção não quebra nenhuma FF ou
  RM existente.
- A janela de horário só reprova **RM novo/alterado** em `release/*` (checado no preflight e no PR, antes do
  merge); não afeta FFs já publicadas em PROD. Reversão: `git revert` do commit desta spec.

## Decisões

- Janela fixa 22:00–06:00 (horário de Brasília) para `media` e `critica`, e sem restrição para `baixa`: definido
  pelo usuário, não inventado.
- Validação em `scripts/validate.js --prod` (já rodado por `npm run preflight`/`npm run pr` em `release/*` e pela
  pipeline do PR) em vez de um script novo: mesmo lugar que já reprova `prodSchedule`/`rolloutPlan` malformados,
  evita duplicar a leitura de RM e flags.
- `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` em vez de uma biblioteca de fuso horário nova: o Node
  já resolve fuso IANA nativamente (testado nesta máquina), sem dependência nova a justificar na spec.
