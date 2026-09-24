# CLAUDE.md — porto-feature-flags

Repositório que governa as Feature Flags (Firebase Remote Config) por PR e pipeline do Bitbucket. **Leia o
[README.md](README.md)** para o quadro completo (o que faz, arquitetura, processo, configuração). Este arquivo
resume o que um Claude Code precisa saber antes de mexer.

## Duas naturezas de mudança (não misture)

| Mudança | Como fazer |
|---|---|
| **FF** (`flags/`, `env/`, `rm/`): criar, alterar, remover, PROD | branch `feature/*`, `update/*`, `remove/*` ou `release/*`; skill `feature-flag`; **sem SDD** |
| **Código do app** (Android/iOS) que usa a FF | templates em `docs/templates/codigo-app/` (Kotlin e Swift, uma seção por situação da FF) |
| **Consultar o status** das FFs (ligada, plataforma, versão mínima, %, sincronia) | skill `ff-status` / `npm run status`; somente leitura |
| **Scripts, pipeline, hooks, docs, regras em `config/`** | **SDD**: spec aprovada em `docs/specs/` antes do código; branch `chore/*`; skill `sdd-scripts` |

Se o pedido for de script e não houver spec aprovada, **escreva a spec primeiro** (`docs/sdd/README.md`) e peça a
aprovação. Não escreva código de produção antes disso.

## Mapa dos processos

Onde cada processo está e como acioná-lo (`README.md` traz o detalhe; a skill `feature-flag` opera as FFs, `ff-status` consulta, `sdd-scripts` evolui os scripts). **Processo novo entra aqui e em `scripts/processos.test.js`.**

| Processo | Onde está | Comando ou skill |
|---|---|---|
| Criar FF nova | README, *Processo* | `feature/*`; `npm run new:flag`; skill `feature-flag` |
| Alterar FF existente | README, *Processo* | `update/*`; skill `feature-flag` |
| Remover FF | README, *Processo* | `remove/*`; `remove-flags.js`; app primeiro |
| Levar para PROD (RM) | README, *PROD, RM e criticidade* | `release/*`; `npm run new:rm`; `validate:prod` |
| Aprovação na pipeline (Run) | README, *Pipelines* | clicar em **Run** no passo manual da `main` |
| Preflight e npm run pr | README, *Preflight e template de PR* | `npm run preflight`; `npm run pr` |
| Hook pre-push | README, *Preflight e template de PR* | `npm run hooks` (uma vez) |
| Template de PR | `.bitbucket/pull_request_template.md` | seção por tipo de branch |
| Criar branch pela interface do Bitbucket | README, *Processo* | Feature, Release ou Other (`update/`, `remove/`, `chore/`) |
| Plataforma e versão mínima | README, *Modelo de uma FF* | `platforms` e `minVersion` em `flags/` |
| Equipe e permissão | README, *Permissão por equipe* | `config/teams.json`; `check-ownership` |
| Reconferência e reversão automática | README, *Proteções* | `recheck-merge.sh`; `revert/*` |
| Sincronia main = Firebase | README, *Pipelines* | `sync-nonprod`; `verify-sync`; `npm run status -- sync` |
| Teste real de plataforma | README, *Proteções* | `node scripts/test-platforms.js nonprod` |
| Validar template no Firebase (sem publicar) | README, *Pipelines* | `node scripts/deploy.js nonprod --validate` |
| chore/* (só admin mescla) | README, *Processo* | branch `chore/*`; testes no PR; só admin clica em Mesclar |
| SDD nos scripts | `docs/sdd/README.md` | spec em `docs/specs/`; skill `sdd-scripts` |
| Consultar o status | README, *Scripts* | `npm run status`; skill `ff-status` |
| Código do app (templates) | `docs/templates/codigo-app/` | `android.md` (Kotlin); `ios.md` (Swift) |
| Catálogo de chaves | README, *Mapa de pastas* | `npm run catalog` |
| Escopo da PoC e credenciais | README, *Configuração no Bitbucket* | só NÃO PROD; `FIREBASE_SA_KEY_NONPROD` |
| Rollback | README, *PROD, RM e criticidade* | voltar a FF para desligada em `update/*` |
| Criticidade e rollout por estágio | README, *PROD, RM e criticidade* | `rolloutPlan` do RM |
| Campanha de teste do processo | `docs/testes-do-processo.md` | PRs positivos e negativos, em fases |
| Merge só pela pipeline | README, *Merge só pela pipeline* | último passo manual "Mesclar o PR"; conta-bot; `scripts/ci/merge-pr.js` |
| PR vermelho (nunca mesclar) | README, *Decisões, limites e armadilhas* | sem o passo "Mesclar"; se entrar, reverter com `revert/*` |

## Comandos

```bash
npm test                 # todos os testes (node:test); inclui o formato das specs
npm run validate         # FFs, RMs e catálogo em dia
npm run specs            # formato das specs de docs/specs/
npm run catalog          # regenera catalog/keys.json (rode ao mexer em flags/)
npm run preflight        # as checagens do PR, antes de abrir o PR (npm run pr também empurra a branch)
node scripts/deploy.js nonprod --dry-run   # o que seria publicado, sem publicar
npm run status -- list                     # status das FFs (somente leitura; skill ff-status)
```

## Regras que não se negociam

- **Nunca** grave credencial no repositório e **não procure** chave do Firebase em histórico, disco ou variáveis: se
  precisar, peça ao usuário para exportar `FIREBASE_SA_KEY_NONPROD` (JSON do service account em base64).
- **Não faça `git push` nem abra PR** sem o usuário pedir. Não mescle nada.
- **Nunca invente** dado de negócio: data/hora de PROD, aprovadores, plataformas, versão mínima, equipe, criticidade.
  Pergunte.
- Nada é editado no console do Firebase: o repositório é a fonte única e a `main` deve ser idêntica ao Remote Config
  NÃO PROD (`verify-sync`).
- **Merge só pela pipeline:** na `main` só a conta-bot mescla, pelo último passo (manual) do PR, que só aparece com tudo verde. Não mescle nada à mão. Só **admin** (`adminUuids`) clica em Mesclar em `chore/*` e `revert/*`; `chore/*` não publica.
- Toda FF tem `team` (uma equipe de `config/teams.json`), `platforms` (`android|ios|ambas`) e `minVersion` (`x.y.z`), sem exceção.
- **Uma equipe só mexe nas FFs dela**; só a equipe de **plataforma** altera FF de outra equipe e transfere FF entre equipes (`scripts/check-ownership.js`, pelos e-mails dos commits). Equipes e membros mudam só por `chore/*`.

## Arquitetura em uma tela

- **Dados:** `flags/` (definição), `env/nonprod|prod/` (valores), `rm/` (RM de PROD), `catalog/keys.json` (gerado).
- **Lógica pura:** `scripts/lib/` (flags, remote-config, escopo, nome único, aprovações, rollout, merger, specs) com
  testes `*.test.js` ao lado.
- **CLIs finas:** `scripts/*.js` (validate, deploy, verify-sync, remove-flags, check-*, preflight, test-platforms).
- **CI:** `bitbucket-pipelines.yml` só orquestra; a regra mora em script testável (`scripts/ci/*.sh` para o que é shell).
- **Governança:** tipo de branch define o que pode mudar e onde publica; reconferência na `main`; reversão automática.

## Convenções

- Node 22, CommonJS, sem dependência nova sem justificar na spec. Mensagens em português, acionáveis.
- Lógica em `scripts/lib/`, CLI fina, testes ao lado (`node:test`). Shell POSIX em `scripts/ci/` com teste.
- Commits: `tipo: resumo em português` (`feat`, `fix`, `docs`, `ci`, `test`, `chore`).

## Armadilhas do Bitbucket já vividas

- Um `deployment` por ambiente **por pipeline** (por isso deploy e verify ficam no mesmo step; `pipeline.test.js` trava).
- Pipeline de PR não recebe variável de Deployment: `FIREBASE_SA_KEY_NONPROD` é variável de **repositório** (secured).
- O merge check do plano atual **não bloqueia** o botão de merge (é Premium): por isso o merge é só pela pipeline, com conta-bot.
- *Access keys* do repositório são **somente leitura**: o push da reversão automática exige chave SSH da conta ou do
  workspace (ou token de repositório por HTTPS).
- `catalog/keys.json` desatualizado quebra a pipeline: rode `npm run catalog`.
- Step sem mudança na pasta da `condition: changesets` aparece como "skipped" (é de propósito).
