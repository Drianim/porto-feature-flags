---
name: feature-flag
description: Cria, altera e prepara o deploy de Feature Flags neste repositório (Firebase Remote Config) — flag, arquivo de RM, validação, rollout progressivo e PR. Use quando o usuário pedir para criar/alterar/ligar/desligar uma flag, preparar RM, simular deploy ou explicar o fluxo de FF.
---

# Feature Flags — fluxo do repositório

Fonte única de verdade das flags. Nada é editado no console do Firebase; tudo passa por PR e pela pipeline.

## Estrutura

- `flags/<key>.json` — definição (owner, criticality, valueType, valor por ambiente `dev|hml|prod`)
- `rm/RM-*.json` — arquivo de RM (obrigatório para PROD)
- `config/environments.json` — variáveis por ambiente e regras (PROD é time-gated e exige `team` + `platform`)
- `scripts/` — `new-flag.js`, `new-rm.js`, `validate.js`, `deploy.js`
- `bitbucket-pipelines.yml` — validação em PR, deploy DEV/HML em `develop`, PROD em `main`

## Criar uma flag nova

1. `node scripts/new-flag.js <key_snake_case> --owner <squad> --criticality <baixa|media|alta|critica> --description "..."`
   (a key é snake_case e o arquivo se chama `<key>.json`)
2. Ligue nos ambientes não produtivos editando `environments.dev.enabled` / `hml.enabled`.
3. `npm run validate`
4. Simule: `node scripts/deploy.js dev --dry-run`

## Levar para PROD

1. Pergunte ao usuário a **data/hora de PROD** (ISO 8601 com fuso, ex. `2026-10-01T14:00:00-03:00`); nunca invente.
2. `node scripts/new-rm.js --flags <a,b> --squad <squad> --schedule <ISO>` — o plano de rollout padrão vem da criticidade (baixa: 100%; media: 25→100; alta/critica: 5→25→50→100).
3. Em `flags/<key>.json` ponha `environments.prod.enabled: true` (`rolloutPercent` opcional funciona como teto).
4. **Aprovações**: `approvals.team` e `approvals.platform` devem ser preenchidas (nome + data) por **pessoas diferentes**. Nunca preencha em nome de alguém: peça ao usuário os nomes e datas reais.
5. `npm run validate:prod` e `node scripts/deploy.js prod --dry-run --now <ISO>` para conferir o estágio em um horário específico.
6. PR `develop` → `main` (2 aprovações, uma da plataforma).

## Regras a respeitar

- Não use `git push` nem abra PR sem o usuário pedir.
- Alta/crítica exigem `rolloutPlan` com mais de um estágio.
- Rollback = `enabled: false` (ou reduzir `rolloutPercent`) via PR; a pipeline republica.
- Não grave credenciais no repo. Deploy usa `FIREBASE_PROJECT_<ENV>` e `FIREBASE_SA_KEY_<ENV>` (JSON do service account em base64) como variáveis de deployment do Bitbucket.
- O rollout é liberado por tempo, não por saúde; monitore métricas entre os estágios e faça rollback se necessário.
