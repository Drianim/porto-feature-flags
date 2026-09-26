---
spec: 0024
titulo: npm run flags — perguntar a versão mínima por plataforma quando for "ambas"
status: implementada
criado: 2026-09-26
atualizado: 2026-09-26
---

# Spec 0024 — npm run flags — perguntar a versão mínima por plataforma quando for "ambas"

## Resumo

Como **quem cria uma FF pelo `npm run flags`**, quero **que, quando `platforms` for `ambas`, o menu pergunte a
versão mínima do app separadamente para ios e para android (em vez de uma única versão valendo para as duas)**,
para que **cada plataforma possa ativar a partir de uma versão diferente do app, sem precisar de um `update/*`
depois só para separar a versão mínima por plataforma.**

## Contexto

Hoje (spec 0023) `scripts/flags-menu.js` pergunta a versão mínima uma única vez, sempre com o mesmo texto
`Versão do app para ativar (x.y.z): `, e passa o valor como `--min-version <valor>` para `new-flag.js`, que grava
`flags/<key>.json` com `minVersion: "<valor>"` (string), valendo para todas as plataformas da FF — mesmo quando
`platforms: "ambas"`.

`scripts/lib/flags.js` já suporta `minVersion` como objeto por plataforma (`targetingErrors`, linhas 29-37): se
`minVersion` for um objeto, exige que as chaves batam exatamente com `platformsOf(flag)` (ex.: `{ios, android}`
para `ambas`); `minVersionFor(flag, platform)` já sabe ler os dois formatos. Só falta o `new-flag.js` (CLI) e o
`flags-menu.js` (menu) oferecerem um jeito de gravar esse objeto — hoje só existe o caminho de uma string única.

## Objetivo e fora de escopo

**Objetivo:**
1. No menu, quando `platforms === "ambas"`, a versão mínima é perguntada duas vezes: "Versão mínima do app para
   ios (x.y.z): " e depois "Versão mínima do app para android (x.y.z): ", nessa ordem (mesma ordem já usada na
   pergunta de ativar por plataforma da spec 0023); cada resposta é validada no formato `x.y.z` e repete a
   pergunta até um valor válido (mesmo padrão de "repete até válido" das specs 0022/0023).
2. Quando `platforms` é `"ios"` ou `"android"` (uma só plataforma), o menu continua com uma única pergunta
   "Versão do app para ativar (x.y.z): ", sem mudança de texto nem de comportamento.
3. `new-flag.js` ganha os argumentos opcionais `--min-version-ios <x.y.z>` e `--min-version-android <x.y.z>`,
   como alternativa a `--min-version <x.y.z>`: usar só um deles por plataforma de `platformsOf({ platforms })`
   grava `minVersion` como objeto (`{ ios: "...", android: "..." }`); usar `--min-version` sozinho grava a string,
   como hoje. Misturar as duas formas, ou informar `--min-version-<p>` para uma plataforma fora de
   `platformsOf({ platforms })`, ou faltar uma das duas quando `ambas`, é erro claro, sem criar arquivo.

**Fora de escopo:** chaves `rc_`, mesma regra do objetivo 1 (a pergunta de versão é sobre a FF inteira, não sobre
o tipo de chave — já se aplica igual a `ft_` e `rc_`, sem diferenciar); qualquer mudança na pergunta "Ativar em
<plataforma>?" (spec 0023, já fechada) ou na pergunta de plataformas (`perguntaPlataformas`, spec 0023); qualquer
mudança em `targetingErrors`/`minVersionFor` (`scripts/lib/flags.js`) — já suportam o formato objeto, sem
alteração necessária.

## Critérios de aceite

- [x] CA-1: com `platforms === "ambas"`, o menu pergunta "Versão mínima do app para ios (x.y.z): " e depois
      "Versão mínima do app para android (x.y.z): ", nessa ordem; uma resposta fora do formato `x.y.z` mostra um
      erro e repete a mesma pergunta, sem avançar.
- [x] CA-2: com `platforms` igual a `"ios"` ou `"android"`, o menu pergunta uma única vez "Versão do app para
      ativar (x.y.z): ", igual ao comportamento atual (sem regressão).
- [x] CA-3: `new-flag.js` aceita `--min-version-ios <x.y.z>` e `--min-version-android <x.y.z>` (opcionais); usar um
      para cada plataforma de `platformsOf({ platforms })` (nem mais, nem menos) grava
      `flags/<key>.json` com `minVersion: { <plataforma>: "<x.y.z>", ... }`.
- [x] CA-4: usar `--min-version` junto com qualquer `--min-version-<p>` é erro; faltar um `--min-version-<p>` para
      alguma plataforma de `platformsOf({ platforms })` quando pelo menos um foi informado é erro; informar
      `--min-version-<p>` para uma plataforma fora de `platformsOf({ platforms })` é erro; qualquer um desses
      erros é uma mensagem clara, sem criar `flags/<key>.json` nem `env/nonprod/<key>.json`.
- [x] CA-5: rodando o menu com `ambas`, versões diferentes por plataforma (ex.: ios `2.61.0`, android `2.63.0`),
      `minVersionFor(flag, 'ios')` e `minVersionFor(flag, 'android')` (já existentes em `scripts/lib/flags.js`)
      devolvem cada valor correto; `npm run validate` passa.
- [x] CA-6: `npm test` cobre CA-1 a CA-4 e passa; `npm run specs` passa.

## Desenho

**`scripts/lib/flags.js`:** nenhuma mudança — `targetingErrors`/`minVersionFor` já tratam `minVersion` como string
ou objeto por plataforma.

**`scripts/flags-menu.js`:**
- Nova função `perguntaVersaoMinima(rl, platforms)`: para cada plataforma de `platformsOf({ platforms })`
  (`scripts/lib/flags.js`), pergunta a versão (texto varia: "Versão mínima do app para <plataforma> (x.y.z): "
  quando há mais de uma plataforma; "Versão do app para ativar (x.y.z): " quando há só uma), valida contra
  `VERSION_RE` (`scripts/lib/flags.js`, já existe) e repete até um valor válido (mesmo laço de
  `perguntaPlataformas`); devolve `{ ios?: string, android?: string }` com uma chave por plataforma perguntada.
- Em `criarFF`: troca a chamada a `perguntaObrigatoria(rl, 'Versão do app para ativar (x.y.z): ')` pela chamada a
  `perguntaVersaoMinima(rl, platforms)`; ao montar `args` para `new-flag.js`, se o resultado tiver as duas
  plataformas, passa `--min-version-ios <v>` e `--min-version-android <v>`; se tiver só uma, passa
  `--min-version <v>` (mesmo argumento de hoje, sem mudar o formato para o caso de uma plataforma só).

**`scripts/new-flag.js`:**
- Lê `a['min-version-ios']`/`a['min-version-android']` (`parseArgs`, já existente). Validação nova, antes da
  validação de `targetingErrors` (que hoje já roda com `a['min-version']`): se algum dos dois vier, (a)
  `a['min-version']` não pode vir junto (erro "não misture --min-version com --min-version-ios/--min-version-android");
  (b) a plataforma correspondente deve estar em `platformsOf({ platforms: a.platforms })` (mesma mensagem de erro
  do padrão já usado para `--ios`/`--android` na spec 0023, adaptada); (c) toda plataforma de
  `platformsOf({ platforms: a.platforms })` deve ter o `--min-version-<p>` correspondente (senão erro "faltou
  --min-version-<p>").
- Quando (a)-(c) passam com pelo menos um `--min-version-<p>` informado, monta `minVersion` como objeto a partir
  dos valores recebidos (em vez de `a['min-version']`) antes de chamar `targetingErrors` (que já valida o formato
  x.y.z de cada uma, sem mudança) e antes de montar `flag.minVersion`.

## Arquivos afetados

- `scripts/flags-menu.js`: nova função `perguntaVersaoMinima`; troca a pergunta de versão mínima em `criarFF`.
- `scripts/flags-menu.test.js`: testes novos (CA-1, CA-2).
- `scripts/new-flag.js`: aceita `--min-version-ios`/`--min-version-android`, com as validações acima.
- `scripts/new-flag.test.js`: testes novos (CA-3, CA-4).

## Plano de implementação

### Task 1: `new-flag.js` aceita `--min-version-ios`/`--min-version-android`

**Files:** `scripts/new-flag.js`, `scripts/new-flag.test.js`

**Interfaces:** usa `platformsOf`, `targetingErrors` de `./lib/flags` (já existem); nenhuma função nova
exportada — validação inline, como o resto de `new-flag.js`.

1. Teste: `--min-version-ios 2.61.0 --min-version-android 2.63.0` com `--platforms ambas` grava
   `flags/<key>.json` com `minVersion: {ios: "2.61.0", android: "2.63.0"}`; misturar com `--min-version` é erro;
   faltar `--min-version-android` (só `--min-version-ios`) com `--platforms ambas` é erro; `--min-version-ios`
   com `--platforms android` (fora da lista) é erro.
2. Implementação: leitura e validação de `a['min-version-ios']`/`a['min-version-android']`, montagem do objeto.
3. Comando: `npm test` (esperado: todos passam, incluindo os novos).

### Task 2: `flags-menu.js` pergunta a versão por plataforma quando "ambas"

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`

**Interfaces:** `perguntaVersaoMinima(rl, platforms: string): Promise<{ios?: string, android?: string}>` — nova
função interna de `scripts/flags-menu.js`, chamada por `criarFF`.

1. Teste: com `ambas`, o menu pergunta a versão de ios e depois de android (respostas diferentes viram
   `--min-version-ios`/`--min-version-android` na chamada de `new-flag.js`); uma resposta fora do formato repete
   a pergunta; com uma plataforma só, o menu pergunta uma vez e passa `--min-version` (sem regressão nos testes
   já existentes de `flags-menu.test.js`).
2. Implementação: a função nova e a troca em `criarFF`.
3. Comando: `npm test` (esperado: todos passam).

## Verificação

- `npm test` passa, incluindo os casos novos de `new-flag.test.js` e `flags-menu.test.js`.
- `npm run specs` passa.
- Manual: `npm run flags`, criar uma `ft_` com `ambas`, responder versões diferentes para ios e android; conferir
  que `flags/<chave>.json` tem `minVersion: {"ios": "...", "android": "..."}`; `npm run validate` passa.

## Riscos e reversão

- Mudança aditiva em `new-flag.js` (dois argumentos novos, opcionais): quem chama só com `--min-version` (uso
  direto de CLI, testes existentes) não muda de comportamento. Reversão: reverter o commit desta spec volta a
  pergunta de versão mínima para uma única pergunta sempre, e tira os dois argumentos novos de `new-flag.js`.
- FFs já existentes com `minVersion` string continuam válidas (`targetingErrors` já aceita os dois formatos); esta
  spec não migra dados existentes, só muda o que o menu pergunta e grava para FFs novas.

## Decisões

- Quando há só uma plataforma, a versão mínima continua uma única pergunta com o mesmo texto de hoje — sem
  introduzir um formato de objeto de uma chave só só para manter consistência; simplicidade e nenhuma regressão
  no caso mais comum (FF de uma plataforma).
- Validação do formato `x.y.z` com repetição (em vez de aceitar qualquer texto e deixar `new-flag.js` recusar no
  fim) segue o mesmo padrão já adotado para equipe (spec 0022) e plataformas (spec 0023): evita chegar ao fim do
  menu com um dado inválido.
