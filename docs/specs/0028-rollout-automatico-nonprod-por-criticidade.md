---
spec: 0028
titulo: rollout automático em NÃO PROD por criticidade, com job agendado e aviso no menu
status: implementada
criado: 2026-09-26
atualizado: 2026-09-27
---

# Spec 0028 — rollout automático em NÃO PROD por criticidade, com job agendado e aviso no menu

## Resumo

Como **quem cria ou aprova uma FF em `npm run flags`**, quero **que uma FF `media`/`critica` suba sozinha em
NÃO PROD seguindo o mesmo processo de estágios já usado em PROD, e que o menu explique isso antes de eu confirmar
a criticidade**, para que **`baixa` continue indo direto a 100% e `media`/`critica` só liberem 100% depois de
passar pelos estágios, sem eu precisar editar `rolloutPercent` manualmente a cada avanço**.

## Contexto

Hoje `rolloutPercent` em `env/nonprod/<key>.json` (`ios`/`android`) é um número fixo: quem quer subir o rollout
edita o arquivo à mão, numa `update/*`. Não existe automação nenhuma em NÃO PROD — só em PROD, via
`scripts/lib/rollout.js` (`currentStage`/`effectivePercent`, tempo-gated a partir de `rm.prodSchedule` +
`rm.rolloutPlan`) e `.github/workflows/prod-scheduler.yml` (hoje manual, comentado, à espera do projeto PROD).

O README (*PROD, RM e criticidade*) já define, por criticidade, o processo de estágios usado em PROD:

| Criticidade | Exigência |
|---|---|
| baixa | plano padrão 100% |
| media | 25% (60 min) → 100% |
| critica | 5% → 25% → 50% → 100% (rollout progressivo obrigatório) |

O usuário pediu o mesmo processo para **NÃO PROD**: `baixa` sobe 100% direto na base; `media` e `critica` seguem o
mesmo processo de estágios, avançado automaticamente por um job. Confirmado com o usuário (`AskUserQuestion`):
NÃO PROD (não PROD, não os dois); mecanismo = GitHub Actions agendado; NÃO PROD usa os mesmos percentuais/tempos
do PROD, com **critica em 60 min por estágio** (em vez dos 30/60/120 do exemplo do `rollout.test.js`, que é só
ilustrativo — o README não fixa tempo para os estágios de `critica`); cadência do job = a cada 15 minutos (mesmo
padrão já sugerido, comentado, em `prod-scheduler.yml`); o job publica direto (`node scripts/deploy.js nonprod`,
sem `environment: nonprod`), sem esperar aprovação a cada avanço de estágio — a aprovação humana já aconteceu no
PR que criou/ligou a FF; o job só publica a passagem do tempo de um rollout já aprovado.

Adicionalmente, `scripts/flags-menu.js` (`criarFF`) pergunta a criticidade em texto livre
(`perguntaObrigatoria(rl, 'Criticidade (baixa|media|critica): ')`), sem validar nem explicar o que a escolha
implica. O usuário quer que, ao escolher, o menu explique o processo de rollout daquela criticidade e permita
trocar a resposta antes de seguir.

## Objetivo e fora de escopo

**Objetivo:**
1. FF toggle (`ft_*`) com override ativo (`value: "true"`) em `env/nonprod/<key>.json`, cuja FF tem
   `criticality: "media"` ou `"critica"`, sobe em estágios de tempo (mesmos percentuais do README, 60 min por
   estágio) até 100%, sem editar o arquivo a cada avanço — o `deploy.js nonprod` já publica o percentual do
   estágio atual, do mesmo jeito time-gated e sem estado que o PROD já faz.
2. `criticality: "baixa"` continua sem estágio: o override serve `rolloutPercent` (ou 100%, sem o campo) direto,
   como hoje.
3. Um novo workflow agendado (`nonprod-scheduler.yml`, cron a cada 15 min) roda `node scripts/deploy.js nonprod`
   (e `verify-sync`) para que o Firebase acompanhe a passagem do tempo entre um merge e o outro — sem precisar de
   um novo merge para "empurrar" o próximo estágio.
4. `npm run flags` (`criarFF`), ao perguntar a criticidade, explica o processo de rollout implicado (baixa: direto
   a 100%; media/critica: estágios automáticos) e só segue depois que o usuário confirmar (ou escolher de novo).

**Fora de escopo:** mudar o processo de PROD (`rollout.js`, `prod-scheduler.yml`, RM) — continuam como estão;
opções 2 (alterar) e 3 (remover) do menu; qualquer avanço de estágio manual/antecipado por métrica de saúde (o
avanço continua só por tempo, igual PROD); permitir configurar percentuais/tempos diferentes por FF (o plano é
fixo por criticidade, igual PROD).

## Critérios de aceite

- [x] CA-1: FF toggle `critica`, override `ios` com `value: "true"` e `rolloutStartedAt` = agora: `node
      scripts/deploy.js nonprod --dry-run --now <agora>` mostra a condição `<key>_ios` com
      `percent('<key>') <= 5`. Com `--now` 61 minutos depois, mostra `<= 25`; 121 minutos depois, `<= 50`; 181
      minutos depois, sem `percent(...)` (100%, cobre todos). Evidência:
      `scripts/lib/rollout.test.js` (suíte completa, verde).
- [x] CA-2: mesma FF, mas `criticality: "media"`: com `--now` = agora, `<= 25`; 61 min depois, sem
      `percent(...)` (100%). Evidência: `scripts/lib/rollout.test.js` (suíte completa, verde).
- [x] CA-3: FF `criticality: "baixa"` com override sem `rolloutStartedAt`: comportamento idêntico a hoje —
      `rolloutPercent` (ou ausência dele = 100%) vale direto, sem estágio. Evidência:
      `scripts/lib/remote-config.test.js` (suíte completa, verde).
- [x] CA-4: FF `media`/`critica` cujo override tem `rolloutStartedAt` no futuro (antes do início): serve 0% (não
      ativa ainda) nessa plataforma, sem quebrar as demais chaves do plano. Evidência:
      `scripts/lib/remote-config.test.js` (suíte completa, verde).
- [x] CA-5: `env/nonprod/<key>.json` com `rolloutStartedAt` num formato inválido (não ISO 8601), ou presente em
      `env/prod/<key>.json`, reprova em `npm run validate`. Evidência: `scripts/validate.test.js`, casos CA-5
      (3 testes, todos verdes).
- [x] CA-6: `npm run new:flag` (e o menu, por baixo), ao criar `ft_*` com `criticality media|critica` e a
      plataforma ativada (`--ios true`/`--android true`), grava `rolloutStartedAt` (agora) nesse override; com
      `criticality baixa`, não grava o campo. Evidência: `scripts/new-flag.test.js` (suíte completa, verde).
- [x] CA-7: `npm run flags`, opção 1, ao digitar a criticidade, mostra a explicação do processo daquela
      criticidade (uma frase por valor: baixa = direto a 100%; media = 25% por 60 min depois 100%; critica =
      5% → 25% → 50% → 100%, 60 min por estágio) e pergunta "Confirmar essa criticidade? (s/N)"; respondendo algo
      diferente de "s"/"sim", volta a perguntar a criticidade (pode escolher outra). Evidência:
      `scripts/flags-menu.test.js`, casos CA-7 (2 testes novos, 16/16 verdes).
- [x] CA-8: `.github/workflows/nonprod-scheduler.yml` existe, roda em `schedule` (cron a cada 15 min, ex.:
      `'3,18,33,48 * * * *'`) e `workflow_dispatch`, só na `main`, chama `node scripts/deploy.js nonprod` e `node
      scripts/verify-sync.js nonprod`, sem `environment: nonprod` (publica sem aprovação manual a cada execução).
      Evidência: `scripts/lib/workflows.test.js`, caso CA-8 (9/9 verdes).
- [x] CA-9: README (*Rollout automático em NÃO PROD por criticidade*), CLAUDE.md (*Mapa dos processos*) e a
      skill `feature-flag` documentam o processo; `scripts/processos.test.js` cobre a nova linha (todos os testes
      de cobertura de processo verdes).
- [x] CA-10: `npm test` (311/311), `npm run validate` (✓ 5 flag(s) e 0 RM(s) válidos; catálogo em dia para 3
      equipe(s)) e `npm run specs` (✓ 28 spec(s) no formato) passam.

## Desenho

### Campo novo: `rolloutStartedAt`

`env/nonprod/<key>.json`, dentro do override de plataforma (`ios`/`android`), campo opcional `rolloutStartedAt`
(ISO 8601, ex. `"2026-09-26T12:00:00-03:00"`): marca quando o rollout em estágio começou para aquela plataforma.
Presente **só em `nonprod`** (validate reprova em `prod`, que já tem seu próprio `prodSchedule` via RM). Sem o
campo, o override funciona exatamente como hoje (`rolloutPercent` fixo, sem estágio) — isso cobre `baixa` e
qualquer FF criada antes desta spec.

### Planos de estágio de NÃO PROD (`scripts/lib/rollout.js`)

Mesmo shape de `rm.rolloutPlan` (`{ percent, monitorMinutes }`), um plano por criticidade, valores confirmados
com o usuário:

```js
const NONPROD_ROLLOUT_PLANS = {
  media: [{ percent: 25, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }],
  critica: [{ percent: 5, monitorMinutes: 60 }, { percent: 25, monitorMinutes: 60 }, { percent: 50, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }],
};

// Igual effectivePercent(cap, rm, now), mas a partir de rolloutStartedAt + o plano da criticidade (sem RM).
// baixa (ou sem rolloutStartedAt): sem estágio, retorna cap ?? 100 direto (comportamento de hoje).
// Antes de rolloutStartedAt: 0 (ainda não ativou nessa plataforma).
function nonprodEffectivePercent(criticality, rolloutStartedAt, cap, now = new Date()) {
  const plan = NONPROD_ROLLOUT_PLANS[criticality];
  if (!plan || !rolloutStartedAt) return cap ?? 100;
  const stage = currentStage({ prodSchedule: rolloutStartedAt, rolloutPlan: plan }, now);
  return stage ? Math.min(stage.percent, cap ?? 100) : 0;
}
```

Reaproveita `currentStage` (já existe, testado) só trocando o RM por `{ prodSchedule, rolloutPlan }` montado na
hora — nenhuma mudança em `currentStage`/`effectivePercent`/`horarioPermitido`.

### `scripts/lib/remote-config.js` (`build`)

Hoje o estágio só é calculado quando `cfgEnv.timeGated` (PROD). Passa a calcular também em NÃO PROD, por
override, quando o override tem `rolloutStartedAt`:

```js
let pct = o.rolloutPercent ?? 100;
if (toggle && stagePercent !== undefined) pct = Math.min(pct, stagePercent);              // já existe (PROD)
else if (toggle && o.rolloutStartedAt) pct = nonprodEffectivePercent(flag.criticality, o.rolloutStartedAt, o.rolloutPercent, now); // novo (NÃO PROD)
```

`rc_*` não usa `rolloutStartedAt` (só toggles ativam por plataforma com estágio; `rc_*` não tem essa forma de
override neste repositório — fora de escopo).

### `scripts/new-flag.js`

Ao gravar `env/nonprod/<key>.json`, para toggles: se `criticality` é `media`/`critica` **e** a plataforma foi
ativada (`--ios true`/`--android true`), grava `rolloutStartedAt` = agora (ISO) nesse override. `baixa`, ou
`--ios false`/sem a flag, não grava o campo. Agora é injetável por `--now <ISO>` (só para teste, mesmo padrão de
`deploy.js`/`verify-sync.js`), sem aparecer na mensagem de uso (uso interno de teste).

### `scripts/flags-menu.js`

Nova função `perguntaCriticidade(rl)` substitui a linha 95 (`perguntaObrigatoria(rl, 'Criticidade
(baixa|media|critica): ')`): valida contra os três valores (repete se inválido, como já faz `perguntaPlataformas`),
imprime uma frase explicando o processo daquela criticidade, pergunta "Confirmar essa criticidade? (s/N)" e só
retorna com "s"/"sim"; qualquer outra resposta volta a perguntar a criticidade (permite trocar).

### Workflow `nonprod-scheduler.yml`

Cópia do padrão de `prod-scheduler.yml`, adaptada: cron ativo (não comentado) a cada 15 min +
`workflow_dispatch`; roda na `main`; **sem** `environment: nonprod` (não pausa por aprovação — o rollout já foi
aprovado no PR que criou/ligou a FF; o job só publica o avanço por tempo, do mesmo jeito idempotente que
`deploy.js nonprod` já publica em qualquer chamada); usa o secret `FIREBASE_SA_KEY_NONPROD` (já existe); roda
`node scripts/deploy.js nonprod` e depois `node scripts/verify-sync.js nonprod`.

## Arquivos afetados

- `scripts/lib/rollout.js` / `scripts/lib/rollout.test.js`: `NONPROD_ROLLOUT_PLANS`, `nonprodEffectivePercent`.
- `scripts/lib/remote-config.js` / `.test.js`: `build()` usa `nonprodEffectivePercent` quando há
  `rolloutStartedAt`.
- `scripts/new-flag.js` / `.test.js`: grava `rolloutStartedAt` em `media`/`critica` com plataforma ativa; `--now`
  para teste.
- `scripts/validate.js` / `.test.js`: valida `rolloutStartedAt` (ISO, só em `nonprod`).
- `scripts/flags-menu.js` / `.test.js`: `perguntaCriticidade` (explica + confirma/troca).
- `.github/workflows/nonprod-scheduler.yml` (novo) + `scripts/lib/workflows.test.js`: cobre o novo workflow.
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `scripts/processos.test.js`: documentam o
  processo novo ("Rollout automático em NÃO PROD por criticidade").

## Plano de implementação

### Task 1: planos e cálculo de estágio de NÃO PROD

**Files:** `scripts/lib/rollout.js`, `scripts/lib/rollout.test.js`

**Interfaces:** `nonprodEffectivePercent(criticality, rolloutStartedAt, cap, now = new Date())`, reaproveitando
`currentStage` já exportado.

1. Teste: `critica`, `rolloutStartedAt` = T, `now` = T, T+61min, T+121min, T+181min → 5, 25, 50, 100.
2. Teste: `media` → 25 em T, 100 em T+61min.
3. Teste: `baixa` (ou criticidade sem plano) → sempre `cap ?? 100`, ignora `rolloutStartedAt`.
4. Teste: sem `rolloutStartedAt` → `cap ?? 100` direto.
5. Teste: `now` antes de `rolloutStartedAt` → 0.
6. Implementação mínima para passar; `npm test`.

### Task 2: `build()` usa o estágio de NÃO PROD

**Files:** `scripts/lib/remote-config.js`, `scripts/lib/remote-config.test.js`

**Interfaces:** consome `nonprodEffectivePercent` de `./rollout`; nenhuma mudança de assinatura pública de
`build`.

1. Teste: FF `critica`, override `ios` com `rolloutStartedAt` = agora, `--dry-run --now agora` → condição com
   `<= 5`; `--now` +61min → `<= 25`.
2. Teste: FF `baixa`, sem `rolloutStartedAt` → condição sem `percent(...)` (100%, como hoje).
3. Teste: `rolloutStartedAt` no futuro → override não aparece (0%, plataforma ainda fora).
4. Implementação; `npm test`.

### Task 3: `new-flag.js` grava `rolloutStartedAt`

**Files:** `scripts/new-flag.js`, `scripts/new-flag.test.js`

**Interfaces:** `--now <ISO>` opcional (default `new Date().toISOString()`), só para teste.

1. Teste: `--criticality critica --ios true` → `env/nonprod/<key>.json.ios.rolloutStartedAt` presente e igual a
   `--now`.
2. Teste: `--criticality baixa --ios true` → sem o campo.
3. Teste: `--criticality media` sem `--ios`/`--android` (override não criado) → nada a gravar.
4. Implementação; `npm test`.

### Task 4: `validate.js` valida o campo novo

**Files:** `scripts/validate.js`, `scripts/validate.test.js`

**Interfaces:** nenhuma assinatura nova; validação a mais no laço existente de `env[platform]` (usa
`Date.parse`, mesmo padrão de `prodSchedule`).

1. Teste: `rolloutStartedAt` inválido (não parseável) em `env/nonprod/` → erro.
2. Teste: `rolloutStartedAt` presente em `env/prod/` → erro.
3. Implementação; `npm test`.

### Task 5: menu explica e confirma a criticidade

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`

**Interfaces:** `perguntaCriticidade(rl)` substitui a chamada a `perguntaObrigatoria` para o prompt de
criticidade; mesma assinatura de `pergunta`/`perguntaObrigatoria` (recebe `rl`, devolve a string escolhida).

1. Teste: responder criticidade inválida → repete a pergunta (como já ocorre com plataforma).
2. Teste: responder `critica` e depois "N" ao confirmar, depois `baixa` e "s" → a FF criada tem `criticality:
   "baixa"`; a saída mostra as duas explicações (uma por tentativa).
3. Implementação; `npm test`.

### Task 6: workflow agendado

**Files:** `.github/workflows/nonprod-scheduler.yml`, `scripts/lib/workflows.test.js`

**Interfaces:** job sem chave `environment:` (diferente de `main.yml`/`publicar-nonprod`), mesmo formato dos
demais workflows (`permissions: { contents: read }`, checkout `fetch-depth: 0`).

1. Teste: workflow existe, tem `schedule` com cron válido e `workflow_dispatch`, roda só na `main`, sem
   `environment:`, chama `deploy.js nonprod` e `verify-sync.js nonprod`.
2. Implementação; `npm test`.

### Task 7: documentação

**Files:** `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `scripts/processos.test.js`.

**Interfaces:** nova entrada na lista `PROCESSOS` de `scripts/processos.test.js`: `['Rollout automático em
NÃO PROD por criticidade', 'feature-flag', [pistas README], [pistas skill]]`.

1. Nova linha no Mapa dos processos + entrada em `PROCESSOS` (`scripts/processos.test.js`).
2. README: seção explicando `rolloutStartedAt`, os planos de NÃO PROD e o `nonprod-scheduler.yml`.
3. Skill `feature-flag`: mesma explicação resumida.
4. `npm test` (inclui `processos.test.js` e `skills.test.js`).

## Verificação

- `npm test`, `npm run validate`, `npm run specs`.
- `node scripts/deploy.js nonprod --dry-run --now <ISO>` em cada estágio de uma FF `critica`/`media` de teste,
  conferindo o `percent(...)` esperado.
- Manual (opcional, sem publicar): `npm run flags`, criar uma FF `critica`, ver a explicação e a confirmação.

## Riscos e reversão

- **Job publica sem aprovação humana a cada execução:** aceito conscientemente (decisão do usuário) porque o
  rollout já foi aprovado no PR que criou/ligou a FF; o job só publica a passagem do tempo, do mesmo jeito que
  qualquer reexecução de `deploy.js nonprod` já é idempotente e seguro hoje. Rollback continua sendo desligar a
  FF (ou reduzir `rolloutPercent`) numa `update/*` — o job, na próxima execução, publica o valor já reduzido.
- **Relógio do job vs. `rolloutStartedAt`:** como o cálculo é por tempo (sem estado), rodar o job mais ou menos
  vezes não muda o resultado esperado para um dado `now` — mesma garantia que já existe em PROD.
- **Reversão:** reverter o commit desta spec remove o workflow e volta `rolloutPercent` a ser sempre fixo (o
  campo `rolloutStartedAt`, se já tiver sido publicado nalgum `env/nonprod/*.json`, simplesmente passa a ser
  ignorado — não quebra nada, `validate` só precisa remover a checagem que o rejeita fora do lugar certo).

## Decisões

- **Mesmos percentuais do PROD, mas `critica` com 60 min por estágio** (não 30/60/120): o README nunca fixou
  tempo para os estágios de `critica` — só o exemplo em `rollout.test.js`, que é ilustrativo. O usuário confirmou
  60 min por estágio para NÃO PROD.
- **`rolloutStartedAt` por override, não um novo tipo de arquivo:** reaproveita a estrutura já existente de
  `env/nonprod/<key>.json`, sem criar uma pasta paralela a `rm/` só para NÃO PROD.
- **Sem estado além do timestamp:** o percentual nunca é "gravado" pelo job — é sempre recalculado a partir de
  `rolloutStartedAt` + a hora atual, igual ao PROD. Isso evita qualquer corrida entre o job e um `update/*` manual
  chegando ao mesmo tempo.
- **Job sem `environment: nonprod`:** decisão explícita do usuário; é a única exceção no repositório a "todo
  deploy de NÃO PROD pede aprovação" — documentada no README para não parecer descuido.
