---
name: feature-flag
description: Opera as Feature Flags deste repositório (Firebase Remote Config, GitHub Actions) — criar, alterar, remover e levar para PROD uma FF, com equipe e permissão, plataforma e versão mínima, RM, rollout e rollback, código do app, escolha de branch, PR, preflight, pipeline, Tudo verde, aprovação do deploy, reversão e sincronia. Use quando o pedido for mexer em FF, escolher a branch certa, abrir PR, entender por que a pipeline ou o merge falhou, ou explicar o fluxo.
---

# Feature Flags — como operar este repositório

Fonte única de verdade das flags: **nada é editado no console do Firebase**; tudo passa por PR e pela pipeline. Repositório **público no GitHub** (`Drianim/porto-feature-flags`), pipeline em GitHub Actions. Estado atual: **PoC só com NÃO PROD** (projeto `cursoapp-ac8e4`); PROD está implementado e testado, mas ainda não tem projeto. Visão completa no `README.md`; o **Mapa dos processos** no `CLAUDE.md` diz onde cada processo está.

Outras skills: `ff-status` só **consulta** o status; `sdd-scripts` **evolui** scripts, pipeline e documentação (com spec).

## Regras gerais

- **Não faça `git push` nem abra PR** sem o usuário pedir. Não mescle nada.
- **Nunca invente** dado de negócio: chave, descrição, equipe, plataformas, versão mínima, criticidade, data de PROD, aprovadores. Pergunte.
- **Não procure credenciais.** O NÃO PROD usa o secret do repositório no GitHub `FIREBASE_SA_KEY_NONPROD`; o projeto vem de `config/environments.json`. Localmente, peça ao usuário para exportá-la.
- **PR vermelho: nunca mesclar.** A proteção da `main` só libera o botão de merge quando o job **"Tudo verde"** do PR passa (sem exceção para admins). Espere todas as checagens; não peça para desligar a proteção. Se algo entrar na `main` sem validação, veja *Quando algo falha*.

## Antes de criar uma FF, pergunte

Chave (`ft_*` toggle ou `rc_*` valor), descrição, **equipe** (de `config/teams.json`), **plataformas** (`android`, `ios` ou `ambas`), **versão mínima** do app com o código (`x.y.z`, ou uma por plataforma), criticidade, estado inicial (desligada, ligada em quais plataformas, com quantos %) e, para `rc_*`, o valor padrão.

## Qual branch usar

| Quero… | Branch | Só pode alterar | No merge |
|---|---|---|---|
| criar FF **nova** | `feature/*` | `flags/`, `env/nonprod/`, `catalog/` | NÃO PROD, depois da aprovação no ambiente |
| alterar FF que **já existe** | `update/*` | `flags/`, `env/nonprod/`, `catalog/` | NÃO PROD, depois da aprovação no ambiente |
| **apagar** FF | `remove/*` | só apaga `flags/`, `env/*`, `rm/` | remove do Firebase, depois da aprovação |
| levar para **PROD** | `release/*` | `env/prod/`, `rm/`, `catalog/` | PROD por horário do RM |
| script, pipeline, docs | `chore/*` | livre; testes e validação no PR; **só admin** abre e mescla | nada |
| desfazer um merge | `revert/*` | só `git revert -m 1 <merge>` | nada (a `main` volta ao estado anterior) |

Nome de FF nunca se repete: `feature/*` só cria (consulta o Firebase); `update/*` só altera existente. A branch sai da `main` com o **nome completo com o prefixo** (ex.: `feature/ft-checkout-novo`, `update/ft-checkout-50`); outro prefixo (`hotfix/`, `bugfix/`) reprova no PR.

## Comandos de FF

`npm run flags:help` lista os comandos guiados disponíveis (`new:flag` pronto; `update:flag` e `remove:flag`
ainda não implementados). `npm run flags` abre um menu interativo (1 - Criar FF nova, 2 - Alterar FF existente,
3 - Remover FF): a opção 1 pergunta os dados, cria a branch `feature/*`, roda `new:flag` e pergunta se já pode
enviar (`git push`) e abrir o PR com o corpo preenchido; as opções 2 e 3 avisam que ainda não estão
implementadas.

## Criar uma FF (`feature/*`)

1. `npm run new:flag -- <chave> --team <equipe> --criticality <baixa|media|alta|critica> --description "..." --platforms <android|ios|ambas> --min-version <x.y.z>` (`rc_*` exige `--value`; `--group "Nome"` agrupa). Isto cria `flags/<chave>.json` e `env/nonprod/<chave>.json` **desligada**.
2. Ligue em `env/nonprod/<chave>.json`, ex.: `{"nonprod": {"default": "false", "ios": {"value": "true", "rolloutPercent": 50}, "android": {"value": "true"}}}` (`default: "true"` liga em todas as plataformas da FF).
3. `npm run catalog && npm run validate`, e simule: `node scripts/deploy.js nonprod --dry-run`. Com a chave, valide no Firebase **sem publicar**: `node scripts/deploy.js nonprod --validate`.
4. `npm run preflight` (mesmas checagens do PR); se passar, `npm run pr` empurra a branch e imprime o link do PR. Só rode o push se o usuário pedir. O hook de pre-push (`npm run hooks`, uma vez) roda o preflight ao empurrar.
5. No PR, use o template `.github/pull_request_template.md` (uma seção por tipo; apague as que não são suas) e informe o **PR do app**. Só mescle depois do job **"Tudo verde"**.

## Alterar (`update/*`) e remover (`remove/*`)

- **Alterar:** edite `flags/` ou `env/nonprod/` da FF existente, `npm run catalog`, preflight, PR. Mudar `platforms`, `minVersion` ou o `team` também é `update/*` (mudar o `team` é só da plataforma).
- **Remover:** apague `flags/<chave>.json`, `env/nonprod/<chave>.json` (e `env/prod/`, `rm/`), `npm run catalog`, PR. Depois do merge e da aprovação no ambiente, `scripts/remove-flags.js` apaga a chave do Remote Config. **O app vem primeiro:** antes da `remove/*`, o código do app deixa de ler a chave e é publicado (senão versões antigas caem no padrão do app). Nunca apague FF em `feature/*` ou `update/*`.

## Depois do merge: o que o workflow `main` faz

1. Identifica a origem do merge, roda testes e `validate`.
2. **Reconferência do merge** (escopo, nome único, permissão por equipe; `chore/*` e `revert/*` exigem que quem mesclou seja admin). Se falhar, o deploy nem é oferecido e o workflow prepara a reversão (`revert/*`) e imprime o link.
3. O job de deploy fica **pausado** esperando aprovação no ambiente `nonprod` (*Review deployments*). Sem a aprovação, nada é publicado.
4. Aprovado, ele valida no Firebase, publica (ou remove) e o `verify-sync` confere `main` = Firebase.

Se o deploy falhar, a `main` e o Firebase divergem: o workflow **`sync-nonprod`** (manual, sempre em `main`, com aprovação) publica o que está em `main` e confere de novo; **`verify-nonprod`** só lê. Local: `node scripts/verify-sync.js nonprod` (com a chave).

## Quando algo falha

- **PR vermelho:** leia o passo que falhou (Testes e validação, Escopo, Permissão por equipe, nome único, Prévia, Validar no Firebase). Corrija na branch; não mescle.
- **Algo errado entrou na `main`:** a reconferência não oferece o deploy e o workflow já empurra a branch `revert/pr-<n>-<origem>` e imprime o link. Se não conseguir, faça à mão: `git revert -m 1 <commit-do-merge>` numa branch `revert/pr-<n>-<origem>` e abra o PR (só admin). Não rode o `sync-nonprod` antes de a `main` voltar ao normal.
- **Deploy falhou no Firebase:** o log traz a mensagem do `validateTemplate`; a `main` fica diferente do Firebase até corrigir e rodar de novo o job ou o `sync-nonprod`.

## Levar para PROD (`release/*`, separada da feature)

PROD só muda numa `release/*` (`env/prod/<chave>.json` e `rm/`), por horário e em estágios; ainda não tem projeto no Firebase (só valide e simule, sem mesclar).

1. Pergunte a **data/hora de PROD** (ISO 8601 com fuso); nunca invente.
2. `npm run new:rm -- --flags <a,b> --squad <equipe> --schedule <ISO>` (o plano de rollout vem da criticidade; ver *Criticidade*).
3. Crie `env/prod/<chave>.json` (`rolloutPercent` é teto). Toggles que liberam algo e todas as `rc_*` exigem RM.
4. Aprovações: `approvals.team` e `approvals.platform` por **pessoas diferentes**; nunca preencha em nome de alguém.
5. `npm run validate:prod` e `node scripts/deploy.js prod --dry-run --now <ISO>`. O gate `check-approvals.js` confere as revisões do PR (1 de `platformLogins` + 1 da equipe) e o deploy espera aprovação no ambiente `production`.

## Criticidade, rollout e rollback

- `rolloutPlan` por criticidade: baixa 100%; media 25% (60 min) → 100%; alta e crítica 5% → 25% → 50% → 100% (mais de um estágio é obrigatório). O avanço é por tempo, não por métricas de saúde.
- **Rollback:** volte o valor da FF para desligada (ou reduza `rolloutPercent`) numa `update/*`; o app volta ao caminho antigo sem publicar app novo. Se a chave sumir do Firebase, vale o padrão do app (comportamento antigo).

## Equipe e permissão

Toda FF tem `team` (de `config/teams.json`); no Firebase ela aparece no prefixo da descrição (`[equipe] texto`). **Uma equipe só altera as FFs dela.** Só a equipe de **plataforma** mexe em FF de outra equipe e transfere FF entre equipes. O `check-ownership` confere pelos e-mails dos commits (no preflight, no PR e na `main`); um PR reprovado por isso deve ser feito pela equipe dona ou pela plataforma. Equipes e membros mudam só em `config/teams.json`, por uma `chore/*`.

## Plataforma e versão mínima

`platforms` e `minVersion` são obrigatórios. Abaixo da versão mínima (ou fora das plataformas) a FF nunca ativa: toggle recebe `false`; `rc_*` não é enviada (o app usa o padrão dele). No Firebase é a condição `device.os == '<os>' && app.version.>=(['x.y.z'])`; o Firebase recusou a forma `app.version >= '...'`. Versões diferentes por plataforma: `"minVersion": { "android": "2.58.3", "ios": "2.61.0" }`.

## Código do app que usa a FF

Templates em `docs/templates/codigo-app/` (`android.md` em Kotlin, `ios.md` em Swift, seis situações). Padrão do app = comportamento antigo (toggle `false`); uma leitura, uma decisão; o app não compara versão nem plataforma; na remoção o app vem primeiro. A FF só deve ser ligada depois que o app com o código estiver publicado.

## Verificações e testes de ponta a ponta

- `npm run status -- sync` (skill `ff-status`): `main` = Firebase por FF.
- `node scripts/test-platforms.js nonprod`: teste real Android × iOS e versão mínima, consultando o próprio Firebase.
- A campanha de teste do processo (PRs positivos e negativos, por fases) está em `docs/testes-do-processo.md`.

## `chore/*`, SDD e consulta

Mudança em script, pipeline, hooks ou documentação **não é FF**: use a skill `sdd-scripts` (spec aprovada em `docs/specs/` antes do código, branch `chore/*`; testes no PR e **só admin** abre e mescla). Para só **ver** o estado das FFs, use a skill `ff-status`.
