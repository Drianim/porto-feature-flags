---
spec: 0004
titulo: Equipe obrigatória e validada em toda FF, visível no Firebase
status: rascunho
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0004 — Equipe obrigatória e validada em toda FF, visível no Firebase

## Resumo

Como **responsável por monitorar as FFs**, quero **que toda FF declare a equipe dona, com um nome válido e padronizado, também visível no Firebase**, para que **eu saiba de quem é cada FF, filtre e resuma por equipe e cobre a equipe certa quando algo precisar de atenção**.

## Contexto

Toda FF já tem o campo `owner` (obrigatório, ex.: `squad-poc`), usado no catálogo e no filtro `--owner` do `ff-status`. Três limites atrapalham o monitoramento:

- o valor é texto livre: `squad-poc`, `Squad POC` e `poc` viram três donos diferentes;
- o nome do campo (`owner`) não diz que é a equipe, e o RM usa `squad` e `approvals.team` para coisas próximas;
- a equipe só existe no repositório: no console do Firebase, onde a FF vive, não aparece quem é dona dela.

## Objetivo e fora de escopo

**Objetivo:** toda FF tem `team` (nome da equipe) obrigatório, validado contra uma lista oficial de equipes, publicado no Firebase junto à descrição e usado nas consultas (`ff-status`) e no catálogo.

**Fora de escopo:** dono individual (pessoa) da FF, notificação automática à equipe, cobrança por prazo ou por FF obsoleta, e validar que a `squad` do RM é a mesma equipe da FF.

## Critérios de aceite

- [ ] CA-1: `flags/<chave>.json` exige `team`; o `validate` reprova FF sem `team` ou com um nome que não esteja na lista oficial `config/teams.json`, dizendo a lista válida.
- [ ] CA-2: o campo antigo `owner` é reprovado com a mensagem de renomear para `team`, e as FFs existentes são migradas.
- [ ] CA-3: `config/teams.json` lista as equipes válidas; o `validate` reprova lista vazia, nome duplicado ou fora do formato `^[a-z0-9]+(-[a-z0-9]+)*$`.
- [ ] CA-4: `new-flag` exige `--team <equipe>` (validada contra a lista) e grava `team`; `--owner` é recusado com a mensagem de usar `--team`.
- [ ] CA-5: o Remote Config recebe a descrição publicada como `[<equipe>] <descrição>`, e `verify-sync` e `sync` acusam divergência quando a equipe ou a descrição publicada diferem.
- [ ] CA-6: o catálogo `catalog/keys.json` traz `team` no lugar de `owner`.
- [ ] CA-7: `ff-status` mostra a coluna Equipe, aceita `--team <equipe>` no lugar de `--owner`, e `summary` traz a contagem de FFs por equipe.
- [ ] CA-8: a skill `ff-status`, a skill `feature-flag`, o template de PR, o README e o `CLAUDE.md` falam em `team`.

## Desenho

- **Campo:** `flags/<chave>.json` troca `owner` por `team`. Uma única palavra para o conceito "equipe dona da FF". O `approvals.team` do RM (quem da equipe aprovou) e o `squad` do RM não mudam.
- **Lista oficial:** `config/teams.json` = `{ "teams": ["squad-poc", ...] }`. Equipe nova entra por uma `chore/*` (só admin mescla), o que evita variações de nome e dá um lugar único para saber quais equipes existem. `scripts/lib/flags.js` ganha `teamErrors(flag, teams)` e o `validate` a usa; `loadTeams()` fica em `scripts/lib/common.js`.
- **Firebase:** o Remote Config não tem rótulo por parâmetro; a equipe vai como prefixo da descrição: `[squad-poc] Teste de plataforma...`. `remote-config.js` (`build`) monta `description = "[team] " + flag.description`; `diff` já compara a descrição, então a equipe divergente vira divergência. `flag.description` no repositório continua sem o prefixo.
- **Migração:** as 5 FFs de teste trocam `owner: squad-poc` por `team: squad-poc`; a `chore/*` leva os dados e, depois do merge, roda-se `sync-nonprod` (a descrição publicada muda).
- **Monitoramento:** `status.js` usa `team`; `summarize` ganha `porEquipe`; o filtro é `--team`.
- **Compatibilidade:** não há leitura dupla de `owner`: o campo antigo é erro, com a mensagem de como migrar.

## Arquivos afetados

- `config/teams.json`: lista oficial de equipes.
- `scripts/lib/common.js`, `scripts/lib/flags.js`: `loadTeams`, `teamErrors`.
- `scripts/validate.js`, `scripts/new-flag.js`, `scripts/catalog.js`: exigem, gravam e listam `team`.
- `scripts/lib/remote-config.js`: descrição publicada com a equipe.
- `scripts/lib/status.js`, `scripts/ff-status.js`: `--team`, coluna, `porEquipe`.
- `flags/*.json` e `catalog/keys.json`: migração das FFs existentes.
- testes: `flags.test.js`, `validate.test.js`, `remote-config.test.js`, `status.test.js`, `ff-status.test.js`.
- `.claude/skills/ff-status/SKILL.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`, `README.md`, `CLAUDE.md`.

## Plano de implementação

### Task 1: Lista oficial e regra de equipe

**Files:** `config/teams.json`, `scripts/lib/common.js`, `scripts/lib/flags.js`, `scripts/lib/flags.test.js`

**Interfaces:** produz `loadTeams() -> string[]` (em `common.js`) e `teamErrors(flag, teams) -> string[]` (em `flags.js`): erro se `team` ausente, se `owner` existir (mensagem de renomear) ou se `team` não estiver em `teams`.

1. Teste: FF sem `team`, com `owner`, com equipe fora da lista e com equipe válida.
2. Implementação: `loadTeams` e `teamErrors`.
3. Comando: `node --test scripts/lib/flags.test.js` (esperado: passa).

### Task 2: Validação, criação, catálogo e migração

**Files:** `scripts/validate.js`, `scripts/new-flag.js`, `scripts/catalog.js`, `flags/*.json`, `catalog/keys.json`, `scripts/validate.test.js`

**Interfaces:** consome `teamErrors` e `loadTeams`; `validate` reprova lista de equipes vazia, duplicada ou com formato inválido; `new-flag` recebe `--team` e recusa `--owner`.

1. Teste: `validate.test.js` cobre CA-1 a CA-3 num repositório temporário.
2. Implementação: as três mudanças e a migração das FFs.
3. Comando: `npm test && npm run validate` (esperado: passa).

### Task 3: Equipe na descrição publicada

**Files:** `scripts/lib/remote-config.js`, `scripts/lib/remote-config.test.js`

**Interfaces:** consome `flag.team`; `build` gera `param.description = "[<team>] <descrição>"`; `diff` acusa divergência de descrição.

1. Teste: o parâmetro planejado leva o prefixo; template com a descrição sem prefixo ou com outra equipe diverge.
2. Implementação: prefixo em `build`.
3. Comando: `node --test scripts/lib/remote-config.test.js`.

### Task 4: Consulta por equipe

**Files:** `scripts/lib/status.js`, `scripts/ff-status.js`, `scripts/lib/status.test.js`, `scripts/ff-status.test.js`, `.claude/skills/ff-status/SKILL.md`

**Interfaces:** `flagRow` devolve `team`; `filterRows(rows, { team, ... })`; `summarize(rows).porEquipe`; `parseStatusArgs` aceita `--team` e recusa `--owner`.

1. Teste: coluna Equipe, `--team` filtra, `porEquipe` conta, `--owner` é recusado.
2. Implementação: as mudanças e a skill.
3. Comando: `npm test`.

### Task 5: Documentação e verificação final

**Files:** `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`, `README.md`, `CLAUDE.md`, `docs/specs/0004-equipe-obrigatoria-por-ff.md`

**Interfaces:** consome o comportamento das tarefas anteriores; produz a documentação com `team` e a lista `config/teams.json`.

1. Atualizar os textos e marcar os critérios de aceite.
2. Comando: `npm test && npm run validate && npm run specs`.

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- `node scripts/deploy.js nonprod --dry-run` mostra `[squad-poc] ...` na descrição de cada FF.
- `npm run status -- summary --offline` mostra a contagem por equipe.
- Depois do merge: rodar `sync-nonprod` e conferir no console do Firebase que as descrições trazem a equipe.

## Riscos e reversão

- **A descrição publicada muda em todas as FFs:** esperado; a `main` diverge do Firebase até o `sync-nonprod`, e o `verify-nonprod` alerta.
- **Equipe nova precisa entrar em `config/teams.json`:** é uma `chore/*` (só admin mescla); enquanto isso a FF é reprovada no PR. É o custo de ter nomes padronizados.
- **Reversão:** reverter o merge da `chore/*` devolve `owner`; rodar `sync-nonprod` republica as descrições antigas.

## Decisões

- Um só nome, `team`, para o conceito de equipe dona: `owner` era ambíguo e o RM já usa `squad` e `approvals.team` para coisas diferentes.
- Lista oficial em `config/teams.json` em vez de texto livre: sem ela, o monitoramento por equipe se perde em variações de grafia.
- Prefixo na descrição porque o Remote Config não tem rótulo por parâmetro; é o único jeito de a equipe aparecer no console do Firebase.
- Sem leitura dupla de `owner`: dois nomes para o mesmo dado repetiria a ambiguidade que a spec quer eliminar.
