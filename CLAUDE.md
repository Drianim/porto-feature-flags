# CLAUDE.md — porto-feature-flags

Repositório **público no GitHub** (`drianimadriano/porto-feature-flags`) que governa as Feature Flags (Firebase Remote Config) por PR e GitHub Actions. **Leia o
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
| Aprovação do deploy (ambiente nonprod) | README, *Aprovação do deploy* | revisor aprova o job no ambiente `nonprod` (*Review deployments*) |
| Preflight e npm run pr | README, *Preflight e template de PR* | `npm run preflight`; `npm run pr` |
| Hook pre-push | README, *Preflight e template de PR* | `npm run hooks` (uma vez) |
| Template de PR | `.github/pull_request_template.md` | seção por tipo de branch |
| Criar a branch com o prefixo certo | README, *Criar a branch* | nome completo com o prefixo (`feature/`, `update/`, `remove/`, `release/`, `chore/`) |
| Plataforma e versão mínima | README, *Modelo de uma FF* | `platforms` e `minVersion` em `flags/` |
| Equipe e permissão | README, *Permissão por equipe* | `config/teams.json`; `check-ownership` |
| Reconferência e reversão automática | README, *Proteções* | `recheck-merge.sh`; `revert/*` |
| Sincronia main = Firebase | README, *Pipelines* | `sync-nonprod`; `verify-sync`; `npm run status -- sync` |
| Teste real de plataforma | README, *Proteções* | `node scripts/test-platforms.js nonprod` |
| Validar template no Firebase (sem publicar) | README, *Pipelines* | `node scripts/deploy.js nonprod --validate` |
| chore/* e revert/* (só admin) | README, *Processo* | só admin abre (PR) e mescla (reconferência); `adminLogins` |
| SDD nos scripts | `docs/sdd/README.md` | spec em `docs/specs/`; skill `sdd-scripts` |
| Consultar o status | README, *Scripts* | `npm run status`; skill `ff-status` |
| Código do app (templates) | `docs/templates/codigo-app/` | `android.md` (Kotlin); `ios.md` (Swift) |
| Catálogo de chaves | README, *Mapa de pastas* | `npm run catalog` |
| Escopo da PoC e credenciais | README, *Configuração no GitHub* | só NÃO PROD; `FIREBASE_SA_KEY_NONPROD` |
| Rollback | README, *PROD, RM e criticidade* | voltar a FF para desligada em `update/*` |
| Criticidade e rollout por estágio | README, *PROD, RM e criticidade* | `rolloutPlan` do RM |
| Campanha de teste do processo | `docs/testes-do-processo.md` | PRs positivos e negativos, em fases |
| Merge bloqueado até tudo verde | README, *Merge bloqueado até tudo verde* | proteção da `main` exige o job "Tudo verde" (`.github/workflows/pr.yml`) |
| PR vermelho (nunca mesclar) | README, *Decisões, limites e armadilhas* | o botão não libera; se algo entrar, reverter com `revert/*` |

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
- **Merge só com "Tudo verde":** a proteção da `main` só libera o merge quando todas as checagens do PR passaram (sem exceção para admins). Não mescle nada que não esteja verde nem desligue a proteção. Só **admin** (`adminLogins` em `config/approvers.json`) abre e mescla `chore/*` e `revert/*`; `chore/*` não publica.
- Toda FF tem `team` (uma equipe de `config/teams.json`), `platforms` (`android|ios|ambas`) e `minVersion` (`x.y.z`), sem exceção.
- **Uma equipe só mexe nas FFs dela**; só a equipe de **plataforma** altera FF de outra equipe e transfere FF entre equipes (`scripts/check-ownership.js`, pelos e-mails dos commits). Equipes e membros mudam só por `chore/*`.

## Arquitetura em uma tela

- **Dados:** `flags/` (definição), `env/nonprod|prod/` (valores), `rm/` (RM de PROD), `catalog/keys.json` (gerado).
- **Lógica pura:** `scripts/lib/` (flags, remote-config, escopo, nome único, aprovações, rollout, merger, specs) com
  testes `*.test.js` ao lado.
- **CLIs finas:** `scripts/*.js` (validate, deploy, verify-sync, remove-flags, check-*, preflight, test-platforms).
- **CI:** `.github/workflows/*.yml` só orquestram; a regra mora em script testável (`scripts/ci/`). `scripts/lib/workflows.test.js` trava o formato e a segurança dos workflows.
- **Governança:** tipo de branch define o que pode mudar e onde publica; reconferência na `main`; reversão automática.

## Convenções

- Node 22, CommonJS, sem dependência nova sem justificar na spec. Mensagens em português, acionáveis.
- Lógica em `scripts/lib/`, CLI fina, testes ao lado (`node:test`). Shell POSIX em `scripts/ci/` com teste.
- Commits: `tipo: resumo em português` (`feat`, `fix`, `docs`, `ci`, `test`, `chore`).

## Armadilhas já vividas

- **O PR roda os workflows e scripts do próprio PR** (evento `pull_request`): mudar `.github/` ou `scripts/` num PR muda as
  checagens dele. Isso vai em `chore/*` (só admin). Nunca use `pull_request_target` com checkout do código do PR.
- **Entrada do PR** (nome da branch, autor, título) só entra nos scripts por `env`, nunca `${{ ... }}` dentro de `run`.
- **PR de fork não recebe secrets:** as checagens com Firebase falham; é esperado.
- **A proteção da `main` exige o job `Tudo verde`:** renomear o job sem atualizar a proteção trava os merges.
- **Merge só por merge commit** (squash e rebase desligados): a reconferência e a reversão usam o commit de merge e a
  mensagem `Merge pull request #N from <dono>/<branch>`.
- `catalog/keys.json` desatualizado quebra a pipeline: rode `npm run catalog`.
- No Bitbucket (histórico até a spec 0010) o merge check do plano **não bloqueava** o botão: os PRs #37, #39 e #47 entraram
  sem validação. Foi o motivo da migração para o GitHub.
