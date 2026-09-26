---
spec: 0023
titulo: npm run flags — validar plataformas e perguntar o valor (true/false) de cada uma
status: implementada
criado: 2026-09-26
atualizado: 2026-09-26
---

# Spec 0023 — npm run flags — validar plataformas e perguntar o valor (true/false) de cada uma

## Resumo

Como **quem cria uma FF toggle (`ft_`) pelo `npm run flags`**, quero **que a pergunta de plataformas só aceite
`android`, `ios` ou `ambas`, e que em seguida o menu pergunte, para cada plataforma escolhida, se ela nasce ligada
(`true`) ou desligada (`false`)**, para que **a FF já saia do menu com uma condição por plataforma no Firebase
(hoje só existe o valor padrão quando ninguém informa nada por plataforma), sem precisar de um `update/*` depois
só para "aparecer" a condição de cada plataforma.**

## Contexto

Hoje (spec 0018/0022) `scripts/flags-menu.js:62` pergunta `Plataformas (android|ios|ambas): ` como texto livre
(`perguntaObrigatoria`, só exige não-vazio) e usa a resposta direto no `--platforms` de `new-flag.js`; se o texto
não for `android`, `ios` nem `ambas`, o menu segue, cria a branch, e só `new-flag.js` recusa no fim (mesma classe
de problema que motivou a 0022, agora para plataformas em vez de equipe).

Além disso, hoje `new-flag.js` só grava `env/nonprod/<key>.json` com `{ "default": "false" }` (ou o `--value` de
`rc_*`) — nunca cria bloco `ios`/`android` na criação. Em `scripts/lib/remote-config.js` (`build()`), uma FF
toggle só ganha condição por plataforma no Firebase quando `env/nonprod/<key>.json` tem um bloco explícito para
aquela plataforma (`e[p]`); com `default: "false"` e nenhum bloco, o Firebase mostra só "Valor padrão = false, 0%",
sem nenhuma condição de `device.os`. Foi exatamente o que apareceu no console para `ft_teste_v3` (`platforms:
"ambas"`, sem bloco `ios`/`android`): nenhuma condição por plataforma, só o valor padrão.

## Objetivo e fora de escopo

**Objetivo:**
1. A pergunta de plataformas só aceita `android`, `ios` ou `ambas` (comparação exata); qualquer outra resposta
   repete a pergunta, sem avançar — mesmo padrão de "repete até válido" da spec 0022.
2. Só para chaves `ft_` (toggle): depois da plataforma validada, o menu pergunta, para cada plataforma da lista
   escolhida (`ambas` → pergunta ios e depois android; só uma → pergunta só essa), "Ativar em <plataforma>?
   (s/N)". As respostas viram `--ios true|false` e/ou `--android true|false` para `new-flag.js`.
3. `new-flag.js` ganha os argumentos opcionais `--ios <true|false>` e `--android <true|false>`: quando presentes
   (só para `ft_` e só para plataforma que esteja em `--platforms`), gravam `env/nonprod/<key>.json` com um bloco
   explícito `{ "value": "<true|false>" }` para aquela plataforma, além do `default: "false"` de sempre. Sem
   esses argumentos (uso direto do CLI, como hoje), o comportamento não muda: só `default`, sem blocos.

**Fora de escopo:** chaves `rc_` (config) continuam com um único `--value` e sem pergunta por plataforma (fica
para uma spec futura, se pedido); a pergunta de versão mínima (`minVersion`) continua única, valendo para todas
as plataformas escolhidas (sem pedir uma versão por plataforma); rollout percentual por plataforma (continua só
via `update/*`, fora do menu, como hoje); qualquer mudança em `config/teams.json` ou na pergunta de equipe (spec
0022, já fechada).

## Critérios de aceite

- [x] CA-1: a pergunta de plataformas só aceita `android`, `ios` ou `ambas`; qualquer outra resposta (vazio,
      maiúscula, outro texto) mostra um erro e repete a mesma pergunta, sem avançar para a próxima pergunta nem
      criar a branch.
- [x] CA-2: para uma chave `ft_`, depois de uma plataforma válida `ambas`, o menu pergunta "Ativar em ios? (s/N)"
      e depois "Ativar em android? (s/N)", nessa ordem; para `ios` ou `android`, pergunta só a correspondente.
      Para uma chave `rc_`, nenhuma dessas perguntas aparece.
- [x] CA-3: respondendo "s"/"S"/"sim" numa pergunta de plataforma, o menu passa `--<plataforma> true` para
      `new-flag.js`; qualquer outra resposta passa `--<plataforma> false`.
- [x] CA-4: `new-flag.js` aceita `--ios <true|false>` e `--android <true|false>` (opcionais); quando presentes
      para uma chave `ft_` e uma plataforma que está em `--platforms`, `env/nonprod/<key>.json` fica com
      `{ "default": "false", "<plataforma>": { "value": "<true|false>" } }` para cada uma informada, mantendo
      `default: "false"` como hoje. Passar `--ios`/`--android` para uma plataforma fora de `--platforms`, ou para
      uma chave `rc_`, é erro (mensagem clara, sem criar arquivo). Sem esses argumentos, o arquivo sai igual a
      hoje (só `default`).
- [x] CA-5: rodando o menu com `ambas` e "s" para as duas plataformas, `npm run validate` e (com
      `FIREBASE_SA_KEY_NONPROD` configurada) o próximo `sync-nonprod` publicam condições `device.os == 'ios'` e
      `device.os == 'android'` para a chave (via `scripts/lib/remote-config.js`, já existente — nenhuma mudança
      lá é necessária, só o arquivo `env/nonprod/` passa a ter os blocos).
- [x] CA-6: `npm test` cobre CA-1 a CA-4 e passa; `npm run specs` passa.

## Desenho

**`scripts/lib/flags.js`:** nenhuma mudança — `platformsOf(flag)` já devolve a lista certa a partir de
`flag.platforms` (`"android"`/`"ios"` → uma; qualquer outro valor, incluindo `"ambas"` → as duas). O menu usa a
mesma função para saber quais plataformas perguntar, então precisa que `platforms` já esteja validado (CA-1) —
sem validar, `platformsOf` trataria um valor inválido como "ambas" silenciosamente, o que esconderia o erro em vez
de expor (mesma armadilha que a 0022 resolveu para equipe).

**`scripts/flags-menu.js`:**
- Nova função `perguntaPlataformas(rl)`: pergunta `Plataformas (android|ios|ambas): `, compara a resposta contra
  `PLATFORM_CHOICES` (`scripts/lib/flags.js`, já existe); se não bater, imprime erro e repete (mesmo laço de
  `perguntaEquipe`); devolve a string validada.
- Nova função `perguntaValoresPorPlataforma(rl, platforms)`: para cada plataforma de `platformsOf({ platforms })`
  (`scripts/lib/flags.js`), pergunta `Ativar em <plataforma>? (s/N) ` e devolve `{ ios?: 'true'|'false', android?:
  'true'|'false' }` (mesma regra de "s"/"sim" que a pergunta de push já usa).
- Em `criarFF`: troca a pergunta de plataformas atual pela chamada a `perguntaPlataformas`; logo depois, se
  `kindOf(key) === 'toggle'`, chama `perguntaValoresPorPlataforma` e inclui `--ios`/`--android` no array de `args`
  passado a `new-flag.js` (só as chaves presentes no objeto devolvido).

**`scripts/new-flag.js`:**
- Lê `a.ios`/`a.android` (`parseArgs`, já existente). Validação nova, antes de gravar o arquivo: se algum dos dois
  vier, (a) a chave deve ser `ft_` (senão erro "--ios/--android só valem para chaves ft_ (toggle)"), (b) o valor
  deve ser exatamente `"true"` ou `"false"` (senão erro citando o valor recebido), (c) a plataforma correspondente
  deve estar em `platformsOf({ platforms: a.platforms })` (senão erro "--<plataforma> informado, mas platforms é
  <valor>: remova o argumento ou ajuste --platforms").
- Ao montar `def` (hoje só `{ default: ... }`), acrescenta `ios`/`android` como `{ value: a.ios }` /
  `{ value: a.android }` quando presentes — o `...def` já espalhado em `fs.writeFileSync(envFile, ...)` cobre isso
  sem mudar a escrita do arquivo.

## Arquivos afetados

- `scripts/flags-menu.js`: novas funções `perguntaPlataformas` e `perguntaValoresPorPlataforma`; troca a pergunta
  de plataformas em `criarFF` e acrescenta a pergunta de valor por plataforma (só `ft_`).
- `scripts/flags-menu.test.js`: testes novos (CA-1 a CA-3).
- `scripts/new-flag.js`: aceita `--ios`/`--android` opcionais, com as validações acima.
- `scripts/new-flag.test.js`: testes novos (CA-4).

## Plano de implementação

### Task 1: `new-flag.js` aceita `--ios`/`--android`

**Files:** `scripts/new-flag.js`, `scripts/new-flag.test.js`

**Interfaces:** usa `platformsOf` de `./lib/flags` (já existe); nenhuma função nova exportada — a validação fica
inline no CLI, como o resto de `new-flag.js` já faz.

1. Teste: `--ios true` numa chave `ft_` com `--platforms ambas` grava `env/nonprod/<key>.json` com bloco
   `ios: { value: "true" }` além do `default`; `--ios true --android false` grava os dois blocos; `--ios true`
   numa chave `rc_` é erro; `--android true` com `--platforms ios` é erro (plataforma fora da lista); valor
   `--ios talvez` é erro.
2. Implementação: leitura e validação de `a.ios`/`a.android`, inclusão em `def`.
3. Comando: `npm test` (esperado: todos passam, incluindo os novos).

### Task 2: `flags-menu.js` valida plataformas e pergunta o valor por plataforma

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`

**Interfaces:** `perguntaPlataformas(rl): Promise<string>`; `perguntaValoresPorPlataforma(rl, platforms: string):
Promise<{ios?: string, android?: string}>` — novas funções internas de `scripts/flags-menu.js`, chamadas por
`criarFF`.

1. Teste: responder `xyz` e depois `ambas` na pergunta de plataformas mostra o erro e repete, depois segue;
   com `ambas` numa chave `ft_`, o menu pergunta ios e android nessa ordem, e as respostas viram
   `--ios`/`--android` na chamada de `new-flag.js` (fim a fim, como os testes atuais de `flags-menu.test.js`);
   com uma chave `rc_`, nenhuma pergunta de plataforma-valor aparece.
2. Implementação: as duas funções e a troca em `criarFF`.
3. Comando: `npm test` (esperado: todos passam).

## Verificação

- `npm test` passa, incluindo os casos novos de `new-flag.test.js` e `flags-menu.test.js`.
- `npm run specs` passa.
- Manual: `npm run flags`, criar uma `ft_` com `ambas`, responder "s" para ios e "N" para android; conferir que
  `env/nonprod/<chave>.json` tem `ios: {value: "true"}` e `android: {value: "false"}` além do `default`; depois
  do merge e da aprovação do ambiente `nonprod`, conferir no console do Firebase que aparecem as duas condições
  `device.os == 'ios' ...` e `device.os == 'android' ...`.

## Riscos e reversão

- Único ponto de mudança em `new-flag.js` é aditivo (dois argumentos novos, opcionais): quem chama sem eles (uso
  direto de CLI, testes existentes) não muda de comportamento. Reversão: reverter o commit desta spec volta a
  pergunta de plataformas para texto livre e tira os dois argumentos novos de `new-flag.js`.
- Gravar um bloco `{ value: "false" }` explícito para uma plataforma (quando o usuário responde "N") passa a
  criar uma condição no Firebase para essa plataforma com valor `false` — hoje (sem bloco) essa plataforma não
  gera condição nenhuma, só o valor padrão. É a mudança de comportamento intencional desta spec (o motivo do
  pedido): cada plataforma escolhida em `platforms` passa a ter sua própria condição visível no console, ligada
  ou desligada.

## Decisões

- Pergunta "Ativar em <plataforma>? (s/N)" (booleana, mesmo padrão da pergunta de push) em vez de pedir
  "true"/"false" como texto: menos chance de erro de digitação e consistente com o resto do menu.
- Grava bloco explícito mesmo quando a resposta é "N" (`false`), em vez de omitir o bloco: é o que resolve o
  problema relatado (plataforma "ambas" sem nenhuma condição por plataforma no Firebase) — omitir manteria o
  comportamento antigo para quem responde "N" nas duas.
- `rc_` fica de fora nesta spec (confirmado com o usuário): o valor de uma `rc_` já é pedido uma vez
  (`--value`), e diferenciar por plataforma nela é decisão de escopo maior, para pedir depois se precisar.
- `minVersion` continua uma pergunta única (confirmado com o usuário): não pedir uma versão por plataforma aqui.
