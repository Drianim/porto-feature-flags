# porto-feature-flags

Repositório que governa as **Feature Flags (FFs) do app** no **Firebase Remote Config**. Toda mudança de FF passa por
PR, validação automática, aprovação humana e deploy por pipeline (Bitbucket Pipelines). Ninguém edita o console do
Firebase à mão: o repositório é a fonte única de verdade.

> **Estado: PoC.** Só o ambiente **NÃO PROD** está ativo (projeto Firebase de teste `cursoapp-ac8e4`). PROD está
> implementado e coberto por testes, mas só entra depois de existir o projeto de PROD.

**Para quem é este README:** quem vai usar o repositório (subir uma FF) e quem vai **evoluir os scripts** (inclusive
trabalhando com um Claude Code). Comece por *Em uma tela* e vá ao que precisar.

## Sumário

1. Em uma tela
2. Arquitetura
3. Modelo de uma FF
4. Processo: como uma FF chega ao Firebase
5. Pipelines
6. Proteções
7. PROD, RM e criticidade
8. Configuração no Bitbucket (uma vez)
9. Trabalhando com o Claude Code e o SDD
10. Testes e convenções
11. Decisões, limites e armadilhas

---

## Em uma tela

```
  dev ──► branch ──► preflight ──► PR ──► CI do PR ──► aprovação ──► merge na main
         (tipo define                    (escopo, nome    (pessoas)        │
          o que pode mudar)               único, dry-run)                  ▼
                                                              reconferência do merge ──(falhou)──► revert/* + link de 1 clique
                                                                           │
                                                                           ▼
                                                             pausa: alguém clica em "Run"
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
| mudar **script, pipeline, docs** | `chore/*` (com **spec**) | nenhum (não publica) | SDD |

## Arquitetura

Quatro camadas, cada uma com uma responsabilidade:

| Camada | Onde | Papel |
|---|---|---|
| **Dados** | `flags/`, `env/nonprod/`, `env/prod/`, `rm/`, `catalog/` | O que as FFs são e valem em cada ambiente |
| **Lógica** | `scripts/lib/` | Regras puras e testadas: modelo da FF, montagem do Remote Config, escopo, nome único, aprovação, rollout |
| **CLIs** | `scripts/*.js`, `scripts/ci/*.sh` | Comandos finos que leem argumentos, chamam a lógica, imprimem e saem com código |
| **Orquestração** | `bitbucket-pipelines.yml`, `.githooks/` | Só encadeia os comandos; nenhuma regra mora aqui |

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
| `config/approvers.json` | `admins` (e-mails que podem mesclar `chore/*`) e `platform` (aprovadores de PROD, a preencher) |
| `docs/sdd/`, `docs/specs/` | Processo SDD dos scripts, template e as specs |
| `docs/templates/codigo-app/` | **Templates do código do app** (Kotlin e Swift) que lê a FF, por situação da FF |
| `.bitbucket/pull_request_template.md` | Descrição padrão do PR, com uma seção por tipo de branch |
| `.claude/skills/` | Skills do Claude Code: `feature-flag` (operar FFs), `ff-status` (consultar o status) e `sdd-scripts` (evoluir scripts) |
| `CLAUDE.md` | Resumo das regras e armadilhas para um Claude Code que abrir o repositório |
| `.githooks/pre-push` | Roda o preflight ao empurrar `feature/`, `update/`, `remove/`, `release/` (`npm run hooks` ativa) |

### Scripts

| Script | O que faz |
|---|---|
| `new-flag.js`, `new-rm.js` | Geram a definição/valores de uma FF e o RM de PROD |
| `validate.js` | Valida FFs e RMs (`--prod` aplica as regras de PROD) |
| `catalog.js` | Gera/confere `catalog/keys.json` (`--check`) |
| `check-scope.js` | Cada tipo de branch só mexe nas suas pastas |
| `check-new-flags.js` | Nome único: `feature` cria, `update` altera, `remove` apaga; consulta o Firebase |
| `check-approvals.js` | Gate de PROD: 1 aprovação de plataforma + 1 de equipe, nenhuma do autor (precisa `BB_ACCESS_TOKEN`) |
| `check-ownership.js` | **Permissão por equipe:** só a equipe dona da FF (ou a plataforma) a altera; transferir FF entre equipes é da plataforma |
| `check-merger.js` | Só admin mescla `chore/*` |
| `check-specs.js` | Formato das specs de `docs/specs/` |
| `ff-status.js` | **Status das FFs, somente leitura:** lista, detalhe, rollout, resumo, sincronia, histórico e obsoletas (`npm run status -- list`); usa o Firebase se houver credencial |
| `preflight.js` | As checagens do PR, no seu computador (`npm run preflight`, `npm run pr`) |
| `deploy.js` | Publica no Remote Config (`--dry-run` só monta o plano; `--validate` valida o template no Firebase **sem publicar**; `--now <ISO>`) |
| `remove-flags.js` | Apaga do Remote Config as FFs removidas do repositório (só NÃO PROD) |
| `verify-sync.js` | Confere `main` = Firebase (`--fix` publica, `--strict` reprova chave extra) |
| `test-platforms.js` | Teste real Android x iOS e versão mínima, consultando o próprio Firebase |
| `ci/merge-source.sh` | Descobre a branch de origem do merge pela mensagem do commit |
| `ci/recheck-merge.sh` | Reconfere as regras no commit de merge da `main` |
| `ci/revert-merge.sh` | Prepara a branch `revert/*` e o link de um clique |
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
- **Equipe obrigatória:** `"team": "squad-poc"` em `flags/<key>.json`, sempre uma das equipes de `config/teams.json` (o campo antigo `owner` foi renomeado e dá erro). No Firebase a equipe vai como prefixo da descrição (`[squad-poc] texto...`), porque o Remote Config não tem rótulo por parâmetro: assim ela aparece no console, e o `verify-sync` acusa se divergir. `npm run status -- summary` conta as FFs por equipe.
- **Permissão por equipe:** uma equipe só cria, altera, remove ou leva a PROD as FFs **dela**. A **equipe de plataforma** (`platform` em `config/teams.json`) mexe em qualquer FF e é a única que **transfere** uma FF de uma equipe para outra (mudar o `team`). Detalhes em *Permissão por equipe*, abaixo.
- **Grupo** opcional agrupa parâmetros no console (`"group": "Vitrine Hub"`).
- **No Firebase** viram condições `device.os == 'ios' && app.version.>=(['<minVersion>'])` (idem `'android'`; o Firebase recusa a forma `app.version >= '...'`), com
  `&& percent('<chave>') <= N` durante o rollout. A semente com o nome da FF faz cada FF sortear seu próprio grupo, e
  quem entra em 5% continua dentro quando sobe para 25%. Nas `rc_*` o padrão do parâmetro é "usar o valor do app" e o
  valor padrão vira a condição `<chave>_<plataforma>_base`.
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
| `feature/*` | criar FF **nova** | `flags/`, `env/nonprod/`, `catalog/` (não PROD) | NÃO PROD, depois do Run |
| `update/*` | alterar FF que **já existe** | `flags/`, `env/nonprod/`, `catalog/` (não PROD) | NÃO PROD, depois do Run |
| `remove/*` | **apagar** FF | só **apaga** arquivos de `flags/`, `env/*`, `rm/` (catálogo regenerado) | remove do Firebase, depois do Run |
| `release/*` | levar para PROD | somente `env/prod/`, `rm/`, `catalog/` | PROD por horário do RM, depois do Run |
| `chore/*` e outros | script, pipeline, docs | não restrito | **não publica**; sem pipeline de PR; só admin mescla |

O CI só **proíbe PROD** em `feature/*` e `update/*`; por convenção elas mexem só em FF, e qualquer mudança de script vai em `chore/*` com spec (SDD).

O CI reprova PR fora dessas regras (`check-scope`, `check-new-flags`). A origem do merge vem da mensagem do commit
(`Merged in <branch> (pull request #N)`); merge sem origem identificável não publica nada.

### Criar a branch pela interface do Bitbucket

Na tela **Create branch** do Bitbucket, **From branch** é sempre `main` e o **Type** decide o prefixo:

| Type na tela | Prefixo | Use para |
|---|---|---|
| Feature | `feature/` | FF nova |
| Release | `release/` | levar para PROD |
| Other | (você digita o nome completo) | `update/...`, `remove/...` e `chore/...` |
| Bugfix, Hotfix | `bugfix/`, `hotfix/` | **não fazem parte do processo**: não têm regra de escopo e não publicam nada |

`update/`, `remove/` e `chore/` não existem como tipo na tela: escolha **Other** e digite o prefixo junto com o nome (ex.: `update/ft-checkout-50`).

### Criar uma FF (`feature/*`)

1. `npm run new:flag -- ft_minha_flag --team squad-poc --criticality media --description "..." --platforms ambas --min-version 2.61.0`
   (`rc_*` exige também `--value`; `--group "Nome"` agrupa).
2. Edite `env/nonprod/ft_minha_flag.json` com os valores por plataforma e o `rolloutPercent`, se houver.
3. `npm run catalog && npm run validate`; simule com `node scripts/deploy.js nonprod --dry-run`.
4. `npm run preflight` (ou `npm run pr`, que empurra a branch e imprime o link para abrir o PR). Preencha o template do PR.
5. Aprovação do PR e merge → a pipeline da `main` reconfere e **pausa** → alguém clica em **Run** → deploy + `verify-sync`.

### Alterar uma FF (`update/*`)

Edite `flags/` ou `env/nonprod/` da FF que já existe, `npm run catalog`, preflight, PR. `update/*` não cria FF nova e
`feature/*` não altera existente (o CI bloqueia com a mensagem de qual branch usar).

### Remover uma FF (`remove/*`)

Apague `flags/<key>.json`, `env/nonprod/<key>.json` (e `env/prod/`, `rm/` se houver), `npm run catalog`, PR. No **Run**,
`scripts/remove-flags.js nonprod --base HEAD^1` apaga do Remote Config (parâmetro, grupo que ficar vazio, condições
próprias) só as FFs cujo `flags/<key>.json` foi apagado naquele merge. O script recusa chave que ainda existe em
`flags/` e nunca apaga chave "de fora" do repositório. Ainda não suporta PROD.

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
| alterar `config/teams.json` (equipes e membros) | só numa `chore/*`, mesclada por admin |

- **Como é conferido:** `scripts/check-ownership.js` compara a equipe de cada FF tocada (no ponto de partida do PR e no fim) com os **e-mails dos commits do PR**. Roda no `preflight`, na pipeline de PR (`feature/*`, `update/*`, `remove/*`, `release/*`) e na **reconferência da `main`** (a barreira real, que aciona a reversão automática). Um RM vale para as FFs listadas nele.
- **Um PR não se autoriza:** a lista de membros é lida do ponto de partida (`main`), nunca do próprio PR, e mudar `config/teams.json` numa branch de FF é reprovado.
- **Limite:** o e-mail do commit é configurado por quem commita: isto barra o erro e o descuido (a equipe errada mexendo na FF errada), não a má-fé. Quem tem mais de um e-mail lista todos. Equipe sem membros cadastrados só é alterada pela plataforma.

### Preflight e template de PR

- `npm run preflight`: formato, catálogo em dia, escopo da branch, permissão por equipe, nome único, template aceito pelo Firebase (com `FIREBASE_SA_KEY_NONPROD`) e, em `release/*`, regras de PROD.
- `npm run pr`: preflight e, se passar, empurra a branch e imprime o **link de um clique** do PR.
- `npm run hooks` (uma vez): o `pre-push` roda o preflight ao empurrar branches de FF (`git push --no-verify` ignora).
- `.bitbucket/pull_request_template.md` (lido da `main`) traz uma seção por tipo; apague as que não são do seu PR.
- Sem `FIREBASE_SA_KEY_NONPROD` a consulta de nome ao Firebase é pulada; a pipeline do PR faz essa checagem.

## Pipelines

`bitbucket-pipelines.yml` (só orquestra):

| Pipeline | Quando | O que faz |
|---|---|---|
| **PR** (`feature/**`, `update/**`, `remove/**`, `release/**`) | ao abrir/atualizar PR | testes e `validate`, escopo, permissão por equipe, nome único, dry-run, **validação do template no próprio Firebase (sem publicar)** (e regras de PROD em `release/*`) |
| **`main`** | a cada merge | valida; **reconfere o merge**; passo manual de deploy NÃO PROD (`deployment: test`); passos de PROD (só se o merge mexeu em `env/prod/**` ou `rm/**`) |
| **`develop`** | push | só valida (não publica) |
| **`sync-nonprod`** (custom, manual/agendada, em `main`) | divergência main ≠ Firebase | publica o que está em `main` e confere de novo |
| **`verify-nonprod`** (custom) | alarme | só leitura, `--strict` |
| **`prod-scheduler`** (custom, agendada) | a cada ~15 min | avança os estágios do rollout de PROD pelo horário |
| **`plan-prod`** (custom) | manual | dry-run de PROD |

### Aprovação dentro da pipeline

Todo passo que publica é `trigger: manual`: a pipeline **pausa** até alguém clicar em **Run**. Sem o clique, nada é
publicado. Cada passo só aparece quando o merge alterou a pasta certa (`condition: changesets`): `flags/` e
`env/nonprod/` mostram o de NÃO PROD; `env/prod/` e `rm/`, os de PROD (passo "skipped" = "Changesets condition not
satisfied", de propósito). Para restringir **quem** clica: *Repository settings → Deployments → Deployment permissions*.

### Garantia: `main` = Firebase NÃO PROD

Depois do deploy, no mesmo passo, o `verify-sync` compara `main` com o Remote Config real (valor padrão, condições,
tipo, descrição, grupo e chaves ausentes). Se o deploy falhar, a pipeline **`sync-nonprod`** publica o que está em
`main` e confere de novo. `verify-nonprod` (`--strict`) também falha por chave que só existe no Firebase. Local:
`FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node scripts/verify-sync.js nonprod`. O verificador não apaga o que só
existe no Firebase.

## Proteções

1. **Preflight** local (e hook de push) e **CI do PR**: testes, escopo de pastas, nome único.
2. **Merge check do Bitbucket**: configurado na `main`, mas **no plano atual não impede o botão de merge** (a opção
   *Prevent a merge with unresolved merge checks* não está disponível). O PR fica vermelho, ainda mesclável.
3. **Reconferência na `main`** (`scripts/ci/recheck-merge.sh`): no início da pipeline reaplica escopo e nome único ao
   commit de merge (permissão por equipe e, para `chore/*`, exige admin). Se falhar, o passo de deploy nem é oferecido. **É a barreira real.**
4. **Reversão automática** (`scripts/ci/revert-merge.sh`, `after-script` da reconferência): cria a branch
   `revert/pr-<n>-<origem>` com `git revert -m 1`, empurra por SSH e imprime o **link de um clique** do PR de reversão.
   Nunca mescla sozinho, nunca falha o passo, não duplica em reexecução. Sem a chave, imprime os comandos manuais.
   Chave SSH: *Repository settings → Pipelines → SSH keys* gera a chave do pipeline; a pública precisa estar numa
   **chave SSH da conta ou do workspace** (as *Access keys* do repositório são só leitura e dão `Permission denied`) ou use
   um *repository access token* por HTTPS (`REVERT_REMOTE_URL`). O clone do Pipelines é raso (serve para merge recente).
5. **Run** (aprovação humana) e **verify-sync** depois de publicar.
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
6. PR `release/*` → `main`: o gate `check-approvals.js` confere no Bitbucket 1 aprovação da plataforma e 1 da equipe
   (nenhuma do autor); o Run publica no horário do RM. Rollback: PR com `default: "false"` ou menor `rolloutPercent`.

| Criticidade | Exigência |
|---|---|
| baixa | Aprovação padrão; plano padrão 100% |
| media | Aprovação padrão + teste em não produtivo; 25% (60 min) → 100% |
| alta | Rollout progressivo obrigatório (mais de um estágio): 5 → 25 → 50 → 100 |
| critica | Rollout progressivo + monitoramento intensivo: 5 → 25 → 50 → 100 |

O avanço entre estágios é por **tempo**, não consulta métricas de saúde: monitore e faça rollback se preciso.

## Configuração no Bitbucket (uma vez)

- **Variável de repositório** (*Repository settings → Pipelines → Repository variables*, **Secured**):
  `FIREBASE_SA_KEY_NONPROD` = JSON do service account em base64 (`base64 -i key.json | pbcopy`), papel *Firebase Remote
  Config Admin*. Uma só cobre PR, `main` e as pipelines custom. O projeto NÃO PROD já vem de `config/environments.json`.
- **Branch restrictions** na `main`: só via PR (mín. de aprovações conforme o plano). Merge check "build com sucesso" já
  configurado (ver limite em *Proteções*).
- **Chave SSH** da reversão automática (ver *Proteções*, item 4).
- **`config/teams.json`**: `platform` (e-mails da equipe de plataforma), `teams` (equipes válidas) e os `members` de cada uma, sempre os e-mails que aparecem nos commits. Equipe nova ou mudança de membro entra por uma `chore/*` (só admin mescla).
- **`config/approvers.json`**: `admins` (e-mails que fazem merge de `chore/*`; é o e-mail do commit de merge) e, quando
  PROD entrar, `platform` com os `account_id` do time de plataforma.
- **Quando PROD entrar:** `FIREBASE_SA_KEY_PROD` e `FIREBASE_PROJECT_PROD` **no Deployment `Production`**;
  `BB_ACCESS_TOKEN` (token de repositório, escopo `pullrequest:read`) para o gate de aprovação; restrinja quem faz deploy.
- **Schedules:** `sync-nonprod` em `main` (ex.: a cada 30 min) e `prod-scheduler` em `main` (ex.: a cada 15 min).
- **Credenciais nunca entram no repositório** (`.gitignore` bloqueia `service-account*.json`, `*.json.key`, `.env`).

## Trabalhando com o Claude Code e o SDD

Este repositório é feito para ser evoluído junto com um Claude Code. Ao abrir a pasta, ele lê o **`CLAUDE.md`** (regras,
comandos, armadilhas) e encontra três skills em `.claude/skills/`:

| Skill | Use para | Método |
|---|---|---|
| `feature-flag` | criar, alterar, remover, levar FF para PROD, preparar RM | fluxo de PR por tipo de branch; **sem spec** |
| `ff-status` | **consultar** o status das FFs (o que está ligado, plataforma, versão mínima, %, sincronia, histórico) | somente leitura, via `node scripts/ff-status.js` |
| `sdd-scripts` | mudar `scripts/`, pipeline, hooks, regras de `config/`, docs e skills | **SDD**: spec → aprovação → TDD → verificação → `chore/*` |

**SDD (Spec-Driven Development) vale só para os scripts e a automação, não para as FFs.** Uma mudança de FF é dado
(`flags/`, `env/`, `rm/`) e segue o PR do seu tipo. Uma mudança de comportamento do motor (validação, deploy, pipeline)
começa por uma **spec aprovada** em `docs/specs/NNNN-slug.md`, e o código só nasce para cumprir os critérios de aceite:

1. Escreva a spec pelo `docs/sdd/template.md` (resumo, contexto, objetivo e fora de escopo, critérios `CA-n`, desenho,
   arquivos, plano em `### Task N` com `**Files:**`/`**Interfaces:**`, verificação, riscos e reversão, decisões).
2. Peça a aprovação explícita; só então `status: aprovada`. Sem spec aprovada não há código de produção.
3. Implemente por tarefa em TDD, verifique (`npm test`, `npm run validate`, `npm run specs`), marque os CAs, atualize a
   documentação e a spec vira `implementada`.
4. PR de `chore/*` citando a spec; só admin mescla.

Detalhes, checklist de revisão e convenções: [`docs/sdd/README.md`](docs/sdd/README.md). Modelos: specs
[0001](docs/specs/0001-plataforma-e-versao-minima.md) e [0002](docs/specs/0002-chore-sem-pipeline-e-merge-por-admin.md)
(retroativas); a partir da 0003 a spec vem antes do código. `npm run specs` valida o formato e roda dentro do `npm test`.

**Código do app:** os templates de como o app Android e iOS lê a FF em cada situação (nova FF, rollout, `rc_*`, versão mínima, remoção e teste) estão em `docs/templates/codigo-app/` (`android.md` em Kotlin, `ios.md` em Swift).

**Dicas para quem trabalha com outro Claude Code:** peça "siga a skill sdd-scripts" para mudança de script; deixe o
Claude ler `README.md`, `CLAUDE.md` e a spec antes; ele não deve fazer push, abrir PR nem procurar credenciais sem você
pedir (está no `CLAUDE.md`); para FF use a skill `feature-flag` e os comandos `npm run new:flag` / `npm run preflight`.

## Testes e convenções

- A **campanha de teste do processo** (PRs positivos e negativos, em fases, com o resultado esperado de cada um) está em `docs/testes-do-processo.md`.
- `npm test` roda todos os testes (`node --test`, ~200 casos): regras de FF, montagem de condições (com um avaliador
  mínimo das expressões), escopo, nome único, rollout, aprovações, merger, pipeline (lint do YAML), specs e os scripts
  de CI em repositórios Git temporários. Sem Firebase real: o que precisa dele é o `test-platforms.js`.
- Node 22, CommonJS, sem dependência nova (`firebase-admin`; `js-yaml` só em teste). Lógica em `scripts/lib/`, CLI fina,
  testes ao lado; mensagens em português e acionáveis; `--dry-run` em quem publica; commits `tipo: resumo`.

## Decisões, limites e armadilhas

- **Um `deployment` por ambiente por pipeline** (limite do Bitbucket): por isso deploy, remoção e verify ficam no mesmo
  passo manual; `scripts/lib/pipeline.test.js` trava.
- **PR pipelines não recebem variáveis de Deployment**: a credencial NÃO PROD é variável de repositório (secured).
- **O merge check do plano atual não bloqueia** o merge: a barreira é a reconferência na `main` + reversão em um clique.
- **`chore/*` sem pipeline de PR** e só admin mescla: barreira depois do merge, pelo e-mail do commit. Os testes rodam na
  `main` (rode `npm test` antes do PR). Se um dia o plano exigir "build verde" obrigatório, PR sem pipeline não mescla.
- **`catalog/keys.json` desatualizado** quebra a pipeline; rode `npm run catalog`.
- **Mudança de plataforma/versão mínima em FF existente** altera as condições publicadas: depois do merge da `chore/*` que
  migra os dados, rode `sync-nonprod` (a `main` diverge do Firebase até lá).
- A aprovação real dos dois aprovadores de PROD é a do PR no Bitbucket; o RM só registra presença e pessoas distintas.
- Fora do escopo por ora: PROD ativo, versão máxima de FF, métricas de saúde no rollout, iOS em aparelho real (o teste
  usa o endpoint de fetch dos apps do Firebase como iOS).
