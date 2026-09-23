# feature-flags

Fonte única de verdade das Feature Flags (Firebase Remote Config), com validação, aprovação e deploy por pipeline.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `flags/<key>.json` | Definição da flag: dono, criticidade, tipo e definição da flag (sem valores) |
| `env/nonprod/<key>.json` | Valor em **NÃO PROD** (`{"nonprod": {...}}`). Só `feature/*` altera |
| `env/prod/<key>.json` | Valor em **PROD** (`{"prod": {...}}`). Só `release/*` altera |
| `rm/RM-*.json` | Arquivo de RM: flags, ambientes, rollback, data/hora de PROD, plano de rollout, aprovações |
| `config/environments.json` | Variáveis por ambiente e regras (PROD é time-gated, exige equipe + plataforma) |
| `scripts/new-flag.js`, `new-rm.js` | Geram flag e RM |
| `scripts/validate.js` | Valida flags e RM (`--prod` aplica as regras de PROD) |
| `scripts/check-approvals.js` | Gate de PROD: confere no Bitbucket o PR mergeado (1 aprovação da plataforma + 1 da equipe, nenhuma do autor) |
| `config/approvers.json` | `account_id` das pessoas da plataforma (preencher) |
| `catalog/keys.json` | Catálogo gerado com todas as chaves do Remote Config e o estado por ambiente (`npm run catalog`; a pipeline falha se estiver desatualizado) |
| `scripts/check-new-flags.js` | Bloqueia nome de FF duplicado: feature/* só cria FF nova (consulta o Firebase), update/* só altera existente |
| `scripts/verify-sync.js` | Compara `main` com o Remote Config real (`--fix` publica se houver divergência, `--strict` também reprova chaves fora do repo) |
| `scripts/deploy.js` | Publica no Remote Config (`--dry-run`, `--now <ISO>` para simular) |
| `scripts/lib/` | Código compartilhado e testes do rollout (`npm test`) |
| `.claude/skills/feature-flag/` | Skill do Claude Code para operar este repo |
| `bitbucket-pipelines.yml` | Pipeline |

## Modelo de chave (igual ao Remote Config do SuperApp)

- `ft_*` = feature toggle (valores `"true"`/`"false"`); `rc_*` = valor de configuração (texto, URL etc.). Tudo é `STRING`.
- Por ambiente: `default` + override opcional por plataforma (`ios`, `android`), cada um com `value` e `rolloutPercent` (teto opcional).
- `group` opcional coloca o parâmetro num grupo do console (ex.: "Vitrine Hub").
- No Firebase viram condições `device.os == 'ios'` / `'android'` (com `&& percent <= N` durante o rollout).
- Em PROD, toggles que liberam algo e todas as `rc_*` exigem RM e sobem só depois do `prodSchedule`. Desligar um toggle (rollback) nunca é bloqueado.

## Escopo da PoC: só NÃO PROD

Por enquanto usamos apenas o ambiente **NÃO PROD**, no projeto Firebase de teste (`cursoapp-ac8e4`). O ID do projeto já está em `config/environments.json` (`projectId`); no Deployment `test` basta a variável secured `FIREBASE_SA_KEY_NONPROD` (JSON do service account em base64). `FIREBASE_PROJECT_NONPROD` é opcional e sobrescreve o padrão. **Nunca** versione a chave. Os steps de PROD (validação, gate de aprovação, deploy) ficam definidos mas só executam em merge de `release/*`, que não é usado na PoC. Variáveis de PROD, `BB_ACCESS_TOKEN` e `config/approvers.json` só serão necessários quando PROD entrar.

## Garantia: main = Firebase NÃO PROD

- Depois de cada deploy (no mesmo step de aprovação, pois o Bitbucket só aceita cada ambiente de deployment uma vez por pipeline), a verificação compara `main` com o Remote Config real (valor padrão, condições iOS/Android, tipo, descrição, grupo e chaves ausentes).
- Se o deploy falhar, `main` e Firebase divergem. A pipeline separada **`sync-nonprod`** (agendada, ex.: a cada 30 min, e/ou manual, sempre em `main`) publica o que está em `main` quando houver divergência e confere de novo. Sem divergência não muda nada.
- **`verify-nonprod`** é só leitura (`--strict`): falha se houver divergência ou chave no Firebase que não está no repo. Use como alarme agendado.
- Local: `FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/verify-sync.js nonprod`.
- Limite: o verificador confere as chaves do repositório e reporta chaves extras; não apaga nada que só exista no Firebase.

## Aprovação dentro da pipeline

Todo step que publica no Firebase é `trigger: manual`: a pipeline **pausa** e só segue quando uma pessoa clica em **Run** no Bitbucket. Sem o clique, nada é publicado.

- Cada step só aparece quando o merge alterou a pasta certa (`condition: changesets`): `flags/` e `env/nonprod/` mostram o step de NÃO PROD; `env/prod/` e `rm/` mostram os de PROD.
- Para restringir **quem** pode clicar: *Repository settings → Deployments →* ambiente *→ Deployment permissions* (pode exigir plano pago).
- A aprovação do PR (antes do merge) continua sendo configurada em *Branch restrictions* (mín. de aprovações).
- O `prod-scheduler` (avanço do rollout por horário) é automático de propósito: depende do RM já aprovado.

## Regra por tipo de branch

| Branch | Para quê | Pode alterar | Deploy ao mergear em `main` |
|---|---|---|---|
| `feature/*` | criar FF **nova** | `flags/`, `env/nonprod/`, scripts, config (**não** `env/prod/` nem `rm/`) | NÃO PROD |
| `update/*` | alterar FF que **já existe** | `flags/`, `env/nonprod/` (**não** `env/prod/` nem `rm/`) | NÃO PROD |
| `release/*` | levar para PROD | somente `env/prod/`, `rm/` e `catalog/` | PROD (time-gated pelo RM) |

O CI reprova o PR que violar isso: `scripts/check-scope.js` (pastas) e `scripts/check-new-flags.js` (nome de FF). Outros prefixos (`chore/`...) não são restringidos e **não disparam deploy**.

### Nome de FF nunca se repete

- `feature/*` só pode **criar** FF nova. O nome não pode existir em `main` (ignorando maiúsculas) nem no **Remote Config NÃO PROD**: o PR consulta o Firebase de verdade.
- Se a FF já existe (no repo ou no Firebase) e você precisa alterá-la, o PR de `feature/*` é bloqueado com a mensagem *"essa FF já existe… use uma branch update/*"*. Abra a mudança numa `update/*`.
- O contrário também vale: `update/*` não pode criar FF nova (deve ser `feature/*`).
- Para o PR consultar o Firebase, `FIREBASE_SA_KEY_NONPROD` precisa ser variável de **repositório** (secured), porque PR pipelines não recebem variáveis de Deployment. Sem credencial, o step falha (não libera o nome às cegas).
- Localmente: `node scripts/check-new-flags.js feature/minha-flag origin/main` (`--skip-remote` pula a consulta ao Firebase).

## Fluxo

1. Branch a partir de `develop`. Crie a flag: `npm run new:flag -- ft_minha_flag --owner squad-x --criticality media --description "..."`.
2. PR: a pipeline roda testes e `validate`. Precisa de **1 aprovação da equipe**.
3. Rode `npm run catalog` e commite o resultado. Merge em `develop` **não publica** no Firebase (só valida): `main` é a única fonte do NÃO PROD.
4. Para PROD: `npm run new:rm -- --flags ft_minha_flag --squad squad-x --schedule 2026-10-01T14:00:00-03:00` e defina em `environments.prod` o override por plataforma (ex.: `"ios": {"value": "true"}`). Preencha `approvals.team` e `approvals.platform` (pessoas diferentes).
5. PR `develop` → `main` exige **2 aprovações, uma da plataforma**. A pipeline roda `validate:prod`.
6. O deploy de PROD é **time-gated**: antes de `prodSchedule` nada muda; depois segue o `rolloutPlan` (ex.: 5% → 25% → 50% → 100%). O estágio é calculado pelo horário, sem estado, então rodar a pipeline várias vezes é seguro.
7. Rollback: PR voltando o toggle para `"false"` (ou menor `rolloutPercent`); a pipeline republica.

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
- **Variáveis por Deployment** (secured), para `test` (NÃO PROD) e `production`:
  - `FIREBASE_PROJECT_NONPROD` / `FIREBASE_PROJECT_PROD`: ID do projeto Firebase
  - `FIREBASE_SA_KEY_NONPROD` / `_PROD`: JSON do service account em base64 (`base64 -i key.json | pbcopy`), papel *Firebase Remote Config Admin*
- **Repository variable** `BB_ACCESS_TOKEN` (secured): repository access token com escopo `pullrequest:read`, usado pelo gate de aprovação.
- **`config/approvers.json`**: preencha `platform` com os `account_id` do time de plataforma.
- **Deployment `production`**: restrinja quem pode fazer deploy (plataforma/admins).
- **Schedules**: agende `sync-nonprod` em `main` (ex.: a cada 30 min) para retentar deploys que falharam, e `prod-scheduler` em `main` (ex.: a cada 15 min). Ela avança os estágios do rollout no horário certo.

## Chaves e segredos

- O **catálogo de chaves** de flag é `catalog/keys.json` (gerado de `flags/`). Rode `npm run catalog` ao criar ou alterar uma flag.
- **Credenciais nunca entram no repo**: IDs de projeto e service accounts ficam nas variáveis secured do Bitbucket (`FIREBASE_PROJECT_*`, `FIREBASE_SA_KEY_*`). O `.gitignore` bloqueia `service-account*.json`.

## Limitações

- O avanço entre estágios é por tempo; **não** consulta métricas de saúde. Monitore e faça rollback se necessário.
- Os dois aprovadores são registrados no RM e validados quanto à presença e a serem pessoas distintas; a aprovação real é a do PR no Bitbucket.
