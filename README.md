# porto-feature-flags

**Para quem é este README:** quem vai usar o repositório (subir uma FF) e quem vai **evoluir os scripts** (inclusive
trabalhando com um Claude Code). Comece por *Em uma tela* e vá ao que precisar. Para uma visão visual do processo,
veja o [deck de apresentação](docs/processo-de-deploy-de-feature-flags.html).

## Em uma tela

```
  dev ──► branch ──► preflight ──► PR ──► checagens do PR ──► "Tudo verde" ──► botão de merge liberado ──► merge na main
         (prefixo define                 (escopo, equipe, nome     (só então)
          o que pode mudar)               único, validação no Firebase)                                        │
                                                                                                               ▼
                                                                     reconferência do merge ──(falhou)──► revert/* + link
                                                                                │
                                                                                ▼
                                                                  aprovação no ambiente `nonprod`
                                                                                │
                                                                                ▼
                                                          deploy no Remote Config + verify-sync (main = Firebase)
```

| Quero… | Branch | Ambiente | Detalhe |
|---|---|---|---|
| criar uma FF **nova** | `feature/*` | NÃO PROD | Processo |
| alterar uma FF **existente** | `update/*` | NÃO PROD | idem |
| **apagar** uma FF | `remove/*` | NÃO PROD | idem |
| levar para **PROD** | `release/*` | PROD (por horário, em estágios) | PROD |
| mudar **script, pipeline, docs** | `chore/*` (com **spec**; só admin) | nenhum (não publica) | SDD |
| desfazer um merge | `revert/*` (só admin) | nenhum (a `main` volta) | Proteções |

### Mapa de pastas e arquivos

| Caminho | Conteúdo |
|---|---|
| `flags/<key>.json` | Definição da FF: **equipe**, criticidade, descrição, grupo, **plataformas** e **versão mínima** (sem valores) |
| `env/nonprod/<key>.json` | Valores em NÃO PROD: `{"nonprod": {default, ios, android}}` |
| `env/prod/<key>.json` | Valores em PROD: `{"prod": {...}}` |
| `rm/RM-*.json` | Arquivo de RM de PROD: flags, criticidade, rollback, data/hora, plano de rollout, aprovações |
| `catalog/keys.json` | Catálogo gerado de todas as chaves (`npm run catalog`); a pipeline falha se estiver desatualizado |
| `config/environments.json` | Projeto e variável de credencial por ambiente; PROD é *time-gated* |
| `config/teams.json` | Equipes válidas (`teams`), os e-mails dos **membros** de cada uma e a **equipe de plataforma** (`platform`) |
| `config/approvers.json` | `adminLogins` (logins do GitHub que abrem e mesclam `chore/*` e `revert/*`) e `platformLogins` (aprovadores de PROD) |
| `.github/workflows/` | Pipelines: `pr.yml`, `main.yml`, `sync-nonprod.yml`, `verify-nonprod.yml`, `plan-prod.yml`, `prod-scheduler.yml` |
| `.github/pull_request_template.md` | Descrição padrão do PR, com uma seção por tipo de branch |
| `docs/sdd/`, `docs/specs/` | Processo SDD dos scripts, template e as specs |
| `docs/templates/codigo-app/` | **Templates do código do app** (Kotlin e Swift) que lê a FF, por situação da FF |
| `.claude/skills/` | Skills do Claude Code: `feature-flag` (operar FFs), `ff-status` (consultar o status) e `sdd-scripts` (evoluir scripts) |
| `CLAUDE.md` | Resumo das regras e armadilhas para um Claude Code que abrir o repositório |
| `.githooks/pre-push` | Roda o preflight ao empurrar `feature/`, `update/`, `remove/`, `release/` (`npm run hooks` ativa) |

### Scripts

| Script | O que faz |
|---|---|
| `new-flag.js`, `new-rm.js` | Geram a definição/valores de uma FF e o RM de PROD |
| `validate.js` | Valida FFs, RMs e a configuração (`--prod` aplica as regras de PROD) |
| `catalog.js` | Gera/confere `catalog/keys.json` (`--check`) |
| `check-scope.js` | Cada tipo de branch só mexe nas suas pastas |
| `check-new-flags.js` | Nome único: `feature` cria, `update` altera, `remove` apaga; consulta o Firebase |
| `check-ownership.js` | **Permissão por equipe:** só a equipe dona da FF (ou a plataforma) a altera; transferir FF entre equipes é da plataforma |
| `check-approvals.js` | Gate de PROD: 1 aprovação de plataforma + 1 de equipe, nenhuma do autor (revisões do PR pela API do GitHub) |
| `check-merger.js` | Na `main`: só admin mescla `chore/*` e `revert/*` (quem mesclou vem da API do GitHub) |
| `check-specs.js` | Formato das specs de `docs/specs/` |
| `ff-status.js` | **Status das FFs, somente leitura:** lista, detalhe, rollout, resumo, sincronia, histórico e obsoletas (`npm run status -- list`); usa o Firebase se houver credencial |
| `preflight.js` | As checagens do PR, no seu computador (`npm run preflight`, `npm run pr`) |
| `deploy.js` | Publica no Remote Config (`--dry-run` só monta o plano; `--validate` valida o template no Firebase **sem publicar**; `--now <ISO>`) |
| `remove-flags.js` | Apaga do Remote Config as FFs removidas do repositório (só NÃO PROD) |
| `verify-sync.js` | Confere `main` = Firebase (`--fix` publica, `--strict` reprova chave extra) |
| `test-platforms.js` | Teste real Android x iOS e versão mínima, consultando o próprio Firebase |
| `ci/pr-kind.js` | PR: tipo da branch; em `chore/*` e `revert/*`, exige que o autor seja admin (admins lidos da `main`) |
| `ci/all-green.js` | PR: o job **"Tudo verde"**, que só passa quando todas as checagens passaram |
| `ci/check-revert.js` | PR de `revert/*`: só reverts de merge da `main` |
| `ci/merge-source.sh` | Descobre a branch de origem do merge pela mensagem do commit |
| `ci/recheck-merge.sh` | Reconfere as regras no commit de merge da `main` |
| `ci/revert-merge.sh` | Prepara a branch `revert/*` e o link para abrir o PR |
| `ci/run-if-source.sh` | Roda um comando só se a origem do merge for do tipo esperado |

## Modelo de uma FF

- **Chave:** `ft_*` = feature toggle (valores `"true"`/`"false"`); `rc_*` = valor de configuração (texto, URL…).
- **Tipo no Remote Config vem dos valores:** se todos os valores da FF (padrão e overrides, em todos os ambientes) forem
  `true`/`false`, é publicada como **Boolean**; qualquer outro valor a torna **String**. O campo `valueType` é ignorado.
- **Por ambiente:** `default` + override opcional por plataforma (`ios`, `android`), cada um com `value` e
  `rolloutPercent` (teto opcional).
- **Plataformas e versão mínima são obrigatórias em toda FF** (`flags/<key>.json`; o `validate` reprova sem elas):
  - `"platforms": "android" | "ios" | "ambas"`: para quais plataformas a FF existe. Bloco de plataforma fora da lista, em `env/`, é reprovado.
  - `"minVersion": "2.61.0"` (`x.y.z`, só números): versão do app que já tem o código. Se Android e iOS diferem:
    `"minVersion": { "android": "2.58.3", "ios": "2.61.0" }` (exatamente as plataformas da FF).
  - Abaixo da versão mínima, ou fora das plataformas, a FF **nunca ativa**: toggle recebe `false`; `rc_*` não é enviada (o app usa o padrão dele).
  - Mudar plataforma ou versão mínima de FF existente é `update/*`.
- **Equipe obrigatória:** `"team": "squad-poc"` em `flags/<key>.json`, sempre uma das equipes de `config/teams.json`. No Firebase a equipe vai como prefixo da descrição (`[squad-poc] texto...`), porque o Remote Config não tem rótulo por parâmetro: assim ela aparece no console, e o `verify-sync` acusa se divergir. `npm run status -- summary` conta as FFs por equipe.
- **Permissão por equipe:** uma equipe só cria, altera, remove ou leva a PROD as FFs **dela**. A **equipe de plataforma** (`platform` em `config/teams.json`) mexe em qualquer FF e é a única que **transfere** uma FF de uma equipe para outra (mudar o `team`). Detalhes em *Permissão por equipe*, abaixo.
- **Grupo** opcional agrupa parâmetros no console (`"group": "Vitrine Hub"`).
- **No Firebase** viram condições `device.os == 'ios' && app.version.>=(['<minVersion>'])` (idem `'android'`; o Firebase recusa a forma `app.version >= '...'`), com
  `&& percent('<chave>') <= N` durante o rollout. A semente com o nome da FF faz cada FF sortear seu próprio grupo, e
  quem entra em 5% continua dentro quando sobe para 25%. Nas `rc_*` o padrão do parâmetro é "usar o valor do app" e o
  valor padrão vira a condição `<chave>_<plataforma>_base`.
### Referência de campos: `flags/<key>.json`

| Campo | Obrigatório | Regra | Para que serve |
|---|---|---|---|
| `key` | sim | `ft_*` ou `rc_*` (letras, números, `_`); igual ao nome do arquivo | Nome único da FF; `ft_` = toggle, `rc_` = valor de configuração |
| `description` | sim | texto não vazio | Vai para o Firebase como `[equipe] descrição` |
| `team` | sim | uma equipe de `config/teams.json` | Dono da FF: só ela (ou `platform`) cria, altera, remove ou leva a PROD |
| `criticality` | sim | `baixa`\|`media`\|`critica` | Exigência de rollout no RM ao levar para PROD |
| `platforms` | sim | `"android"`\|`"ios"`\|`"ambas"` | Fora dessas plataformas a FF nunca ativa |
| `minVersion` | sim | `"x.y.z"` ou `{ "ios": "x.y.z", "android": "x.y.z" }` (exatamente as plataformas de `platforms`) | Abaixo dessa versão do app, a FF nunca ativa naquela plataforma |
| `group` | não | texto | Agrupa parâmetros no console do Firebase |
| `owner` | — | **não usar** | Nome antigo de `team`; `validate` reprova se aparecer |
| `valueType` | não | ignorado | O tipo (Boolean/String) vem dos valores, não é declarado; só gera aviso se presente |

### Referência de campos: `env/<ambiente>/<key>.json`

Arquivo `{ "<nonprod|prod>": { ... } }`, uma chave de topo igual ao ambiente da pasta.

| Campo | Obrigatório | Regra | Para que serve |
|---|---|---|---|
| `default` | sim em `nonprod`; em `prod` só depois de promovida | toggle: `"true"`/`"false"`; `rc_`: texto não vazio | Valor servido quando não há override de plataforma ativo |
| `ios` / `android` | não | objeto `{ value, rolloutPercent? }`; só se a plataforma estiver em `platforms` da FF | Override por plataforma |
| `ios.value` / `android.value` | sim, se o bloco existir | mesma regra de tipo do `default` | Valor servido nessa plataforma |
| `ios.rolloutPercent` / `android.rolloutPercent` | não | `0`–`100` | % dos usuários da plataforma que recebem `value`; o resto recebe `default`. Sem o campo = 100% |

- Exemplo (`flags/ft_plat_ios_50.json` + `env/nonprod/ft_plat_ios_50.json`):

```json
{ "key": "ft_plat_ios_50", "description": "...", "team": "squad-poc", "criticality": "baixa",
  "platforms": "ios", "minVersion": "2.61.0" }
{ "nonprod": { "default": "false", "ios": { "value": "true", "rolloutPercent": 50 } } }
```

## Processo: como uma FF chega ao Firebase

### Regra por tipo de branch

| Branch | Para quê | Pode alterar | Ao mergear em `main` |
|---|---|---|---|
| `feature/*` | criar FF **nova** | `flags/`, `env/nonprod/`, `catalog/` (não PROD) | NÃO PROD, depois da aprovação no ambiente |
| `update/*` | alterar FF que **já existe** | `flags/`, `env/nonprod/`, `catalog/` (não PROD) | NÃO PROD, depois da aprovação no ambiente |
| `remove/*` | **apagar** FF | só **apaga** arquivos de `flags/`, `env/*`, `rm/` (catálogo regenerado) | remove do Firebase, depois da aprovação |
| `release/*` | levar para PROD | somente `env/prod/`, `rm/`, `catalog/` | PROD por horário do RM, depois da aprovação |
| `chore/*` | script, pipeline, docs | não restrito | **não publica**; só admin abre e mescla |
| `revert/*` | desfazer um merge da `main` | só reverts de merge (`git revert -m 1`) | não publica; só admin abre e mescla |

O CI só **proíbe PROD** em `feature/*` e `update/*`; por convenção elas mexem só em FF, e qualquer mudança de script vai em `chore/*` com spec (SDD).

O CI reprova PR fora dessas regras (`check-scope`, `check-new-flags`). A origem do merge vem da mensagem do commit
(`Merge pull request #N from <dono>/<branch>`); merge sem origem identificável não publica nada. Branch com outro
prefixo (`hotfix/`, `bugfix/`, …) **reprova no PR** e não pode ser mesclada.

### Criar a branch

No GitHub (botão de branches, *View all branches → New branch*, ou `git checkout -b` no seu computador), a branch sai da
`main` e o nome é **o nome completo com o prefixo**: `feature/ft-checkout-novo`, `update/ft-checkout-50`,
`remove/ft-checkout`, `release/2026-10-checkout`, `chore/ajuste-deploy`. O prefixo decide o que a pipeline confere.

### Comandos de FF

`npm run flags` (ou `npm run flags:help`, sinônimo do mesmo comando) abre um menu interativo (1 - Criar FF nova,
2 - Alterar FF existente, 3 - Remover FF): a opção 1 pergunta os dados, cria a branch `feature/*`, roda `new:flag`
e, no final, pergunta se já pode enviar (`git push`) e dá o link do PR com a descrição já preenchida; as opções 2
e 3 avisam que ainda não estão implementadas (ficam para uma spec futura).

### Criar uma FF (`feature/*`)

1. `npm run new:flag -- ft_minha_flag --team squad-poc --criticality media --description "..." --platforms ambas --min-version 2.61.0`
   (`rc_*` exige também `--value`; `--group "Nome"` agrupa).
2. Edite `env/nonprod/ft_minha_flag.json` com os valores por plataforma e o `rolloutPercent`, se houver.
3. `npm run catalog && npm run validate`; simule com `node scripts/deploy.js nonprod --dry-run`.
4. `npm run preflight` (ou `npm run pr`, que empurra a branch e imprime o link para abrir o PR). Preencha o template do PR.
5. Espere o job **"Tudo verde"** do PR; só então o botão de merge é liberado. Mescle → a pipeline da `main` reconfere →
   o deploy **espera aprovação no ambiente `nonprod`** → aprovado, publica e roda o `verify-sync`.

### Alterar uma FF (`update/*`)

Edite `flags/` ou `env/nonprod/` da FF que já existe, `npm run catalog`, preflight, PR. `update/*` não cria FF nova e
`feature/*` não altera existente (o CI bloqueia com a mensagem de qual branch usar).

### Remover uma FF (`remove/*`)

Apague `flags/<key>.json`, `env/nonprod/<key>.json` (e `env/prod/`, `rm/` se houver), `npm run catalog`, PR. Depois do
merge e da aprovação, `scripts/remove-flags.js nonprod --base HEAD^1` apaga do Remote Config (parâmetro, grupo que ficar
vazio, condições próprias) só as FFs cujo `flags/<key>.json` foi apagado naquele merge. O script recusa chave que ainda
existe em `flags/` e nunca apaga chave "de fora" do repositório. Ainda não suporta PROD.

### Nome de FF nunca se repete

`feature/*` só cria FF nova: o nome não pode existir em `main` (ignorando maiúsculas) nem no Remote Config NÃO PROD (o PR
consulta o Firebase de verdade). Se existir, a mensagem manda usar `update/*`. `--skip-remote` pula a consulta local.

### Permissão por equipe

Quem pode mexer em qual FF é decidido por `config/teams.json`: `platform` (e-mails da equipe de plataforma) e, por equipe, `members` (e-mails).

| Mudança | Quem pode |
|---|---|
| criar, alterar, apagar ou levar a PROD uma FF (`flags/`, `env/`, `rm/`) | membros da **equipe dona** da FF (o `team` dela) ou a **plataforma** |
| criar FF nova | membros da equipe declarada no `team` da FF nova ou a plataforma |
| **transferir** a FF para outra equipe (mudar `team`) | só a **plataforma** |
| alterar `config/teams.json` (equipes e membros) | só numa `chore/*`, que só admin abre e mescla |

- **Como é conferido:** `scripts/check-ownership.js` compara a equipe de cada FF tocada (no ponto de partida do PR e no fim) com os **e-mails dos commits do PR**. Roda no `preflight`, no PR e na **reconferência da `main`**. Um RM vale para as FFs listadas nele.
- **Um PR não se autoriza:** equipes, membros e admins são lidos da `main`, nunca do próprio PR, e mudar `config/teams.json` numa branch de FF é reprovado.
- **Limite:** o e-mail do commit é configurado por quem commita: isto barra o erro e o descuido (a equipe errada mexendo na FF errada), não a má-fé. Quem tem mais de um e-mail lista todos. Equipe sem membros cadastrados só é alterada pela plataforma.

### Preflight e template de PR

- `npm run preflight`: formato, catálogo em dia, escopo da branch, permissão por equipe, nome único, template aceito pelo Firebase (com `FIREBASE_SA_KEY_NONPROD`) e, em `release/*`, regras de PROD.
- `npm run pr`: preflight e, se passar, empurra a branch e imprime o link que abre o PR no GitHub.
- `npm run hooks` (uma vez): o `pre-push` roda o preflight ao empurrar branches de FF (`git push --no-verify` ignora).
- `.github/pull_request_template.md` traz uma seção por tipo; apague as que não são do seu PR. O GitHub já preenche a
  descrição do PR com este arquivo ao abrir pelo link do `npm run pr` ou pelo botão "New pull request".
- Sem `FIREBASE_SA_KEY_NONPROD` a consulta de nome ao Firebase é pulada; a pipeline do PR faz essa checagem.

**O que preencher em cada campo do template, por tipo de branch:**

- **`feature/*`:** a(s) chave(s) nova(s) (`ft_...`/`rc_...`, igual a `flags/<chave>.json`); a **equipe dona** é uma
  das chaves de `config/teams.json` (só ela ou a `platform` poderão alterar essa FF depois); criticidade,
  plataformas e versão mínima do app são os mesmos campos de `flags/<chave>.json`; os valores por plataforma são o
  que vai em `env/nonprod/<chave>.json` (default e, se houver, override de iOS/Android com `rolloutPercent`).
- **`update/*`:** a chave que já existe; "o que mudou" e "valor antes → depois" descrevem a diferença real entre o
  `env/nonprod/<chave>.json` (ou `flags/<chave>.json`) antigo e o novo; não crie chave nenhuma aqui.
- **`remove/*`:** a chave a apagar e o motivo; os checkboxes confirmam que nada foi criado ou alterado, só apagado
  (`flags/`, `env/nonprod/`, `env/prod/` e `rm/` da FF).
- **`release/*`:** o **RM** é o `rm/RM-AAAAMMDD-nome-da-flag.json` criado com `npm run new:rm` (veja `rm/TEMPLATE.json`);
  data/hora e plano de rollout vêm de `rolloutPlan`/`prodSchedule` desse arquivo; aprovação de equipe e de
  plataforma são pessoas diferentes (`approvals.team`/`approvals.platform` no RM), nunca inventadas.
- **`chore/*`:** o campo **Spec** aponta para `docs/specs/NNNN-slug.md`, já aprovada antes do código; "o que muda no
  comportamento" resume o efeito da mudança de script, pipeline ou documentação (não é FF).

## Pipelines (GitHub Actions)

`.github/workflows/` (só orquestra):

| Workflow | Quando | O que faz |
|---|---|---|
| **`pr.yml`** | PR para a `main` | tipo da branch (e admin em `chore/*`/`revert/*`), testes e `validate`; em FF: escopo, permissão por equipe, nome único, prévia e **validação do template no próprio Firebase (sem publicar)**; em `revert/*`: só reverts. Tudo consolidado no job **"Tudo verde"** |
| **`main.yml`** | a cada merge na `main` | testes, `validate` e **reconferência do merge**; se falhar, prepara `revert/*`. Depois, deploy NÃO PROD (se o merge mexeu em `flags/` ou `env/nonprod/`) e os jobs de PROD (se mexeu em `env/prod/` ou `rm/`), cada um com **aprovação no ambiente** |
| **`sync-nonprod.yml`** | manual, na `main` | publica o que está na `main` se o Firebase divergir e confere de novo (aprovação no ambiente `nonprod`) |
| **`verify-nonprod.yml`** | manual e diário | só leitura, `--strict`: alarme de divergência |
| **`plan-prod.yml`** | manual | dry-run de PROD |
| **`prod-scheduler.yml`** | manual (agendado quando PROD existir) | avança os estágios do rollout de PROD pelo horário |

### Merge bloqueado até tudo verde

A proteção da `main` exige o job **"Tudo verde"** do `pr.yml`. Ele depende de todas as checagens e só passa se nenhuma
falhou (as que não se aplicam ao tipo da branch ficam "skipped" e contam como ok). Enquanto ele não passar, o botão de
merge fica bloqueado, **inclusive para admins** (a proteção não tem exceção). Isso substitui a conta-bot da spec 0009,
que existia porque o plano do Bitbucket não bloqueava o botão.

- O PR roda o código **do próprio PR**, sem acesso a segredos quando vem de um fork.
- `chore/*` e `revert/*`: o job "Tipo da branch" reprova se o autor do PR não está em `adminLogins` (lido da `main`).
- Merge só por **merge commit** (squash e rebase desligados): a reconferência e a reversão usam o commit de merge.

### Aprovação do deploy (ambiente `nonprod`)

O job que publica no Firebase fica ligado ao ambiente `nonprod` (e os de PROD ao `production`). O GitHub **pausa** o
job até um revisor do ambiente aprovar, em *Actions → execução → Review deployments*. Sem a aprovação, nada é
publicado. Cada job só aparece quando o merge alterou a pasta certa: `flags/` e `env/nonprod/` para NÃO PROD;
`env/prod/` e `rm/` para PROD.

### Garantia: `main` = Firebase NÃO PROD

Depois do deploy, no mesmo job, o `verify-sync` compara `main` com o Remote Config real (valor padrão, condições,
tipo, descrição, grupo e chaves ausentes). Se o deploy falhar, o workflow **`sync-nonprod`** publica o que está em
`main` e confere de novo. `verify-nonprod` (`--strict`) também falha por chave que só existe no Firebase. Local:
`FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/verify-sync.js nonprod`. O verificador não apaga o que só
existe no Firebase.

## Proteções

1. **Preflight** local (e hook de push) e **checagens do PR**: testes, escopo de pastas, equipe, nome único, validação no Firebase.
2. **Merge bloqueado até "Tudo verde"**: proteção da `main` sem exceção para admins. Antes, no Bitbucket, os PRs #37,
   #39 (vermelhos) e #47 (mesclado em 13 s, com 0 builds) entraram na `main` sem validação; é isso que a proteção impede.
3. **Reconferência na `main`** (`scripts/ci/recheck-merge.sh`): reaplica escopo, nome único e equipe ao commit de merge
   (e, para `chore/*` e `revert/*`, exige que quem mesclou seja admin). Se falhar, o deploy nem é oferecido.
4. **Reversão automática** (`scripts/ci/revert-merge.sh`, passo seguinte à reconferência quando ela falha): cria a branch
   `revert/pr-<n>-<origem>` com `git revert -m 1`, empurra com o `GITHUB_TOKEN` (o job tem `contents: write`) e imprime o
   link que abre o PR. Nunca mescla sozinho, nunca falha o passo, não duplica em reexecução.
5. **Aprovação no ambiente** e **verify-sync** depois de publicar.
6. **Teste real de plataforma/versão** (`test-platforms.js`): registra 2 apps temporários (`com.poc.rcteste`), pede ao
   próprio Firebase o Remote Config como Android/iOS em versão mínima, logo abaixo e alta, compara com o repositório e
   remove os apps (mesmo com erro). A FF precisa estar publicada; sofre limite de requisições (429) e espera/tenta de novo.
   `FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/test-platforms.js nonprod --keys ft_x --samples 30`

## PROD, RM e criticidade

PROD só muda em `release/*` (`env/prod/<key>.json` + `rm/RM-*.json`) e é **time-gated**: antes do `prodSchedule` nada
muda; depois segue o `rolloutPlan`. O estágio é calculado pelo horário (sem estado), então rodar a pipeline várias vezes é
seguro. Toggles que liberam algo e todas as `rc_*` exigem RM em PROD; desligar um toggle (rollback) nunca é bloqueado.

1. Pergunte a **data/hora de PROD** (ISO 8601 com fuso); nunca invente.
2. `npm run new:rm -- --flags ft_minha_flag --squad squad-x --schedule 2026-10-01T14:00:00-03:00`
3. Crie `env/prod/ft_minha_flag.json` (`{"prod": {"default": "false", "ios": {"value": "true"}, ...}}`).
4. Preencha `approvals.team` e `approvals.platform` (pessoas diferentes; nunca em nome de outra pessoa).
5. `npm run validate:prod` e `node scripts/deploy.js prod --dry-run --now <ISO>` para simular um horário.
6. PR `release/*` → `main`: o gate `check-approvals.js` confere nas revisões do PR 1 aprovação da plataforma
   (`platformLogins`) e 1 da equipe (nenhuma do autor); a aprovação no ambiente `production` publica no horário do RM.
   Rollback: PR com `default: "false"` ou menor `rolloutPercent`.

| Criticidade | Exigência |
|---|---|
| baixa | Aprovação padrão; plano padrão 100%; `prodSchedule` em qualquer horário |
| media | Aprovação padrão + teste em não produtivo; 25% (60 min) → 100%; `prodSchedule` só entre 22:00–06:00 (horário de Brasília) |
| critica | Rollout progressivo obrigatório (mais de um estágio) + monitoramento intensivo: 5 → 25 → 50 → 100; `prodSchedule` só entre 22:00–06:00 (horário de Brasília) |

O avanço entre estágios é por **tempo**, não consulta métricas de saúde: monitore e faça rollback se preciso.

### Referência de campos: `rm/RM-*.json`

Veja `rm/TEMPLATE.json` para um exemplo completo.

| Campo | Obrigatório | Regra | Para que serve |
|---|---|---|---|
| `id` | sim | livre; convenção `RM-AAAAMMDD-nome-da-flag` | Identifica o RM; vira o nome do arquivo |
| `flags` | sim | lista de chaves (`ft_*`/`rc_*`) | FFs cobertas por este RM em PROD |
| `targetEnvironments` | sim | `["prod"]` | Ambiente(s) que este RM autoriza |
| `criticality` | sim | `baixa`\|`media`\|`critica` | Deve bater com a maior criticidade das FFs listadas |
| `squad` | sim | texto | Equipe responsável pelo RM |
| `rollback` | sim | texto não vazio | Como desfazer se algo der errado |
| `prodSchedule` | sim | data/hora ISO 8601 com fuso; `media`/`critica` só entre 22:00–06:00 (horário de Brasília, `America/Sao_Paulo`); `baixa` sem restrição | Quando o rollout pode começar (nunca antes) |
| `rolloutPlan` | sim | lista `{ percent, monitorMinutes }`, `percent` crescente (1–100), último estágio `100`/`0`; `critica` exige mais de 1 estágio | Estágios do rollout em PROD, avançados por tempo |
| `approvals.team.name` / `.date` | sim | pessoa da equipe dona, diferente de `approvals.platform` | Aprovação da equipe |
| `approvals.platform.name` / `.date` | sim | pessoa da plataforma, diferente de `approvals.team` | Aprovação da plataforma |

## Configuração no GitHub (uma vez)

- **Secret do repositório** (*Settings → Secrets and variables → Actions → New repository secret*):
  `FIREBASE_SA_KEY_NONPROD` = JSON do service account em base64 (`base64 -i key.json | pbcopy`), papel *Firebase Remote
  Config Admin*. Cobre o PR (nome único e validação no Firebase), a `main` e os workflows manuais. O projeto NÃO PROD já
  vem de `config/environments.json`. PRs de fork não recebem secrets.
- **Ambientes** (*Settings → Environments*): `nonprod` e `production`, cada um com **Required reviewers** (quem aprova o
  deploy) e *Deployment branches* = só `main`.
- **Proteção da `main`** (*Settings → Branches → Add rule*, ou *Rules → Rulesets*):
  - *Require a pull request before merging* (aprovações: 0 na PoC, com uma pessoa só);
  - *Require status checks to pass* = **`Tudo verde`**, e *Require branches to be up to date*;
  - *Do not allow bypassing the above settings* (vale para admins), sem force push e sem exclusão da branch.
- **Botão de merge** (*Settings → General → Pull Requests*): só *Allow merge commits*; desligue squash e rebase.
- **Actions** (*Settings → Actions → General*): *Require approval for all outside collaborators* nos workflows de forks;
  *Workflow permissions* = somente leitura (os jobs pedem o que precisam).
- **`config/teams.json`**: `platform` (e-mails da equipe de plataforma), `teams` (equipes válidas) e os `members` de cada uma, sempre os e-mails que aparecem nos commits. Mudança entra por `chore/*` (só admin).
- **`config/approvers.json`**: `adminLogins` (logins do GitHub) e, quando PROD entrar, `platformLogins`.
- **Quando PROD entrar:** secret `FIREBASE_SA_KEY_PROD` e variável `FIREBASE_PROJECT_PROD` (no ambiente `production`)
  e o `schedule` do `prod-scheduler.yml`.
- **Credenciais nunca entram no repositório** (`.gitignore` bloqueia `service-account*.json`, `*.json.key`, `.env`).

## Trabalhando com o Claude Code e o SDD

Este repositório é feito para ser evoluído junto com um Claude Code. Ao abrir a pasta, ele lê o **`CLAUDE.md`** (regras,
comandos, armadilhas) e encontra três skills em `.claude/skills/`:

| Skill | Use para | Método |
|---|---|---|
| `feature-flag` | criar, alterar, remover, levar FF para PROD, preparar RM | fluxo de PR por tipo de branch; **sem spec** |
| `ff-status` | **consultar** o status das FFs (o que está ligado, plataforma, versão mínima, %, sincronia, histórico) | somente leitura, via `node scripts/ff-status.js` |
| `sdd-scripts` | mudar `scripts/`, workflows, hooks, regras de `config/`, docs e skills | **SDD**: spec → aprovação → TDD → verificação → `chore/*` |

**SDD (Spec-Driven Development) vale só para os scripts e a automação, não para as FFs.** Uma mudança de FF é dado
(`flags/`, `env/`, `rm/`) e segue o PR do seu tipo. Uma mudança de comportamento do motor (validação, deploy, pipeline)
começa por uma **spec aprovada** em `docs/specs/NNNN-slug.md`, e o código só nasce para cumprir os critérios de aceite:

1. Escreva a spec pelo `docs/sdd/template.md` (resumo, contexto, objetivo e fora de escopo, critérios `CA-n`, desenho,
   arquivos, plano em `### Task N` com `**Files:**`/`**Interfaces:**`, verificação, riscos e reversão, decisões).
2. Peça a aprovação explícita; só então `status: aprovada`. Sem spec aprovada não há código de produção.
3. Implemente por tarefa em TDD, verifique (`npm test`, `npm run validate`, `npm run specs`), marque os CAs, atualize a
   documentação e a spec vira `implementada`.
4. PR de `chore/*` citando a spec; só admin abre e mescla.

Detalhes, checklist de revisão e convenções: [`docs/sdd/README.md`](docs/sdd/README.md). Modelos: specs
[0001](docs/specs/0001-plataforma-e-versao-minima.md) e [0002](docs/specs/0002-chore-sem-pipeline-e-merge-por-admin.md)
(retroativas); a partir da 0003 a spec vem antes do código. `npm run specs` valida o formato e roda dentro do `npm test`.

**Código do app:** os templates de como o app Android e iOS lê a FF em cada situação (nova FF, rollout, `rc_*`, versão mínima, remoção e teste) estão em `docs/templates/codigo-app/` (`android.md` em Kotlin, `ios.md` em Swift).

**Dicas para quem trabalha com outro Claude Code:** peça "siga a skill sdd-scripts" para mudança de script; deixe o
Claude ler `README.md`, `CLAUDE.md` e a spec antes; ele não deve fazer push, abrir PR nem procurar credenciais sem você
pedir (está no `CLAUDE.md`); para FF use a skill `feature-flag` e os comandos `npm run new:flag` / `npm run preflight`.

## Testes e convenções

- A **campanha de teste do processo** (PRs positivos e negativos, em fases, com o resultado esperado de cada um) está em `docs/testes-do-processo.md`.
- `npm test` roda todos os testes (`node --test`, ~260 casos): regras de FF, montagem de condições (com um avaliador
  mínimo das expressões), escopo, nome único, rollout, aprovações, merger, os workflows (formato e segurança), specs e os
  scripts de CI em repositórios Git temporários. Sem Firebase real: o que precisa dele é o `test-platforms.js`.
- Node 22, CommonJS, sem dependência nova (`firebase-admin`; `js-yaml` só em teste). Lógica em `scripts/lib/`, CLI fina,
  testes ao lado; mensagens em português e acionáveis; `--dry-run` em quem publica; commits `tipo: resumo`.

## Decisões, limites e armadilhas

- **Repositório público:** a proteção de branch com checagens obrigatórias e os revisores de ambiente são gratuitos em
  repositório público (em privado, exigem plano pago). Ficam públicos o código, as FFs, as regras e os e-mails dos commits.
- **PR vermelho: o botão de merge não libera.** O único jeito de a `main` receber código não validado seria desligar a
  proteção. Se algo entrar errado mesmo assim, a reconferência não oferece o deploy e a reversão fica pronta.
- **O PR roda os workflows e scripts do próprio PR:** um PR que altera `.github/` ou `scripts/` pode mudar as checagens.
  Por isso essas mudanças vão em `chore/*` (só admin abre) e passam por revisão; a reconferência na `main` é a segunda barreira.
- **Nome do check na proteção:** a proteção exige **`Tudo verde`**; renomear esse job sem atualizar a proteção trava os merges.
- **PR de fork não recebe secrets:** as checagens que consultam o Firebase falham; só PRs de branches do próprio repositório passam.
- **`catalog/keys.json` desatualizado** quebra a pipeline; rode `npm run catalog`.
- **Mudança de plataforma/versão mínima em FF existente** altera as condições publicadas: depois do merge, rode `sync-nonprod`.
- A aprovação real dos dois aprovadores de PROD é a do PR no GitHub; o RM só registra presença e pessoas distintas.
- Fora do escopo por ora: PROD ativo, versão máxima de FF, métricas de saúde no rollout, iOS em aparelho real (o teste
  usa o endpoint de fetch dos apps do Firebase como iOS).
