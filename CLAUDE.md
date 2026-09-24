# CLAUDE.md — porto-feature-flags

Repositório que governa as Feature Flags (Firebase Remote Config) por PR e pipeline do Bitbucket. **Leia o
[README.md](README.md)** para o quadro completo (o que faz, arquitetura, processo, configuração). Este arquivo
resume o que um Claude Code precisa saber antes de mexer.

## Duas naturezas de mudança (não misture)

| Mudança | Como fazer |
|---|---|
| **FF** (`flags/`, `env/`, `rm/`): criar, alterar, remover, PROD | branch `feature/*`, `update/*`, `remove/*` ou `release/*`; skill `feature-flag`; **sem SDD** |
| **Scripts, pipeline, hooks, docs, regras em `config/`** | **SDD**: spec aprovada em `docs/specs/` antes do código; branch `chore/*`; skill `sdd-scripts` |

Se o pedido for de script e não houver spec aprovada, **escreva a spec primeiro** (`docs/sdd/README.md`) e peça a
aprovação. Não escreva código de produção antes disso.

## Comandos

```bash
npm test                 # todos os testes (node:test); inclui o formato das specs
npm run validate         # FFs, RMs e catálogo em dia
npm run specs            # formato das specs de docs/specs/
npm run catalog          # regenera catalog/keys.json (rode ao mexer em flags/)
npm run preflight        # as checagens do PR, antes de abrir o PR (npm run pr também empurra a branch)
node scripts/deploy.js nonprod --dry-run   # o que seria publicado, sem publicar
```

## Regras que não se negociam

- **Nunca** grave credencial no repositório e **não procure** chave do Firebase em histórico, disco ou variáveis: se
  precisar, peça ao usuário para exportar `FIREBASE_SA_KEY_NONPROD` (JSON do service account em base64).
- **Não faça `git push` nem abra PR** sem o usuário pedir. Não mescle nada.
- **Nunca invente** dado de negócio: data/hora de PROD, aprovadores, plataformas, versão mínima, dono, criticidade.
  Pergunte.
- Nada é editado no console do Firebase: o repositório é a fonte única e a `main` deve ser idêntica ao Remote Config
  NÃO PROD (`verify-sync`).
- Só **admin** (`config/approvers.json`) mescla `chore/*`; `chore/*` não roda pipeline de PR nem publica.
- Toda FF tem `platforms` (`android|ios|ambas`) e `minVersion` (`x.y.z`), sem exceção.

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
- O merge check do plano atual **não bloqueia** o botão de merge; a barreira real é a reconferência na `main`.
- *Access keys* do repositório são **somente leitura**: o push da reversão automática exige chave SSH da conta ou do
  workspace (ou token de repositório por HTTPS).
- `catalog/keys.json` desatualizado quebra a pipeline: rode `npm run catalog`.
- Step sem mudança na pasta da `condition: changesets` aparece como "skipped" (é de propósito).
