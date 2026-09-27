---
spec: 0029
titulo: visibilidade do próximo estágio do rollout automático em NÃO PROD e alerta de falha no scheduler
status: aprovada
criado: 2026-09-27
atualizado: 2026-09-27
---

# Spec 0029 — visibilidade do próximo estágio do rollout automático em NÃO PROD e alerta de falha no scheduler

## Resumo

Como **quem acompanha uma FF `media`/`critica` em rollout automático de NÃO PROD (spec 0028)**, quero **ver o
percentual atual, o próximo estágio e o horário estimado dele em `npm run status -- rollout <chave>`, e ser
avisado se `nonprod-scheduler.yml` falhar**, para que **eu tenha visibilidade de quando o rollout avança e saiba
de erros sem precisar criar um job por estágio (o que quebraria a garantia de estado único da spec 0028)**.

## Contexto

A spec 0028 deixou `main` como única fonte de verdade do rollout de NÃO PROD: `rolloutStartedAt` (gravado em
`env/nonprod/<key>.json`) mais a hora atual bastam para recalcular o percentual servido
(`nonprodEffectivePercent` em `scripts/lib/rollout.js`), e `nonprod-scheduler.yml` (cron a cada 15 min, sem
`environment: nonprod`) só republica esse cálculo — sem gravar nem depender de nenhum estado externo.

Depois do merge da spec 0028, o usuário perguntou por que nenhum job aparece no GitHub Actions "para cada
estágio" e propôs criar um job agendado por estágio/horário, "para todos terem visibilidade de quando vai rodar e
talvez pausar em caso de erros". Expliquei que isso é tecnicamente ruim nesse repositório: GitHub Actions não tem
agendamento nativo de execução única no futuro; a única forma de ter "um job por estágio" seria (a) um bot
commitando um arquivo de workflow novo por FF — proibido, pois `.github/` só muda por `chore/*` com revisão
humana — ou (b) guardar o horário de cada estágio em algum estado externo ao repositório, quebrando a garantia
"main = única fonte de verdade" que a spec 0028 construiu (hoje o próprio `rolloutStartedAt` já é essa fonte;
duplicá-lo em outro lugar cria dessincronia). O usuário concordou em não seguir por aí ("então não vamos fazer
isso") e pediu, em vez disso, as duas alternativas que eu tinha esboçado: visibilidade calculada na hora e alerta
de erro. Ele confirmou essas duas linhas de volta, literalmente, como o que quer implementado.

Ao investigar onde entraria a visibilidade, encontrei um bug pré-existente em `scripts/lib/status.js`: `flagRow`
(linha 41) calcula o percentual de NÃO PROD como `o.rolloutPercent ?? 100`, sem nunca chamar
`nonprodEffectivePercent`. Isso é diferente de `scripts/lib/remote-config.js` (`build`, linha 46-47), que já
aplica `nonprodEffectivePercent` corretamente. Resultado: `npm run status -- rollout <chave>` mostra um
percentual desatualizado/errado para qualquer FF `media`/`critica` com `rolloutStartedAt` — confirmado ao rodar
`node scripts/ff-status.js rollout ft_teste_rollout_auto --offline`, que respondeu "ligada 100%" enquanto o
`deploy.js nonprod --dry-run` (fonte real do que é publicado) mostrava a condição com `percent(...) <= 5`. Esse
bug precisa ser corrigido antes de qualquer texto de "próximo estágio" fazer sentido, porque hoje o próprio
percentual atual mostrado já está errado.

`renderRollout` (`scripts/lib/status.js`, linha 223-235) hoje imprime, para qualquer chamada em NÃO PROD, a frase
fixa "NÃO PROD publica na hora, sem estágios: o percentual é o `rolloutPercent` de `env/nonprod/`." Isso continua
verdadeiro para `baixa` (ou qualquer override sem `rolloutStartedAt`), mas é falso para `media`/`critica` com
`rolloutStartedAt` — que passam a ter estágio.

Não existe hoje, em nenhum workflow do repositório, um passo que abra uma Issue automaticamente em caso de falha
— seria mecanismo novo, não uma extensão de um padrão já usado.

## Objetivo e fora de escopo

**Objetivo:**
1. Corrigir `flagRow` para usar `nonprodEffectivePercent` no cálculo do percentual de NÃO PROD, alinhando-o ao
   que `remote-config.js`/`deploy.js` de fato publicam.
2. `npm run status -- rollout <chave>` (e o `--json` equivalente), para uma FF com `rolloutStartedAt` em NÃO PROD,
   mostra por plataforma: o estágio atual (percentual), se ainda não é o último, o **próximo** estágio (percentual)
   e o horário estimado em que ele começa (`rolloutStartedAt` + a soma dos `monitorMinutes` dos estágios já
   percorridos) — tudo calculado na hora, sem gravar nem ler nenhum estado novo, só `rolloutStartedAt` (já existe)
   e a hora atual.
3. `nonprod-scheduler.yml` abre uma GitHub Issue (ou comenta numa já aberta pelo próprio workflow, para não
   duplicar) quando o passo de deploy/verify-sync falhar, com o link do run — para que a falha seja notada sem
   precisar olhar o Actions manualmente. Continua tentando de novo sozinho 15 min depois (retry automático já
   existente pelo cron); a Issue é só o alerta, não muda o mecanismo de retry.

**Fora de escopo:** qualquer job novo por estágio/horário (decisão já tomada, não reabrir); pausar o avanço do
rollout por erro (o mecanismo continua idempotente e tenta de nome nas próximas execuções); alertar por outro
canal que não GitHub Issues (ex.: Slack, e-mail — não há integração no repositório hoje); mudar o cálculo de
PROD (`rollout.js`/`currentStage`/RM); fechar a Issue automaticamente quando o próximo run tiver sucesso (fica
para quem lê fechar; ver Decisões).

## Critérios de aceite

- [x] CA-1: `flagRow(flag, 'nonprod', { now })`, para um toggle `media`/`critica` com override `rolloutStartedAt`
      no passado e `value: "true"`, retorna `perPlatform[p].percent` igual ao que
      `nonprodEffectivePercent(flag.criticality, rolloutStartedAt, rolloutPercent, now)` calcularia — não mais
      `rolloutPercent ?? 100` fixo. Sem `rolloutStartedAt` (ou `baixa`), comportamento idêntico a hoje
      (`rolloutPercent ?? 100`). Evidência: `scripts/lib/status.test.js` ("CA-1: ..."), confirmado manualmente com
      `node scripts/ff-status.js rollout ft_teste_rollout_auto --offline` (25%) batendo com `node scripts/deploy.js
      nonprod --dry-run` (`percent(...) <= 25`).
- [x] CA-2: nova função `nextNonprodStage(criticality, rolloutStartedAt, now)` em `scripts/lib/rollout.js`,
      retornando `null` quando não há próximo estágio (sem plano, sem `rolloutStartedAt`, ou já no último estágio)
      ou `{ percent, at }` (`at` = Date do início do próximo estágio) caso contrário. Evidência:
      `scripts/lib/rollout.test.js` (3 novos casos).
- [x] CA-3: `renderRollout`, para uma FF NÃO PROD com ao menos uma plataforma com `rolloutStartedAt` e próximo
      estágio, imprime por plataforma o percentual atual e a linha "Próximo estágio: <percent>% às <at
      formatada>" (fuso `America/Sao_Paulo`, mesmo padrão já usado em `scripts/lib/rollout.js`
      `horarioPermitido`); no último estágio (100%, sem próximo), imprime "Já no estágio final (100%)."; sem
      `rolloutStartedAt`, mantém a frase atual ("NÃO PROD publica na hora, sem estágios..."). Evidência:
      `scripts/lib/status.test.js` ("CA-3: ...").
- [x] CA-4: `--json` no comando `rollout` inclui, por plataforma com estágio, `{ percent, nextStage: { percent,
      at } | null }` nos dados retornados (sem quebrar o formato hoje consumido por quem já lê `--json`, só
      acrescentando o campo). Evidência: `scripts/ff-status.test.js` ("CA-4: ...") — o campo já vinha propagado
      automaticamente por `flagRow`, sem precisar mexer em `ff-status.js`.
- [ ] CA-5: `.github/workflows/nonprod-scheduler.yml`: se `node scripts/deploy.js nonprod` ou `node
      scripts/verify-sync.js nonprod` falhar, um passo seguinte (`if: failure()`) abre uma GitHub Issue com título
      fixo reconhecível (ex. `nonprod-scheduler: falha na publicação automática`) e corpo linkando o run
      (`$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID`); se já existir uma Issue aberta com
      esse título, comenta nela em vez de abrir outra (sem duplicar). Evidência: `scripts/lib/workflows.test.js`
      (novo caso) mais um script testável (`scripts/ci/alertar-falha-scheduler.js` ou equivalente, com teste
      unitário simulando a API do GitHub).
- [ ] CA-6: README (*Rollout automático em NÃO PROD por criticidade*), CLAUDE.md (*Mapa dos processos*) e a skill
      `ff-status` documentam a visibilidade de próximo estágio; a skill/README do scheduler documenta o alerta de
      falha; `scripts/processos.test.js` continua verde (nenhum processo passa a faltar no README/mapa/skill).
- [ ] CA-7: `npm test`, `npm run validate` e `npm run specs` passam.

## Desenho

### `scripts/lib/rollout.js`: `nextNonprodStage`

Reaproveita o mesmo objeto `{ prodSchedule: rolloutStartedAt, rolloutPlan: NONPROD_ROLLOUT_PLANS[criticality] }`
já usado por `nonprodEffectivePercent`, andando a mesma soma de `monitorMinutes` que `currentStage` já percorre
internamente — sem duplicar a regra de negócio, só expondo o próximo estágio em vez do atual:

```js
function nextNonprodStage(criticality, rolloutStartedAt, now = new Date()) {
  const plan = NONPROD_ROLLOUT_PLANS[criticality];
  if (!plan || !rolloutStartedAt) return null;
  const start = Date.parse(rolloutStartedAt);
  let t = start;
  for (let i = 0; i < plan.length; i++) {
    const stage = plan[i];
    const end = t + stage.monitorMinutes * 60000;
    if (stage.monitorMinutes === 0) return null; // já no estágio final
    if (now.getTime() < end) {
      const next = plan[i + 1];
      return next ? { percent: next.percent, at: new Date(end) } : null;
    }
    t = end;
  }
  return null;
}
```

### `scripts/lib/status.js`: `flagRow`

Troca a linha `let percent = o.rolloutPercent ?? 100;` (dentro do `if (toggle)`, ramo não-`timeGated`) para usar
`nonprodEffectivePercent` quando `env === 'nonprod'` e `o.rolloutStartedAt` existir — mesma condição que
`remote-config.js` já usa (`toggle && o.rolloutStartedAt`). Guarda também, na linha (novo campo opcional em
`perPlatform[p]`), o resultado de `nextNonprodStage`, só quando aplicável, para `renderRollout` consumir sem
recalcular.

### `scripts/lib/status.js`: `renderRollout`

Ramo NÃO PROD passa a checar, por plataforma, se `row.perPlatform[p].nextStage` existe: imprime a linha do
próximo estágio (horário formatado em `America/Sao_Paulo`, mesmo `Intl.DateTimeFormat` já usado em
`horarioPermitido`); se a FF está no estágio final ou não tem `rolloutStartedAt`, mantém o texto atual (ajustado
por caso).

### Alerta de falha em `nonprod-scheduler.yml`

Passo novo, depois do `run` existente, com `if: failure()`. Usa `actions/github-script@v7` (já no ecossistema
padrão de Actions, sem dependência nova no `package.json`) com `permissions: issues: write` adicionado ao job.
Lógica (pequena, inline no `script:` do `github-script`, chamando via `require` a função pura testável descrita na
Task 3, `avisarFalha`): busca Issues abertas com o título fixo; se achar, comenta; senão, cria. Mantém a
regra de segurança de workflows (`scripts/lib/workflows.test.js`): nenhuma entrada de PR interpolada em `run`
(este workflow não roda em PR, então a regra já é satisfeita, mas o teste deve continuar cobrindo o arquivo).

## Arquivos afetados

- `scripts/lib/rollout.js` / `.test.js`: `nextNonprodStage`.
- `scripts/lib/status.js` / `.test.js`: `flagRow` usa `nonprodEffectivePercent` + `nextNonprodStage`;
  `renderRollout` imprime o próximo estágio.
- `scripts/ff-status.js`: `--json` do comando `rollout` carrega o campo novo (se não vier automático de `flagRow`).
- `.github/workflows/nonprod-scheduler.yml` / `scripts/lib/workflows.test.js`: passo de alerta de falha.
- `scripts/ci/` (novo script testável para abrir/comentar a Issue, chamado pelo workflow).
- `README.md`, `CLAUDE.md`, `.claude/skills/ff-status/SKILL.md`, `scripts/processos.test.js`: documentação.

## Plano de implementação

### Task 1: `nextNonprodStage`

**Files:** `scripts/lib/rollout.js`, `scripts/lib/rollout.test.js`

**Interfaces:** `nextNonprodStage(criticality, rolloutStartedAt, now = new Date())` → `{ percent, at: Date } |
null`.

1. Teste: `critica`, `rolloutStartedAt` = T, `now` = T → `{ percent: 25, at: T+60min }`; `now` = T+61min →
   `{ percent: 50, at: T+120min }`; `now` = T+181min (já 100%) → `null`.
2. Teste: `media`, `now` = T → `{ percent: 100, at: T+60min }`; `now` = T+61min → `null`.
3. Teste: `baixa`, ou sem `rolloutStartedAt` → `null`.
4. Comando: `npm test` (esperado: todos passam).

### Task 2: corrigir `flagRow` e propagar em `renderRollout`/`--json`

**Files:** `scripts/lib/status.js`, `scripts/lib/status.test.js`, `scripts/ff-status.js`

**Interfaces:** consome `nonprodEffectivePercent`, `nextNonprodStage` (Task 1); `flagRow` passa a aceitar
implicitamente `env === 'nonprod'` com `o.rolloutStartedAt` no cálculo de `percent`; `perPlatform[p].nextStage`
novo campo opcional.

1. Teste: `flagRow` com override `critica` + `rolloutStartedAt` no passado → `percent` bate com
   `nonprodEffectivePercent`, não com `rolloutPercent` cru.
2. Teste: `renderRollout` imprime a linha de próximo estágio quando há `nextStage`; mantém o texto atual quando
   não há.
3. Teste: `--json` do comando `rollout` inclui `nextStage` no objeto da FF.
4. Comando: `npm test` (esperado: todos passam); `node scripts/ff-status.js rollout ft_teste_rollout_auto
   --offline` mostra percentual e próximo estágio coerentes com `deploy.js nonprod --dry-run`.

### Task 3: alerta de falha em `nonprod-scheduler.yml`

**Files:** `.github/workflows/nonprod-scheduler.yml`, `scripts/lib/workflows.test.js`, novo script em
`scripts/ci/`.

**Interfaces:** script novo exporta uma função pura testável (ex. `avisarFalha({ fetch, token, repo, runUrl,
titulo })`) que decide criar ou comentar; o passo do workflow só invoca.

1. Teste: script cria Issue quando não há uma aberta com o título; comenta quando já existe.
2. Teste (`workflows.test.js`): o job tem `permissions: issues: write`; o passo de alerta tem `if: failure()`; a
   URL do run vem só de variáveis de ambiente do GitHub (`GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`/`GITHUB_RUN_ID`),
   nunca interpolada de entrada de PR.
3. Comando: `npm test` (esperado: todos passam).

### Task 4: documentação

**Files:** `README.md`, `CLAUDE.md`, `.claude/skills/ff-status/SKILL.md`, `scripts/processos.test.js`.

**Interfaces:** nenhuma nova — só texto; `scripts/processos.test.js` continua exigindo que cada linha do "Mapa dos
processos" aponte para README + skill/comando existentes.

1. Atualizar a seção *Rollout automático em NÃO PROD por criticidade* do README com o próximo estágio no
   `ff-status` e o alerta de falha.
2. Atualizar `CLAUDE.md` (*Mapa dos processos*) se a linha existente não cobrir o novo comportamento.
3. Comando: `npm test` (o teste de `scripts/processos.test.js` cobre a presença da documentação).

## Verificação

- `npm test`, `npm run validate`, `npm run specs`.
- `node scripts/ff-status.js rollout ft_teste_rollout_auto --offline` mostra percentual e próximo estágio
  coerentes com `node scripts/deploy.js nonprod --dry-run`.
- `node scripts/lib/rollout.test.js` (via `npm test`) cobre `nextNonprodStage`.

## Riscos e reversão

- Risco: `flagRow` passar a usar `nonprodEffectivePercent` pode mudar a saída de `npm run status -- list/summary`
  para qualquer FF `media`/`critica` já existente (o percentual mostrado muda de "o teto declarado" para "o que
  de fato está sendo servido agora") — é a correção do bug, não uma regressão, mas muda o texto visível; sem
  migração de dados (`ff-status` é só leitura).
- Risco: `actions/github-script` é uma action nova no repositório (hoje só `actions/checkout`/`setup-node` são
  usadas) — mitigado por ser uma action oficial do GitHub (`actions/*`), já coberta pela mesma política de
  permissões mínimas testada em `workflows.test.js`.
- Reversão: `revert/*` do commit de `chore/*` desfaz tudo (o alerta de falha é só um passo a mais no workflow, sem
  estado gravado em lugar nenhum).

## Decisões

- **Sem job por estágio/horário:** decisão já tomada antes desta spec (ver Contexto) — quebraria "main = única
  fonte de verdade" (spec 0028) ou exigiria commit automatizado em `.github/` sem revisão humana. Visibilidade e
  alerta resolvem a necessidade real sem esse risco.
- **Issue em vez de outro canal:** único mecanismo de notificação já nativo do GitHub, sem integração nova
  (Slack/e-mail) e sem credencial adicional (usa `GITHUB_TOKEN` padrão do Actions, como `check-approvals.js` já
  faz).
- **Não fechar a Issue sozinho quando o rollout volta a publicar com sucesso:** fechar automaticamente esconderia
  o histórico de que houve falha; como o mecanismo já tenta de novo sozinho por natureza (cron de 15 em 15 min), a
  falha "sumir" não significa que ninguém precisa saber que ela aconteceu. Quem vir a Issue decide fechar.
- **Comentar em vez de duplicar Issue:** evita 96 Issues por dia se o Firebase ficar fora do ar por um dia
  inteiro (falha a cada execução de 15 min).
