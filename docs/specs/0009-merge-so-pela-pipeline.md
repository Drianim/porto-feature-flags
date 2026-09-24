---
spec: 0009
titulo: Merge só pela pipeline — o botão de merge não existe antes de a validação passar
status: rascunho
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0009 — Merge só pela pipeline: o botão de merge não existe antes de a validação passar

## Resumo

Como **responsável pelo processo de FF**, quero **que nenhum PR possa ser mesclado na `main` antes de a pipeline do PR validar tudo**, para que **um PR vermelho, ou um PR mesclado antes de a pipeline começar, nunca chegue à `main`**.

## Contexto

O plano atual do Bitbucket não bloqueia o botão de Merge: o merge check só avisa (bloquear exige o Premium). Na prática: os PRs #37 e #39, vermelhos, foram mesclados e deixaram a `main` inválida até uma reversão; o PR #47 foi mesclado 13 segundos depois de criado, com **0 builds**, então a validação no Firebase (spec 0008) nunca rodou. A trava por rascunho considerada antes não resolve: um PR aberto normal fica mesclável até a trava rodar, e **Mark as ready** a desfaz.

O Bitbucket permite, em **todos os planos**, restringir quem pode mesclar numa branch (*Branch permissions → Merge access via pull requests → Only specific people or groups*). Se só uma conta-bot pode mesclar na `main`, as pessoas não têm botão de Merge; quem mescla é a pipeline, depois de validar.

## Objetivo e fora de escopo

**Objetivo:** a `main` só recebe merge feito pela pipeline do PR, num último passo manual "Mesclar o PR" que só existe depois de todos os passos de validação passarem; toda branch que pode ir para a `main` (`feature/`, `update/`, `remove/`, `release/`, `chore/`, `revert/`) tem pipeline de PR com esse passo.

**Fora de escopo:** assinar Standard (merge queue) ou Premium (merge check com bloqueio); mesclar sem um clique humano; revisar código automaticamente; PROD real (continua só validando).

## Critérios de aceite

- [ ] CA-1: toda chave de `pull-requests` (`feature/**`, `update/**`, `remove/**`, `release/**`, `chore/**`, `revert/**`) termina com o passo manual "Mesclar o PR (depois de validar)", e esse passo só aparece se todos os anteriores passaram (é o último e o Bitbucket para no primeiro que falha).
- [ ] CA-2: `chore/**` e `revert/**` passam a ter pipeline de PR: testes, `validate` e formato das specs (e, em `revert/**`, que a mudança é um revert de um merge da `main`); `feature/`, `update/`, `remove/` e `release/` mantêm todos os passos atuais.
- [ ] CA-3: o passo de merge recusa se: o destino não é `main`; o PR não está aberto; o commit mais recente do PR não é o commit que a pipeline validou (`BITBUCKET_COMMIT`); o número de aprovações de outras pessoas é menor que o mínimo configurado; em `chore/**` e `revert/**`, quem clicou em Run não é admin.
- [ ] CA-4: o merge é feito pela API com estratégia `merge_commit` (commit de merge com dois pais) e **sem mensagem própria**, para manter `Merged in <branch> (pull request #N)`, que a reconferência da `main` e a reversão usam.
- [ ] CA-5: quem clicou em Run é identificado pela pipeline (`BITBUCKET_STEP_TRIGGERER_UUID`), comparado com a lista de admins por UUID em `config/approvers.json`.
- [ ] CA-6: `config/approvers.json` ganha `mergeBot` (e-mail do commit de merge da conta-bot), `adminUuids` e `minApprovals` (PoC: `0`, porque hoje só há uma pessoa); o `validate` reprova formato inválido.
- [ ] CA-7: a reconferência da `main` aceita como autor do merge a conta-bot (e os admins), e continua reprovando merge de `chore/*` feito por qualquer outra pessoa.
- [ ] CA-8: o token da conta-bot só entra por variável secured (`BB_MERGE_BOT_TOKEN`, com `BB_MERGE_BOT_USER`) e nunca aparece no log, nem em erro; sem ele, o passo falha dizendo como configurar.
- [ ] CA-9: a lógica de decisão e a chamada à API são testadas com um cliente HTTP falso (cada motivo de recusa do CA-3, merge feito com a estratégia e sem mensagem, erro da API, token ausente e oculto, PR já mesclado).
- [ ] CA-10: README, `CLAUDE.md` (mapa dos processos), a skill `feature-flag`, o template de PR e `scripts/processos.test.js` descrevem o novo fluxo e a configuração (conta-bot, token, permissão de merge da `main`); a spec 0002 recebe a nota de que `chore/*` passou a ter pipeline de PR.
- [ ] CA-11: verificação real: com a restrição configurada, o botão Merge fica indisponível no PR para as pessoas; um PR vermelho não mostra o passo "Mesclar"; um PR verde mostra o passo e, ao clicar em Run, é mesclado com a mensagem padrão e a reconferência da `main` passa.

## Desenho

- **Permissão no Bitbucket (configuração, não código):** na `main`, *Merge access via pull requests* = só a conta-bot; *Write access* = ninguém (sem push direto). A documentação diz que essas opções existem em todos os planos. **A confirmar no teste real:** se administradores do repositório também ficam sem o botão; se não ficarem, o bloqueio vale para todas as pessoas, exceto os admins, e o README diz isso.
- **Lógica pura** em `scripts/lib/merge-gate.js`: `decide({ pr, validatedCommit, destination, kind, triggererUuid, config })` devolve `{ ok, problems }` com as regras do CA-3; `mergePr({ fetch, workspace, repo, prId, user, token })` faz `POST .../pullrequests/<id>/merge` com `{ "merge_strategy": "merge_commit", "close_source_branch": true }`, sem `message`.
- **Comando** `scripts/ci/merge-pr.js`: lê as variáveis do Pipelines (`BITBUCKET_PR_ID`, `BITBUCKET_PR_DESTINATION_BRANCH`, `BITBUCKET_BRANCH`, `BITBUCKET_COMMIT`, `BITBUCKET_STEP_TRIGGERER_UUID`, `BITBUCKET_WORKSPACE`, `BITBUCKET_REPO_SLUG`), lê o PR pela API, decide, mescla e imprime o resultado.
- **Pipeline:** em cada chave de `pull-requests`, um último passo `trigger: manual` "Mesclar o PR (depois de validar)" que roda `node scripts/ci/merge-pr.js`. `chore/**` e `revert/**` ganham um passo de validação (testes, `validate`, `specs`) antes dele.
- **Reconferência da `main`:** `check-merger` aceita a conta-bot (`mergeBot`) além dos admins; a regra de equipe (`check-ownership`) continua pelos autores dos commits.
- **Conta-bot:** uma conta do Bitbucket com escrita no repositório e um API token de escrita em PR (Atlassian API token com escopos de leitura e escrita de pull request). **A confirmar:** se um *repository access token* pode ser listado na restrição de merge; se puder, dispensa a conta-bot.

## Arquivos afetados

- `scripts/lib/merge-gate.js`, `scripts/lib/merge-gate.test.js`, `scripts/ci/merge-pr.js`: decisão e merge.
- `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`: passo de merge em todas as chaves; pipelines de `chore/**` e `revert/**`.
- `config/approvers.json`, `scripts/validate.js`, `scripts/lib/merger.js`, `scripts/check-merger.js` e testes: `mergeBot`, `adminUuids`, `minApprovals`.
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`, `scripts/processos.test.js`, `docs/specs/0002-chore-sem-pipeline-e-merge-por-admin.md`: documentação.

## Plano de implementação

### Task 1: Decisão do merge

**Files:** `scripts/lib/merge-gate.js`, `scripts/lib/merge-gate.test.js`

**Interfaces:** produz `decide({ pr, validatedCommit, destination, kind, triggererUuid, config }) -> { ok, problems }`, onde `pr` é o JSON da API do Bitbucket (`state`, `source.commit.hash`, `author.uuid`, `participants[].approved`).

1. Teste: cada motivo de recusa do CA-3 e o caso aprovado.
2. Implementação: a função.
3. Comando: `node --test scripts/lib/merge-gate.test.js` (esperado: passa).

### Task 2: Chamada de merge e comando da pipeline

**Files:** `scripts/lib/merge-gate.js`, `scripts/lib/merge-gate.test.js`, `scripts/ci/merge-pr.js`

**Interfaces:** produz `mergePr({ fetch, workspace, repo, prId, user, token }) -> { ok, message, mergeCommit }` e o comando `node scripts/ci/merge-pr.js` (código 0 se mesclou, 1 se recusou ou falhou).

1. Teste: cliente HTTP falso confere método, URL, corpo (estratégia, sem mensagem), erro da API, PR já mesclado, token ausente e nunca impresso.
2. Implementação: a função e o comando.
3. Comando: `npm test`.

### Task 3: Configuração e reconferência

**Files:** `config/approvers.json`, `scripts/validate.js`, `scripts/lib/merger.js`, `scripts/check-merger.js`, `scripts/lib/merger.test.js`, `scripts/validate.test.js`

**Interfaces:** produz os campos `mergeBot`, `adminUuids` e `minApprovals`; `evaluate({ source, mergerEmail, admins, mergeBot })` aceita a conta-bot.

1. Teste: bot aceito; outra pessoa em `chore/*` reprovada; formato inválido reprovado no `validate`.
2. Implementação: as mudanças.
3. Comando: `npm test`.

### Task 4: Pipeline

**Files:** `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`

**Interfaces:** consome `scripts/ci/merge-pr.js`; produz o passo manual final em todas as chaves de `pull-requests` e as chaves `chore/**` e `revert/**`.

1. Teste: `pipeline.test.js` exige as seis chaves, o passo de merge como último e manual em cada uma, e o passo de validação antes dele.
2. Implementação: o YAML.
3. Comando: `npm test`.

### Task 5: Documentação e verificação real

**Files:** `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`, `scripts/processos.test.js`, `docs/specs/0002-chore-sem-pipeline-e-merge-por-admin.md`, `docs/specs/0009-merge-so-pela-pipeline.md`

**Interfaces:** consome o comportamento das tarefas anteriores; produz a configuração passo a passo e o processo "Merge só pela pipeline" no mapa e no teste de cobertura.

1. Documentar e atualizar o registro de processos.
2. Comando: `npm test && npm run validate && npm run specs`; depois, a verificação real do CA-11.

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- Real (CA-11): configurar a conta-bot, o token e a restrição; abrir um PR vermelho (sem passo "Mesclar") e um verde (com o passo; o Run mescla, com a mensagem padrão, e a reconferência da `main` aceita o bot).
- Conferir se um admin do repositório ainda vê o botão de Merge e registrar o resultado.

## Riscos e reversão

- **Admins podem continuar com o botão:** se a restrição não valer para eles, o bloqueio cobre todas as outras pessoas; o risco residual fica documentado.
- **Conta-bot e token:** mais uma conta (conta no limite de usuários do plano) e um segredo com escrita em PR; variável secured, nunca impressa, escopo mínimo.
- **Ordem da configuração:** a restrição no Bitbucket só deve ser ligada depois do merge desta mudança; senão nenhum PR (nem este) consegue ser mesclado. Se isso acontecer, o admin desliga a restrição, mescla e liga de novo.
- **Reversão:** desligar a restrição de merge no Bitbucket devolve o botão às pessoas na hora; reverter o merge da `chore/*` tira os passos.

## Decisões

- Merge só pela pipeline em vez de trava por rascunho: o rascunho deixa uma janela (o #47 foi mesclado em 13 s) e é desfeito por Mark as ready.
- Último passo manual, não merge automático: alguém ainda decide mesclar, mas só depois de tudo passar.
- Commit validado = commit mesclado: sem isso, um push depois da validação seria mesclado sem ser validado.
- Mensagem padrão do Bitbucket no merge: a reconferência e a reversão dependem dela.
- `minApprovals` configurável e `0` na PoC: com uma pessoa só, exigir aprovação de outra pessoa impediria qualquer merge.
