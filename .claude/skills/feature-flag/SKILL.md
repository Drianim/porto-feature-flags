---
name: feature-flag
description: Cria, altera e prepara o deploy de Feature Flags neste repositório (Firebase Remote Config) — flag, arquivo de RM, validação, rollout progressivo e PR. Use quando o usuário pedir para criar/alterar/ligar/desligar uma flag, preparar RM, simular deploy ou explicar o fluxo de FF.
---

# Feature Flags — fluxo do repositório

Fonte única de verdade das flags. Nada é editado no console do Firebase; tudo passa por PR e pela pipeline.

## Estrutura

- `flags/<key>.json` — definição (team, criticality, descrição, **platforms** `android|ios|ambas` e **minVersion** `x.y.z`, ambos obrigatórios; o tipo Boolean/String é derivado dos valores; valores em `env/nonprod/` e `env/prod/`)
- `rm/RM-*.json` — arquivo de RM (obrigatório para PROD)
- `config/environments.json` — variáveis por ambiente e regras (PROD é time-gated e exige `team` + `platform`)
- `scripts/` — `new-flag.js`, `new-rm.js`, `validate.js`, `deploy.js`
- `bitbucket-pipelines.yml` — validação em PR, `develop` só valida; NÃO PROD em feature/update/remove→main, PROD em release→main

## Qual branch usar

- **FF nova** → `feature/*`. O nome nunca pode existir em `main` nem no Firebase NÃO PROD (o PR consulta o Firebase e bloqueia).
- **Alterar FF que já existe** → `update/*` (uma `feature/*` que mexe em FF existente é bloqueada). Ambas só mexem em `flags/` e `env/nonprod/`.
- **Remover FF** → `remove/*` (só apaga `flags/`, `env/nonprod/`, `env/prod/`, `rm/`). No merge, o Run apaga a chave do Remote Config NÃO PROD (`scripts/remove-flags.js`). Nunca apague FF em `feature/*` ou `update/*`.
- **PROD** → `release/*`. Antes de abrir o PR: `node scripts/check-new-flags.js <branch> origin/main`.

## Criar uma flag nova

1. `node scripts/new-flag.js <ft_ou_rc_chave> --team <equipe> --criticality <baixa|media|alta|critica> --description "..." --platforms <android|ios|ambas> --min-version <x.y.z>`
   (a key começa com `ft_` para toggle ou `rc_` para valor de configuração — este exige `--value`; use `--group "Nome"` para agrupar; o arquivo se chama `<key>.json`)
2. Ligue nos ambientes não produtivos com override por plataforma, ex.: em `env/nonprod/<key>.json`: `{"nonprod": {"default": "false", "ios": {"value": "true"}, "android": {"value": "true"}}}` (ou `default: "true"` para todas). `rolloutPercent` opcional limita o percentual.
3. `npm run catalog && npm run validate` (o catálogo `catalog/keys.json` é gerado e conferido na pipeline)
4. Simule: `node scripts/deploy.js nonprod --dry-run`
5. `main` deve ficar idêntico ao Firebase NÃO PROD: `node scripts/verify-sync.js nonprod` confere; `--fix` publica se divergir. Se um deploy falhar, a pipeline `sync-nonprod` retenta.

## Levar para PROD (branch `release/*`, separada da feature)

Os ambientes são só **NÃO PROD** e **PROD**. `feature/*` mexe apenas em `flags/` e `env/nonprod/`; PROD só muda numa `release/*` (arquivos `env/prod/<key>.json` e `rm/`). O CI reprova a mistura.

1. Pergunte ao usuário a **data/hora de PROD** (ISO 8601 com fuso, ex. `2026-10-01T14:00:00-03:00`); nunca invente.
2. `node scripts/new-rm.js --flags <a,b> --squad <squad> --schedule <ISO>` — o plano de rollout padrão vem da criticidade (baixa: 100%; media: 25→100; alta/critica: 5→25→50→100).
3. Crie `env/prod/<key>.json`: `{"prod": {"default": "false", "ios": {"value": "true"}, "android": {"value": "true"}}}` (`rolloutPercent` é teto). Toggles que liberam algo e todas as `rc_*` exigem RM em PROD.
4. **Aprovações**: `approvals.team` e `approvals.platform` devem ser preenchidas (nome + data) por **pessoas diferentes**. Nunca preencha em nome de alguém: peça ao usuário os nomes e datas reais.
5. `npm run validate:prod` e `node scripts/deploy.js prod --dry-run --now <ISO>` para conferir o estágio em um horário específico.
6. PR `release/*` → `main` (2 aprovações, uma da plataforma).

## Antes de abrir o PR

Rode `npm run preflight` (mesmas checagens da pipeline do PR) e, se passar, `npm run pr` (empurra e imprime o link de um clique). Só faça push se o usuário pedir.

## Regras a respeitar

- Não use `git push` nem abra PR sem o usuário pedir.
- Alta/crítica exigem `rolloutPlan` com mais de um estágio.
- Rollback = voltar o `default` para `"false"` e remover os overrides (ou reduzir `rolloutPercent`) via PR; a pipeline republica.
- Não grave credenciais no repo. Deploy usa `FIREBASE_PROJECT_<ENV>` e `FIREBASE_SA_KEY_<ENV>` (JSON do service account em base64) como variáveis de deployment do Bitbucket.
- O rollout é liberado por tempo, não por saúde; monitore métricas entre os estágios e faça rollback se necessário.

## chore/*
Branch `chore/*` é para ajuste em script, pipeline ou documentação (não em FF). O PR de `chore/*` **não roda pipeline** e o merge não publica nada no Firebase. **Só admin (`admins` em `config/approvers.json`) pode mesclar `chore/*`**: a reconferência da main confere quem fez o merge e, se não for admin, reprova e prepara a reversão. Para FF, use sempre feature/, update/, remove/ ou release/.

## Plataforma e versão mínima (obrigatórias em toda FF)
- Pergunte sempre, antes de criar a FF: **para quais plataformas** (Android, iOS ou ambas) e **qual a versão mínima do app** que já tem o código. Sem isso o `validate` reprova.
- Abaixo da `minVersion` (ou fora das plataformas) a FF nunca ativa: toggle = `false`, `rc_*` não é enviado. Versões diferentes por plataforma: `"minVersion": { "android": "2.58.3", "ios": "2.61.0" }`.
- Mudar plataforma ou versão mínima de FF existente é `update/*`.

## Mudança em script, pipeline ou documentação
Não é FF: use a skill `sdd-scripts` (spec em `docs/specs/` aprovada antes do código, branch `chore/*`).

## Só consultar o status
Para ver o que está ligado, em qual plataforma/versão/porcentagem ou se o Firebase confere com a `main`, use a skill `ff-status` (somente leitura): `npm run status -- list`.

## Equipe e permissão
- Toda FF tem `team` (equipe dona, de `config/teams.json`): **pergunte a equipe** ao criar; nunca invente. Ela vai como prefixo da descrição no Firebase (`[equipe] texto`).
- **Uma equipe só altera as FFs dela.** Só a equipe de **plataforma** mexe em FF de outra equipe e transfere FF entre equipes (mudar `team`). O `check-ownership` confere pelos e-mails dos commits; se um PR for reprovado por isso, peça à equipe dona ou à plataforma.
- Equipes e membros mudam só em `config/teams.json`, por uma `chore/*` (só admin mescla).
