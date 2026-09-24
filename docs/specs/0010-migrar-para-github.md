---
spec: 0010
titulo: Migrar o repositório para o GitHub (público), com merge bloqueado nativamente até a validação passar
status: rascunho
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0010 — Migrar o repositório para o GitHub (público), com merge bloqueado nativamente até a validação passar

## Resumo

Como **responsável pelo processo de FF**, quero **mover o repositório para o GitHub, como repositório público**, para que **o merge na `main` fique bloqueado de forma nativa até todas as validações passarem** (proteção de branch com checagens obrigatórias), sem conta-bot e sem pagar plano, mantendo todas as regras que já existem.

## Contexto

No Bitbucket do plano atual o botão de Merge não é bloqueado: os PRs #37, #39 e #47 entraram na `main` sem validação. A spec 0009 resolveu com uma conta-bot, que ainda depende de configuração. No GitHub, a proteção de branch com checagens obrigatórias (*Require status checks to pass before merging*) bloqueia o merge de forma nativa, mas em repositório **privado** isso exige plano pago; em repositório **público** vale no plano gratuito, assim como a aprovação manual por ambiente (*required reviewers*). A decisão foi ir para um repositório público. O histórico foi auditado: nenhum segredo em 122 commits; ficam públicos os e-mails dos commits e de `config/`, os nomes Porto e CI&T e o ID do projeto Firebase de teste.

## Objetivo e fora de escopo

**Objetivo:** o repositório passa a viver no GitHub, com a pipeline em GitHub Actions equivalente à do Bitbucket, a `main` protegida (só entra por PR com todas as checagens verdes, sem exceção para admins) e o deploy NÃO PROD atrás de uma aprovação manual. O Bitbucket deixa de ser a fonte.

**Fora de escopo:** PROD real; migrar os PRs e o histórico de pipelines do Bitbucket (ficam lá, só leitura); mudar as regras de FF (escopo, nome único, equipe, versão mínima), que continuam iguais.

## Critérios de aceite

- [ ] CA-1: a pipeline de PR (GitHub Actions, evento `pull_request` para `main`) roda os mesmos passos de hoje por tipo de branch: FF (`feature/`, `update/`, `remove/`, `release/`) com testes, validação, escopo, equipe, nome único, prévia e validação no Firebase; `chore/` e `revert/` com testes, validação e, em `revert/`, só reverts; branch fora do processo reprova.
- [ ] CA-2: a proteção da `main` exige PR, exige todas as checagens da pipeline de PR verdes e a branch atualizada, proíbe push direto e força, e **não tem exceção para admins**; o merge é só por *merge commit* (squash e rebase desligados), porque a reconferência e a reversão usam o commit de merge.
- [ ] CA-3: `chore/*` e `revert/*` só passam se o autor do PR for admin (checagem obrigatória no PR, por login do GitHub em `config/approvers.json`), além da reconferência na `main`.
- [ ] CA-4: a pipeline da `main` (evento `push`) identifica a origem pela mensagem `Merge pull request #N from <dono>/<branch>`, reconfere o merge e, se falhar, prepara a branch `revert/pr-<N>-<origem>` com `GITHUB_TOKEN` (sem chave SSH) e imprime o link de comparação para abrir o PR.
- [ ] CA-5: o deploy NÃO PROD (publicar, remover e `verify-sync`) roda num job ligado ao ambiente `nonprod`, que exige aprovação manual (*required reviewers*): é o equivalente ao Run.
- [ ] CA-6: `sync-nonprod`, `verify-nonprod`, `plan-prod` e `prod-scheduler` viram workflows manuais (`workflow_dispatch`) e, onde fizer sentido, agendados.
- [ ] CA-7: `FIREBASE_SA_KEY_NONPROD` vira secret do repositório no GitHub; workflows de PRs de fork não recebem secrets e não publicam nada; a execução de workflows de colaboradores de fora exige aprovação.
- [ ] CA-8: o gate de aprovação de PROD (`check-approvals`) passa a ler as revisões do PR pela API do GitHub; a identificação de quem é admin e de quem mesclou passa a usar o login do GitHub.
- [ ] CA-9: o merge só pela pipeline com conta-bot (spec 0009: `merge-gate`, `merge-pr`, `mergeBot`) sai do repositório, porque o GitHub bloqueia de forma nativa; a spec 0009 recebe a nota de que foi substituída.
- [ ] CA-10: o template de PR vai para `.github/pull_request_template.md`; o link de PR do `preflight` e da reversão passa a ser do GitHub.
- [ ] CA-11: README, `CLAUDE.md` (mapa e armadilhas), as três skills, os templates e `scripts/processos.test.js` descrevem o GitHub; um teste valida os workflows (YAML válido, jobs obrigatórios, ambiente do deploy, permissões mínimas) no lugar do teste do `bitbucket-pipelines.yml`, que sai.
- [ ] CA-12: verificação real: o repositório público no GitHub com o histórico; um PR vermelho não pode ser mesclado (nem por admin); um PR verde pode; o deploy pede aprovação; o Bitbucket fica arquivado ou só leitura.

## Desenho

- **Workflows:** `.github/workflows/pr.yml` (checagens do PR, um job por checagem, com nomes estáveis, porque a proteção da branch referencia os nomes), `main.yml` (origem, validação, reconferência, reversão e deploy NÃO PROD no ambiente `nonprod`), `sync-nonprod.yml`, `verify-nonprod.yml`, `plan-prod.yml`, `prod-scheduler.yml`. Checkout com histórico completo (`fetch-depth: 0`), porque escopo, equipe e nome único comparam com a `main`. `permissions` mínimas por job (`contents: read`; `contents: write` só no job de reversão).
- **Checagens por tipo de branch num único workflow:** um job inicial calcula o tipo da branch; os demais rodam por condição e, quando não se aplicam, terminam verdes ("não se aplica"), para a proteção da branch poder exigir sempre os mesmos nomes.
- **Origem do merge:** `scripts/ci/merge-source.sh` passa a entender `Merge pull request #N from <dono>/<branch>` (e mantém os formatos do Bitbucket, para o histórico antigo).
- **Admin e quem mesclou:** `config/approvers.json` troca e-mails e UUIDs por `adminLogins` (logins do GitHub); o PR usa `github.event.pull_request.user.login`; a reconferência da `main` usa a API do GitHub (`merged_by` do PR `#N`) com `GITHUB_TOKEN`.
- **Reversão:** o job de reversão empurra com o `GITHUB_TOKEN` (`contents: write`) e imprime `https://github.com/<dono>/<repo>/compare/main...<branch>?expand=1`.
- **Proteção da `main`:** configurada à mão no GitHub (ou por *ruleset*), documentada no README com a lista exata de checagens obrigatórias.
- **Segurança de repositório público:** usar `pull_request` (nunca `pull_request_target` com checkout do código do PR); secrets só em branches do próprio repositório; aprovação para rodar workflows de colaboradores de fora.
- **Transição:** empurrar todo o histórico para o GitHub; o Bitbucket fica arquivado (ou só leitura) com um aviso no README apontando o GitHub.

## Arquivos afetados

- `.github/workflows/*.yml` (novos); `bitbucket-pipelines.yml` (sai).
- `scripts/ci/merge-source.sh`, `scripts/ci/revert-merge.sh`, `scripts/ci/recheck-merge.sh`, `scripts/ci/run-if-source.sh` e testes.
- `scripts/lib/approvals.js`, `scripts/check-approvals.js`, `scripts/lib/merger.js`, `scripts/check-merger.js`, `scripts/lib/preflight.js` e testes.
- `scripts/lib/merge-gate.js`, `scripts/ci/merge-pr.js` e testes (saem); `scripts/lib/pipeline.test.js` vira o teste dos workflows.
- `config/approvers.json`, `.github/pull_request_template.md` (vindo de `.bitbucket/`).
- `README.md`, `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `docs/templates/codigo-app/README.md`, `scripts/processos.test.js`, `docs/specs/0009-merge-so-pela-pipeline.md`.

## Plano de implementação

### Task 1: Origem do merge e link de PR do GitHub

**Files:** `scripts/ci/merge-source.sh`, `scripts/ci/merge-source.test.js`, `scripts/lib/preflight.js`, `scripts/lib/preflight.test.js`

**Interfaces:** `merge-source.sh` imprime a branch de origem também para `Merge pull request #N from <dono>/<branch>`; `prLink(remoteUrl, branch)` devolve o link de comparação do GitHub para remotos `github.com`.

1. Teste: os dois formatos de mensagem e os links do GitHub (SSH e HTTPS).
2. Implementação: o `sed` e o `prLink`.
3. Comando: `npm test`.

### Task 2: Admin, quem mesclou e aprovações pela API do GitHub

**Files:** `config/approvers.json`, `scripts/lib/merger.js`, `scripts/check-merger.js`, `scripts/lib/approvals.js`, `scripts/check-approvals.js` e testes

**Interfaces:** `approvers.json` com `adminLogins` e `platformLogins`; `evaluate({ source, mergedBy, adminLogins })`; `check-merger.js` lê `merged_by` pela API (`GITHUB_TOKEN`, `GITHUB_REPOSITORY`); o gate de PROD lê `GET /repos/<dono>/<repo>/pulls/<n>/reviews`.

1. Teste: cliente HTTP falso; admin, não admin, bot do GitHub, revisões aprovadas e do próprio autor.
2. Implementação: as trocas.
3. Comando: `npm test`.

### Task 3: Reversão com GITHUB_TOKEN

**Files:** `scripts/ci/revert-merge.sh`, `scripts/ci/revert-merge.test.js`

**Interfaces:** o script empurra para `origin` (credencial do checkout) e imprime o link `compare`; mantém "nunca falha o passo" e "não duplica".

1. Teste: repositório temporário com remoto local, como hoje, conferindo o link do GitHub.
2. Implementação: remoto e link.
3. Comando: `npm test`.

### Task 4: Workflows do GitHub Actions

**Files:** `.github/workflows/pr.yml`, `main.yml`, `sync-nonprod.yml`, `verify-nonprod.yml`, `plan-prod.yml`, `prod-scheduler.yml`, `scripts/lib/pipeline.test.js`; sai `bitbucket-pipelines.yml`; saem `scripts/lib/merge-gate.js`, `scripts/ci/merge-pr.js` e testes

**Interfaces:** jobs do PR com nomes estáveis (a lista que a proteção da `main` exige); job de deploy com `environment: nonprod`; `permissions` mínimas.

1. Teste: YAML válido; o PR tem os jobs obrigatórios; o deploy usa o ambiente com aprovação; só a reversão tem escrita; nenhum `pull_request_target`.
2. Implementação: os workflows.
3. Comando: `npm test`.

### Task 5: Documentação, publicação e verificação real

**Files:** `.github/pull_request_template.md`, `README.md`, `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `docs/templates/codigo-app/README.md`, `scripts/processos.test.js`, `docs/specs/0009-merge-so-pela-pipeline.md`, `docs/specs/0010-migrar-para-github.md`

**Interfaces:** consome as tarefas anteriores; produz a configuração passo a passo no GitHub (repositório, secret, ambiente, proteção da `main`, configurações de merge e de workflows de fora).

1. Documentar; mover o template; atualizar o mapa e o teste de cobertura.
2. Comando: `npm test && npm run validate && npm run specs`; depois, a verificação real do CA-12.

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- No GitHub: um PR vermelho fica sem botão de merge, inclusive para admin; um PR verde pode ser mesclado; o deploy fica esperando aprovação no ambiente `nonprod`; um merge que falha na reconferência gera a branch `revert/*` com o link.
- O teste 3 (sintaxe de versão) roda de novo no GitHub e fecha a pendência do Firebase.

## Riscos e reversão

- **Conteúdo público:** e-mails dos commits e de `config/`, nomes Porto e CI&T, ID do projeto Firebase de teste e as regras do processo ficam públicos. Nenhum segredo está no histórico (auditado); segredos só como secrets do GitHub.
- **Workflows de forks:** PRs de fora rodam sem secrets e exigem aprovação para rodar; o deploy só roda na `main`.
- **Nomes de checagens:** a proteção da `main` referencia os nomes dos jobs; renomear um job sem atualizar a proteção trava os merges. O README lista os nomes.
- **Reversão:** o Bitbucket continua com o histórico até ser arquivado; voltar é reativar a pipeline do Bitbucket a partir do último commit dele.

## Decisões

- GitHub público em vez de Bitbucket com conta-bot: o bloqueio é nativo, vale também para admins e dispensa uma conta extra e um token de escrita.
- Checagem de admin no PR para `chore/*` e `revert/*` (autor do PR), além da reconferência na `main`: no GitHub não dá para restringir quem mescla por branch de origem, mas uma checagem obrigatória que reprova bloqueia o merge.
- Tirar o merge por conta-bot (spec 0009) em vez de manter: com o bloqueio nativo ele seria código morto e uma credencial a menos para guardar.
- Um workflow de PR com todos os jobs sempre presentes (verdes quando não se aplicam): a proteção da branch exige uma lista fixa de checagens.
