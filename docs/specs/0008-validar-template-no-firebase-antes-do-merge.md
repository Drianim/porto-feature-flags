---
spec: 0008
titulo: Sintaxe de versão aceita pelo Firebase e validação do template no Firebase antes do merge
status: rascunho
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0008 — Sintaxe de versão aceita pelo Firebase e validação do template no Firebase antes do merge

## Resumo

Como **quem faz PR de FF**, quero **que o template seja validado no próprio Firebase ainda no PR** e que **a condição de versão mínima use a sintaxe que o Firebase aceita**, para que **um erro de sintaxe apareça antes do merge e não no Run, com a `main` já mesclada e diferente do Firebase**.

## Contexto

Os Runs dos PRs #43 e #44 (testes 1 e 2) falharam no passo "Aprovar, publicar ou remover e verificar NÃO PROD" com `[VALIDATION_ERROR]: at line 1, column 35. Was expecting: '.'`. A coluna 35 é o operador `>=` de `app.version >= '2.61.0'`: o Firebase espera um ponto depois de `app.version`, ou seja, a notação com método. O `deploy.js` chama `validateTemplate` antes de publicar, então nada foi publicado, mas a `main` ficou com FFs que o Firebase não aceita.

Por que ninguém viu antes do merge: (1) a "Prévia do deploy" da pipeline de PR é um `--dry-run` local que só monta o plano, sem falar com o Firebase; (2) os testes automatizados usam um avaliador de expressões escrito por nós, que só entende a sintaxe que nós mesmos geramos; (3) a sintaxe de `app.version` veio de uma leitura da documentação que se mostrou inexata e nunca foi confrontada com o Firebase real. Toda FF do repositório tem versão mínima, então o erro trava qualquer publicação.

## Objetivo e fora de escopo

**Objetivo:** (1) as condições de versão passam a usar a sintaxe que o `validateTemplate` real aceita, escolhida por uma sonda contra o Firebase e não por leitura de documentação; (2) o template é validado no Firebase, sem publicar, no `deploy --validate`, no `preflight` (quando há credencial) e na pipeline de PR; (3) o erro do Firebase vem com a condição e a expressão culpadas.

**Fora de escopo:** parar de versionar o catálogo (conflitos entre PRs), preparar reversão quando o `validate` da `main` falha, e bloquear o botão de merge (limite do plano).

## Critérios de aceite

- [ ] CA-1: uma sonda contra o Firebase real (`validateTemplate`, sem publicar) confirma qual forma da expressão de versão é aceita, e a forma escolhida é a que ela aceita.
- [ ] CA-2: `build` gera as condições de versão na sintaxe escolhida, com o mesmo significado (plataforma e versão maior ou igual à mínima, com o percentual quando houver).
- [ ] CA-3: `deploy.js <env> --validate` conecta ao Firebase, monta o template, chama `validateTemplate` e não publica; sai com 0 se o Firebase aceita e com 1 se recusa, mostrando a mensagem do Firebase.
- [ ] CA-4: quando o Firebase aponta linha e coluna, a saída mostra a condição cuja expressão contém aquela posição, com o nome e o texto dela.
- [ ] CA-5: a pipeline de PR ganha o passo "Validar o template no Firebase (sem publicar)", depois da prévia; sem `FIREBASE_SA_KEY_NONPROD` o passo falha em vez de passar às cegas.
- [ ] CA-6: o `preflight` roda a validação no Firebase quando `FIREBASE_SA_KEY_NONPROD` está definida e avisa que a pulou quando não está.
- [ ] CA-7: um teste trava a gramática das expressões geradas: cada condição do plano casa com uma das formas conhecidas (`device.os`, versão, `percent`) ligadas por `&&`, para uma mudança de sintaxe não passar sem o teste acusar.
- [ ] CA-8: README, os templates de código, as skills e o deck citam a sintaxe nova; a spec 0001 recebe uma nota sobre a correção.
- [ ] CA-9: depois do merge, o `verify-sync` fecha em ✓ com a sintaxe nova (o Firebase pode normalizar a expressão; a comparação tem de aceitar o que ele devolve).

## Desenho

- **Sonda primeiro (CA-1):** um script descartável valida no Firebase várias formas da condição de versão (a atual, o método `app.version.>=(['x'])`, operadores `>` e `exactlyMatches`, combinadas com plataforma e percentual) e diz quais são aceitas. A sintaxe adotada é a aceita pela sonda; a candidata mais provável é `app.version.>=(['x.y.z'])`.
- **Uma função para a versão:** `scripts/lib/remote-config.js` ganha `versionCondition(min)`, usada por `build`, o que deixa a sintaxe num só lugar. `diff` compara expressões como texto; se o Firebase normalizar, a comparação normaliza os dois lados.
- **Validação sem publicar:** `scripts/lib/validate-remote.js` (`validateRemote(rc, plan) -> { ok, message, culprit }`) monta o template com `apply`, chama `rc.validateTemplate` e, em erro, procura a condição cuja expressão contém a coluna informada pelo Firebase. `deploy.js --validate` só a chama; o `deploy` normal continua validando antes de publicar.
- **Pipeline e preflight:** um passo novo na pipeline de PR chama `node scripts/deploy.js nonprod --validate` (precisa de `npm install`); o `preflight` roda o mesmo quando há chave.
- **Teste de gramática:** `scripts/lib/remote-config.test.js` passa a exigir que toda expressão do plano case com a gramática conhecida e o avaliador de teste entende a sintaxe nova.

## Arquivos afetados

- `scripts/lib/remote-config.js`, `scripts/lib/remote-config.test.js`: sintaxe de versão e teste de gramática.
- `scripts/lib/validate-remote.js`, `scripts/lib/validate-remote.test.js`: validação no Firebase e localização da condição culpada.
- `scripts/deploy.js`, `scripts/preflight.js`, `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`: `--validate`, preflight e passo do PR.
- `README.md`, `docs/templates/codigo-app/*.md`, `.claude/skills/*/SKILL.md`, `docs/specs/0001-plataforma-e-versao-minima.md`: sintaxe nova e nota.

## Plano de implementação

### Task 1: Sonda no Firebase real

**Files:** script descartável fora do repositório

**Interfaces:** consome `firebase-admin` e `FIREBASE_SA_KEY_NONPROD`; produz a lista de formas aceitas e recusadas.

1. Rodar a sonda com a chave do NÃO PROD.
2. Comando: `FIREBASE_SA_KEY_NONPROD=$(base64 -i chave.json) node probe-versao.js` (esperado: uma linha ACEITA ou RECUSADA por forma; nada é publicado).

### Task 2: Teste de gramática e a sintaxe nova em build

**Files:** `scripts/lib/remote-config.js`, `scripts/lib/remote-config.test.js`

**Interfaces:** produz `versionCondition(min) -> string` na sintaxe aceita pela sonda; `build` a usa; o teste exige que cada condição do plano case com a gramática.

1. Teste: gramática das expressões e o avaliador de teste com a sintaxe nova (falha antes da mudança).
2. Implementação: `versionCondition` e a troca em `build`.
3. Comando: `npm test` (esperado: passa).

### Task 3: Validação no Firebase sem publicar

**Files:** `scripts/lib/validate-remote.js`, `scripts/lib/validate-remote.test.js`, `scripts/deploy.js`

**Interfaces:** consome `apply` de `remote-config.js`; produz `validateRemote(rc, plan) -> { ok, message, culprit }` e a opção `--validate` do `deploy.js`.

1. Teste: cliente falso que aceita, que recusa com "line 1, column 35" e que recusa sem posição; o culpado é a condição certa; nenhuma chamada de escrita.
2. Implementação: a função e a opção.
3. Comando: `npm test`.

### Task 4: Pipeline e preflight

**Files:** `bitbucket-pipelines.yml`, `scripts/lib/pipeline.test.js`, `scripts/preflight.js`

**Interfaces:** consome `deploy.js --validate`; produz o passo "Validar o template no Firebase (sem publicar)" nas quatro chaves da pipeline de PR e a checagem no preflight.

1. Teste: `pipeline.test.js` exige o passo em todas as chaves de `pull-requests`.
2. Implementação: o passo e a linha do preflight.
3. Comando: `npm test`.

### Task 5: Documentação e verificação final

**Files:** `README.md`, `docs/templates/codigo-app/android.md`, `docs/templates/codigo-app/ios.md`, `.claude/skills/feature-flag/SKILL.md`, `.claude/skills/ff-status/SKILL.md`, `docs/specs/0001-plataforma-e-versao-minima.md`, `docs/specs/0008-validar-template-no-firebase-antes-do-merge.md`

**Interfaces:** consome a sintaxe adotada; produz a documentação atualizada.

1. Trocar a sintaxe nos textos e adicionar a nota na spec 0001.
2. Comando: `npm test && npm run validate && npm run specs`; depois abrir o PR e conferir o passo novo.

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- A sonda diz qual forma o Firebase aceita.
- O PR desta mudança passa pelo passo novo "Validar o template no Firebase (sem publicar)" e depois, com um PR de FF (o teste 2 refeito), o Run publica e o `verify-sync` fecha em ✓.
- Um PR com uma expressão inválida de propósito fica **vermelho no passo novo, antes do merge**.

## Riscos e reversão

- **A sintaxe candidata pode estar errada:** por isso a sonda vem primeiro e a validação no PR existe; se a escolhida falhar, o PR mostra o erro do Firebase e a `main` não é atingida.
- **Chave na pipeline de PR:** a variável de repositório `FIREBASE_SA_KEY_NONPROD` já é usada pelo passo de nome único; o passo novo só chama `validateTemplate` (leitura mais validação, sem escrita).
- **Normalização pelo Firebase:** se ele devolver a expressão em outro formato, o `verify-sync` acusaria divergência; o CA-9 cobre isso.
- **Reversão:** reverter o merge da `chore/*` devolve a sintaxe anterior e tira o passo do PR sem afetar FF nem deploy.

## Decisões

- Sonda contra o Firebase real em vez de nova leitura de documentação: a documentação lida foi ambígua e um erro de sintaxe aqui trava toda publicação.
- Validar no PR, não só no Run: o Run acontece depois do merge; o erro tem de aparecer enquanto o PR ainda pode ser corrigido.
- Teste de gramática além da validação real: a validação real depende de credencial e rede, o teste de gramática roda sempre e trava mudança silenciosa de sintaxe.
- Catálogo e reversão no `validate` da `main` ficam para a spec 0009, para não misturar duas correções.
