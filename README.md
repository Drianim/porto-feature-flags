# feature-flags

Fonte única de verdade das Feature Flags (Firebase Remote Config), com validação, aprovação e deploy por pipeline.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `flags/<key>.json` | Definição da flag: dono, criticidade, tipo e valor por ambiente (`dev`, `hml`, `prod`) |
| `rm/RM-*.json` | Arquivo de RM: flags, ambientes, rollback, data/hora de PROD, plano de rollout, aprovações |
| `config/environments.json` | Variáveis por ambiente e regras (PROD é time-gated, exige equipe + plataforma) |
| `scripts/new-flag.js`, `new-rm.js` | Geram flag e RM |
| `scripts/validate.js` | Valida flags e RM (`--prod` aplica as regras de PROD) |
| `scripts/check-approvals.js` | Gate de PROD: confere no Bitbucket o PR mergeado (1 aprovação da plataforma + 1 da equipe, nenhuma do autor) |
| `config/approvers.json` | `account_id` das pessoas da plataforma (preencher) |
| `scripts/deploy.js` | Publica no Remote Config (`--dry-run`, `--now <ISO>` para simular) |
| `scripts/lib/` | Código compartilhado e testes do rollout (`npm test`) |
| `.claude/skills/feature-flag/` | Skill do Claude Code para operar este repo |
| `bitbucket-pipelines.yml` | Pipeline |

## Fluxo

1. Branch a partir de `develop`. Crie a flag: `npm run new:flag -- minha_flag --owner squad-x --criticality media`.
2. PR: a pipeline roda testes e `validate`. Precisa de **1 aprovação da equipe**.
3. Merge em `develop` → **DEV e HML sobem na hora**.
4. Para PROD: `npm run new:rm -- --flags minha_flag --squad squad-x --schedule 2026-10-01T14:00:00-03:00` e ligue `environments.prod.enabled`. Preencha `approvals.team` e `approvals.platform` (pessoas diferentes).
5. PR `develop` → `main` exige **2 aprovações, uma da plataforma**. A pipeline roda `validate:prod`.
6. O deploy de PROD é **time-gated**: antes de `prodSchedule` nada muda; depois segue o `rolloutPlan` (ex.: 5% → 25% → 50% → 100%). O estágio é calculado pelo horário, sem estado, então rodar a pipeline várias vezes é seguro.
7. Rollback: PR com `enabled: false` (ou menor `rolloutPercent`); a pipeline republica.

Simular sem publicar: `node scripts/deploy.js prod --dry-run --now 2026-10-01T18:00:00Z`.

## Criticidade

| Nível | Exigência |
|---|---|
| baixa | Aprovação padrão |
| media | Aprovação padrão + teste em não produtivo |
| alta | Rollout progressivo obrigatório (mais de um estágio) |
| critica | Rollout progressivo + monitoramento intensivo |

## Configuração no Bitbucket (uma vez)

- **Branch restrictions**: `develop` (1 aprovação, sem push direto); `main` (2 aprovações, só via PR, plataforma como reviewer padrão).
- **Variáveis por Deployment** (secured), para `dev`, `staging` (HML) e `production`:
  - `FIREBASE_PROJECT_DEV` / `FIREBASE_PROJECT_HML` / `FIREBASE_PROJECT_PROD`: ID do projeto Firebase
  - `FIREBASE_SA_KEY_DEV` / `_HML` / `_PROD`: JSON do service account em base64 (`base64 -i key.json | pbcopy`), papel *Firebase Remote Config Admin*
- **Repository variable** `BB_ACCESS_TOKEN` (secured): repository access token com escopo `pullrequest:read`, usado pelo gate de aprovação.
- **`config/approvers.json`**: preencha `platform` com os `account_id` do time de plataforma.
- **Deployment `production`**: restrinja quem pode fazer deploy (plataforma/admins).
- **Schedules**: agende a pipeline `prod-scheduler` em `main` (ex.: a cada 15 min). Ela avança os estágios do rollout no horário certo.

## Limitações

- O avanço entre estágios é por tempo; **não** consulta métricas de saúde. Monitore e faça rollback se necessário.
- Os dois aprovadores são registrados no RM e validados quanto à presença e a serem pessoas distintas; a aprovação real é a do PR no Bitbucket.
