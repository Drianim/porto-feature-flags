---
name: feature-flag
description: Cria, altera e prepara o deploy de Feature Flags neste repositório (Firebase Remote Config) — flag, arquivo de RM, validação, rollout progressivo e PR. Use quando o usuário pedir para criar/alterar/ligar/desligar uma flag, preparar RM, simular deploy ou explicar o fluxo de FF.
---

# Feature Flags — fluxo do repositório

Fonte única de verdade das flags. Nada é editado no console do Firebase; tudo passa por PR e pela pipeline.

## Estrutura

- `flags/<key>.json` — definição (owner, criticality, valueType, definição; valores em `env/nonprod/` e `env/prod/`)
- `rm/RM-*.json` — arquivo de RM (obrigatório para PROD)
- `config/environments.json` — variáveis por ambiente e regras (PROD é time-gated e exige `team` + `platform`)
- `scripts/` — `new-flag.js`, `new-rm.js`, `validate.js`, `deploy.js`
- `bitbucket-pipelines.yml` — validação em PR, NÃO PROD em `develop` e em feature→main, PROD em release→main

## Qual branch usar

- **FF nova** → `feature/*`. O nome nunca pode existir em `main` nem no Firebase NÃO PROD (o PR consulta o Firebase e bloqueia).
- **Alterar FF que já existe** → `update/*` (uma `feature/*` que mexe em FF existente é bloqueada). Ambas só mexem em `flags/` e `env/nonprod/`.
- **Remover FF** → `remove/*` (só apaga `flags/`, `env/nonprod/`, `env/prod/`, `rm/`). No merge, o Run apaga a chave do Remote Config NÃO PROD (`scripts/remove-flags.js`). Nunca apague FF em `feature/*` ou `update/*`.
- **PROD** → `release/*`. Antes de abrir o PR: `node scripts/check-new-flags.js <branch> origin/main`.

## Criar uma flag nova

1. `node scripts/new-flag.js <ft_ou_rc_chave> --owner <squad> --criticality <baixa|media|alta|critica> --description "..."`
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
6. PR `develop` → `main` (2 aprovações, uma da plataforma).

## Regras a respeitar

- Não use `git push` nem abra PR sem o usuário pedir.
- Alta/crítica exigem `rolloutPlan` com mais de um estágio.
- Rollback = voltar o `default` para `"false"` e remover os overrides (ou reduzir `rolloutPercent`) via PR; a pipeline republica.
- Não grave credenciais no repo. Deploy usa `FIREBASE_PROJECT_<ENV>` e `FIREBASE_SA_KEY_<ENV>` (JSON do service account em base64) como variáveis de deployment do Bitbucket.
- O rollout é liberado por tempo, não por saúde; monitore métricas entre os estágios e faça rollback se necessário.
