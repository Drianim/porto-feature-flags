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
| `scripts/remove-flags.js` | Apaga FFs removidas do repositório no Remote Config NÃO PROD (`--base`, `--keys`, `--dry-run`) |
| `scripts/test-platforms.js` | Teste real do filtro Android/iOS: registra 2 apps temporários, pede ao Firebase para avaliar o Remote Config como cada plataforma e compara com o repositório (`--keys`, `--samples`) |
| `scripts/preflight.js` | Valida antes de abrir o PR (`npm run preflight`, `npm run pr`, hook `pre-push`) |
| `scripts/ci/revert-merge.sh` | Prepara a reversão do merge que violou as regras (branch `revert/*` + link de um clique) |
| `scripts/verify-sync.js` | Compara `main` com o Remote Config real (`--fix` publica se houver divergência, `--strict` também reprova chaves fora do repo) |
| `scripts/deploy.js` | Publica no Remote Config (`--dry-run`, `--now <ISO>` para simular) |
| `scripts/lib/` | Código compartilhado e testes do rollout (`npm test`) |
| `.claude/skills/feature-flag/` | Skill do Claude Code para operar este repo |
| `bitbucket-pipelines.yml` | Pipeline |

## Modelo de chave (igual ao Remote Config do SuperApp)

- `ft_*` = feature toggle (valores `"true"`/`"false"`); `rc_*` = valor de configuração (texto, URL etc.). O **tipo no Remote Config vem dos valores**: se todos os valores da FF (padrão e overrides, em todos os ambientes) forem `true`/`false`, ela é publicada como **Boolean**; qualquer outro valor (URL, texto) a torna **String**. Vale para `ft_` e `rc_`; o campo `valueType` do arquivo é ignorado.
- Por ambiente: `default` + override opcional por plataforma (`ios`, `android`), cada um com `value` e `rolloutPercent` (teto opcional).
- `group` opcional coloca o parâmetro num grupo do console (ex.: "Vitrine Hub").
- No Firebase viram condições `device.os == 'ios'` / `'android'` (com `&& percent('<chave-da-FF>') <= N` durante o rollout). A semente com o nome da FF faz cada FF sortear o seu próprio grupo de usuários, e quem entra em 5% continua dentro quando o rollout sobe.
- Em PROD, toggles que liberam algo e todas as `rc_*` exigem RM e sobem só depois do `prodSchedule`. Desligar um toggle (rollback) nunca é bloqueado.

## Escopo da PoC: só NÃO PROD

Por enquanto usamos apenas o ambiente **NÃO PROD**, no projeto Firebase de teste (`cursoapp-ac8e4`). O ID do projeto já está em `config/environments.json` (`projectId`); basta **uma** variável secured de **repositório**, `FIREBASE_SA_KEY_NONPROD` (JSON do service account em base64): ela vale para PR, `main` e pipelines agendadas. Não é preciso criar nada no Deployment `Test`. `FIREBASE_PROJECT_NONPROD` é opcional e sobrescreve o padrão. **Nunca** versione a chave. Os steps de PROD (validação, gate de aprovação, deploy) ficam definidos mas só executam em merge de `release/*`, que não é usado na PoC. Variáveis de PROD, `BB_ACCESS_TOKEN` e `config/approvers.json` só serão necessários quando PROD entrar.

## Garantia: main = Firebase NÃO PROD

- Depois de cada deploy (no mesmo step de aprovação, pois o Bitbucket só aceita cada ambiente de deployment uma vez por pipeline), a verificação compara `main` com o Remote Config real (valor padrão, condições iOS/Android, tipo, descrição, grupo e chaves ausentes).
- Se o deploy falhar, `main` e Firebase divergem. A pipeline separada **`sync-nonprod`** (agendada, ex.: a cada 30 min, e/ou manual, sempre em `main`) publica o que está em `main` quando houver divergência e confere de novo. Sem divergência não muda nada.
- **`verify-nonprod`** é só leitura (`--strict`): falha se houver divergência ou chave no Firebase que não está no repo. Use como alarme agendado.
- Local: `FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/verify-sync.js nonprod`.
- Limite: o verificador confere as chaves do repositório e reporta chaves extras; não apaga nada que só exista no Firebase.

## Proteção extra na pipeline de main

O Bitbucket só bloqueia o merge de PR com pipeline vermelha se você configurar *Merge checks* (recomendado: exigir build com sucesso). Mesmo sem isso, o step **Reconferir regras do merge** (`scripts/ci/recheck-merge.sh`) roda logo no início da pipeline de `main`: lê a origem do merge e o 1º pai do commit de merge e reaplica o escopo de pastas (`check-scope`) e a regra FF nova x existente (`check-new-flags --skip-remote`). Se um PR fora das regras for mergeado, a pipeline falha ali e o step de deploy nem chega a ser oferecido.

Limites: o conteúdo que já entrou em `main` continua lá e a pipeline agendada `sync-nonprod` publica o que estiver em `main`. Para desfazer, reverta o commit de merge. A consulta ao Firebase não se repete aqui (foi feita no PR; depois do deploy o nome já existiria e daria falso bloqueio).

## Validar antes de abrir o PR (preflight)

A mesma validação da pipeline do PR roda no seu computador, antes de o PR existir:

- `npm run preflight`: confere formato das FFs, catálogo, escopo da branch, nome único (FF nova x update x remove) e, em `release/*`, as regras de PROD.
- `npm run pr`: roda o preflight e, se passar, empurra a branch e imprime o **link de um clique** para abrir o PR.
- `npm run hooks` (uma vez): ativa o hook de `pre-push`, que roda o preflight ao empurrar `feature/`, `update/`, `remove/` ou `release/` e bloqueia o push se falhar (`git push --no-verify` ignora, por sua conta).
- A consulta ao Firebase (nome que já existe lá) usa `FIREBASE_SA_KEY_NONPROD`; sem ela é pulada e a pipeline do PR confere.

O Bitbucket do plano atual não impede abrir nem mergear um PR vermelho, por isso a validação mais cedo possível é esta.

## Reversão automática do merge que violou as regras

Se o step **Reconferir regras do merge** falhar na `main` (alguém mergeou um PR vermelho), o `after-script` roda `scripts/ci/revert-merge.sh`: cria a branch `revert/pr-<n>-<origem>` com `git revert -m 1` do commit de merge, empurra por SSH e imprime no log o **link de um clique** para abrir o PR de reversão. Nunca faz merge sozinho, nunca falha o step e não duplica em reexecução. Como `revert/*` não publica nada, o merge da reversão devolve a `main` ao estado que o Firebase já tem (o deploy do merge ruim nunca foi oferecido).

Configuração única da chave SSH:
1. *Repository settings → Pipelines → SSH keys → Generate keys* (copie a chave pública).
2. *Repository settings → Security → Access keys → Add key*, cole a chave pública com permissão de escrita.

Sem a chave, o script imprime os comandos da reversão manual. Limites: o clone do Pipelines é raso (serve para merge recente) e, se algo mais tiver mexido nos mesmos arquivos depois, o PR de reversão pode ter conflito.

## Aprovação dentro da pipeline

Todo step que publica no Firebase é `trigger: manual`: a pipeline **pausa** e só segue quando uma pessoa clica em **Run** no Bitbucket. Sem o clique, nada é publicado.

- Cada step só aparece quando o merge alterou a pasta certa (`condition: changesets`): `flags/` e `env/nonprod/` mostram o step de NÃO PROD; `env/prod/` e `rm/` mostram os de PROD.
- Para restringir **quem** pode clicar: *Repository settings → Deployments →* ambiente *→ Deployment permissions* (pode exigir plano pago).
- A aprovação do PR (antes do merge) continua sendo configurada em *Branch restrictions* (mín. de aprovações).
- O `prod-scheduler` (avanço do rollout por horário) é automático de propósito: depende do RM já aprovado.

## Testar o filtro por plataforma (Android x iOS)

`FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/test-platforms.js nonprod --keys ft_x --samples 30`

O script registra um app Android e um iOS temporários (pacote `com.poc.rcteste`) no projeto, pede ao **próprio Firebase** o Remote Config como cada plataforma (endpoint de fetch dos apps) e compara com o que o repositório manda: chave só no iOS não pode chegar no Android e vice-versa; em FF com porcentagem, mede a fração de instâncias que recebe o valor. No fim remove os apps (mesmo se der erro). A FF precisa já estar publicada no Firebase. Sofre limite de requisições (429): o script espera e tenta de novo.

## Regra por tipo de branch

| Branch | Para quê | Pode alterar | Deploy ao mergear em `main` |
|---|---|---|---|
| `feature/*` | criar FF **nova** | `flags/`, `env/nonprod/`, scripts, config (**não** `env/prod/` nem `rm/`) | NÃO PROD |
| `update/*` | alterar FF que **já existe** | `flags/`, `env/nonprod/` (**não** `env/prod/` nem `rm/`) | NÃO PROD |
| `remove/*` | **apagar** FF (do repo e do Remote Config NÃO PROD) | só **apaga** arquivos em `flags/`, `env/nonprod/`, `env/prod/` e `rm/` | remove a FF do Firebase (depois do Run) |
| `release/*` | levar para PROD | somente `env/prod/`, `rm/` e `catalog/` | PROD (time-gated pelo RM) |

O CI reprova o PR que violar isso: `scripts/check-scope.js` (pastas) e `scripts/check-new-flags.js` (nome de FF). Outros prefixos (`chore/`...) não são restringidos e **não disparam deploy**.

### Remover uma FF

- Numa branch `remove/*`, apague `flags/<key>.json`, `env/nonprod/<key>.json` (e `env/prod/<key>.json`, `rm/` se houver), rode `npm run catalog` e abra o PR. O CI reprova qualquer criação/alteração numa `remove/*` e reprova apagar FF em `feature/*` ou `update/*`.
- No merge, o step de deploy pausa; ao clicar em **Run**, `scripts/remove-flags.js nonprod --base HEAD^1` apaga do Remote Config (parâmetro, grupo que ficar vazio e condições `_ios/_android`) só as FFs cujo `flags/<key>.json` foi apagado naquele merge, e depois o `verify-sync` confere.
- Segurança: o script recusa chave que ainda existe em `flags/`, nunca apaga chave "de fora" do repositório e ainda não suporta PROD.
- Local: `FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/remove-flags.js nonprod --keys ft_x --dry-run` (a FF já não pode existir em `flags/`).

### Nome de FF nunca se repete

- `feature/*` só pode **criar** FF nova. O nome não pode existir em `main` (ignorando maiúsculas) nem no **Remote Config NÃO PROD**: o PR consulta o Firebase de verdade.
- Se a FF já existe (no repo ou no Firebase) e você precisa alterá-la, o PR de `feature/*` é bloqueado com a mensagem *"essa FF já existe… use uma branch update/*"*. Abra a mudança numa `update/*`.
- O contrário também vale: `update/*` não pode criar FF nova (deve ser `feature/*`).
- Para o PR consultar o Firebase, `FIREBASE_SA_KEY_NONPROD` precisa ser variável de **repositório** (secured), porque PR pipelines não recebem variáveis de Deployment (a mesma variável já serve para os deploys). Sem credencial, o step falha (não libera o nome às cegas).
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
- **Variável de repositório** (*Repository settings → Pipelines → Repository variables*, marque **Secured**): `FIREBASE_SA_KEY_NONPROD` = JSON do service account em base64 (`base64 -i key.json | pbcopy`), papel *Firebase Remote Config Admin*. Uma só variável cobre PR, `main` e as pipelines custom. O ID do projeto NÃO PROD já vem do `config/environments.json`.
- **Quando PROD entrar**: crie `FIREBASE_SA_KEY_PROD` e `FIREBASE_PROJECT_PROD` **no Deployment `Production`** (assim a credencial de PROD só existe nos steps de PROD). Uma variável de Deployment com o mesmo nome sobrescreve a de repositório.
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
