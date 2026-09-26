---
spec: 0027
titulo: flags-menu.js roda o catálogo e commita antes de perguntar se envia
status: implementada
criado: 2026-09-26
atualizado: 2026-09-26
---

# Spec 0027 — flags-menu.js roda o catálogo e commita antes de perguntar se envia

## Resumo

Como **quem usa `npm run flags` para criar uma FF**, quero **que o menu rode `npm run catalog` e commite as
mudanças antes de perguntar se deve enviar (`git push`)**, para que **responder "s" realmente envie um commit com
a FF e o catálogo em dia**, em vez de falhar no preflight por catálogo desatualizado e nada commitado.

## Contexto

`scripts/flags-menu.js` (`criarFF`) cria a branch `feature/<key>` e chama `scripts/new-flag.js`, que grava
`flags/<key>.json` e `env/nonprod/<key>.json` e só **imprime** a sugestão `Rode: npm run catalog && npm run
validate` (linha 76 de `new-flag.js`) — não executa nada disso. Em seguida `criarFF` já pergunta "Enviar (git
push) e abrir o PR agora?" sem nunca ter rodado `npm run catalog`, `git add` ou `git commit`.

Reproduzido nesta sessão: ao responder "s" (enviar), o preflight (chamado por `npm run preflight`/`npm run pr`,
ou aqui diretamente pelo push feito por `criarFF`) mostra:
```
! há mudanças não commitadas: o PR só leva o que estiver commitado.
✗ Catálogo em dia
    ✗ catalog/plataforma/keys.json desatualizado. Rode: npm run catalog
✗ 1 checagem(ns) falharam: corrija antes de abrir o PR.
Push bloqueado pelo preflight.
```
— e o push falha (`error: failed to push some refs`), porque nada foi commitado (a branch aponta pro mesmo commit
de `main`) e o catálogo da equipe escolhida está desatualizado (a spec 0026 já mudou `catalog/keys.json` para
`catalog/<equipe>/keys.json`, um arquivo por equipe, mas `flags-menu.js` nunca chamava `npm run catalog` mesmo
antes disso — o bug é anterior à 0026, só ficou mais visível porque agora falta o arquivo da equipe escolhida).

`scripts/flags-menu.test.js` já testa o fluxo até a criação da FF e da branch, e testa que responder "N" não
empurra (`Branch pronta localmente`) — mas **nenhum teste hoje exercita a resposta "s"**, por isso o bug passou
despercebido.

## Objetivo e fora de escopo

**Objetivo:**
1. Depois que `new-flag.js` roda com sucesso, `criarFF` roda `npm run catalog` (equivalente a `node
   scripts/catalog.js`) automaticamente, sempre — não só quando o usuário decide enviar.
2. Em seguida, `criarFF` faz `git add` dos arquivos tocados (`flags/<key>.json`, `env/nonprod/<key>.json`,
   `catalog/<equipe>/keys.json`) e um `git commit` com mensagem padrão (ex.: `feat: cria FF <key>`), antes de
   perguntar se deve enviar.
3. A pergunta "Enviar (git push) e abrir o PR agora?" continua existindo; responder "s" agora encontra um commit
   de verdade para empurrar, e o preflight (se rodado) não acusa catálogo desatualizado nem mudança não
   commitada.
4. Se o commit falhar (ex.: `git commit` sem `user.name`/`user.email` configurado), o menu avisa e para, sem
   perguntar sobre envio (mensagem de erro do próprio git, sem inventar diagnóstico).

**Fora de escopo:** rodar o preflight completo dentro do menu (o usuário já tem `npm run preflight`/`npm run pr`
para isso, e a spec 0025/0026 não pediram unificar); implementar as opções 2 (alterar) e 3 (remover) do menu
(continuam `ainda não implementado`, como hoje); mudar `new-flag.js` (continua só gravando os arquivos e
imprimindo a sugestão — a sugestão em si fica desatualizada por esta spec, mas só é removida se atrapalhar; ver
Desenho).

## Critérios de aceite

- [x] CA-1: com resposta "s" ao final, `flags-menu.js` deixa a branch com um commit contendo `flags/<key>.json`,
      `env/nonprod/<key>.json` e `catalog/<equipe>/keys.json` (equipe escolhida) — `git show --stat HEAD` lista os
      três arquivos. Evidência: `scripts/flags-menu.test.js` — "CA-1/CA-2: com resposta \"s\", o commit levado já
      existe antes do push e o catálogo bate com o gerado".
- [x] CA-2: `catalog/<equipe>/keys.json` gerado reflete a FF criada (mesmo conteúdo que `node scripts/catalog.js`
      geraria à parte). Evidência: mesmo teste do CA-1 (`r.catalogs['squad-b'].total === 1`).
- [x] CA-3: com resposta "N", o `git push` não roda (continua `Branch pronta localmente`); o catálogo e o commit
      já rodaram antes da pergunta (ver CA-4) — só o envio é que depende da resposta. Evidência: teste "opção 1:
      ...e sem \"s\" não empurra" (mantido) e "CA-4" (abaixo).
- [x] CA-4: mesmo respondendo "N" ao final, o catálogo já foi gerado e commitado antes da pergunta. Evidência:
      `scripts/flags-menu.test.js` — "CA-4: mesmo respondendo \"N\" ao final, o catálogo já foi gerado e
      committado (só o push é que não roda)" (confere `git show --name-only HEAD`).
- [x] CA-5: se `git commit` falhar (simulado no teste: repo sem `user.email`/`user.name`, `HOME` isolado e
      `user.useConfigOnly=true`), o menu imprime a saída de erro do git e **não** pergunta sobre enviar (nem chama
      `git push`). Evidência: `scripts/flags-menu.test.js` — "CA-5: sem identidade de git configurada...".
- [x] CA-6: `npm test` (292/292), `npm run validate` e `npm run specs` passam.

## Desenho

**`scripts/flags-menu.js`, função `criarFF`:** logo depois de `new-flag.js` rodar com sucesso (`criado.status ===
0`) e antes da pergunta de push:
1. Rodar `node scripts/catalog.js` (mesmo helper `sh` já usado) — se falhar, imprimir a saída e parar (não deveria
   acontecer, já que `new-flag.js` validou os dados, mas segue o mesmo padrão defensivo do resto do arquivo).
2. `git add flags/<key>.json env/nonprod/<key>.json catalog/<team>/keys.json` (caminhos exatos, não `git add -A`,
   para não commitar sujeira de outro lugar).
3. `git commit -m "feat: cria FF <key>"` — se falhar (`status !== 0`), imprimir `commit.stderr || commit.stdout` e
   `return` (sem perguntar sobre push).
4. Só então a pergunta "Enviar (git push) e abrir o PR agora?" (inalterada) e o fluxo de push existente.

`new-flag.js` não muda: sua sugestão de rodar `npm run catalog && npm run validate` manualmente continua útil
para quem cria a FF por fora do menu (fluxo manual descrito no README); o menu só automatiza os mesmos passos.

## Arquivos afetados

- `scripts/flags-menu.js`: `criarFF` passa a rodar catálogo + commit antes da pergunta de push.
- `scripts/flags-menu.test.js`: novos testes para CA-1, CA-2, CA-4, CA-5 (a resposta "s" nunca era exercitada
  antes).

## Plano de implementação

### Task 1: catálogo + commit automáticos em `criarFF`

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`

**Interfaces:** usa `sh` (helper já existente em `flags-menu.js`) para `node scripts/catalog.js`, `git add` e `git
commit`; nenhuma função nova exportada.

1. Teste: responder ao menu até o fim com "N" (não enviar) e conferir, via `git log -1 --stat` no repo temporário,
   que o commit já existe com os três arquivos (`flags/`, `env/nonprod/`, `catalog/<equipe>/`).
2. Teste: repo com uma equipe e uma FF prévia de outra equipe — conferir que o `catalog/<equipe-nova>/keys.json`
   committed bate com o que `node scripts/catalog.js` geraria isoladamente (mesmo conteúdo).
3. Teste: repo sem `git config user.email`/`user.name` (nem local nem global, via `HOME` isolado no teste) — o
   commit falha, o menu imprime a saída de erro do git e não pergunta sobre push (`assert.doesNotMatch(r.out,
   /Enviar \(git push\)/)`).
4. Implementação: adicionar os três passos (catálogo, add, commit) em `criarFF`, entre a criação da FF e a
   pergunta de push, com early-return em qualquer falha.
5. Comando: `npm test` (esperado: os 3 novos testes e os já existentes passam).

## Verificação

- `npm test` passa, incluindo os testes novos de `scripts/flags-menu.test.js`.
- `npm run validate` e `npm run specs` passam.
- Manual: `npm run flags`, criar uma FF, responder "s" ao final — o push agora leva um commit real e o preflight
  (rodado à parte) não acusa catálogo desatualizado nem mudança não commitada.

## Riscos e reversão

- Commit automático "esconde" a etapa de revisão manual que existia antes (usuário só via a sugestão de texto):
  mitigado porque o conteúdo do commit é exatamente os arquivos que o próprio menu acabou de gerar a partir das
  respostas do usuário — nada além disso entra.
- Falha de `git commit` (config ausente) já tratada explicitamente (CA-5): o usuário vê o erro do git e decide o
  que fazer, sem o menu tentar "consertar" a configuração do git por conta própria.
- Reversão: reverter o commit desta spec volta ao comportamento atual (sugestão só em texto, sem automação).

## Decisões

- Catálogo e commit rodam **sempre**, mesmo respondendo "N" ao final: a resposta "N" só evita o `git push`, não
  o trabalho de deixar a branch local pronta (que já era a promessa da mensagem "Branch pronta localmente" —
  hoje essa frase é enganosa, porque a branch não tinha nem commit).
- `git add` explícito por caminho (não `-A`): evita capturar qualquer outro arquivo que por acaso esteja solto no
  working tree de quem roda o menu.
