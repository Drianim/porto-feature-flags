---
spec: 0001
titulo: Plataforma e versão mínima obrigatórias em toda FF
status: implementada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0001 — Plataforma e versão mínima obrigatórias em toda FF

> Spec retroativa: escrita depois do código, como modelo de preenchimento. O SDD passa a valer a partir da 0003.

## Resumo

Como **dono de uma FF**, quero **declarar para quais plataformas ela existe e a versão mínima do app que já tem o código**, para que **a FF nunca seja ativada em app antigo, onde o código não existe**.

## Contexto

Até aqui a FF valia para qualquer versão do app. Uma FF ligada em produção chegava também aos aparelhos com versão anterior à do código dela: no melhor caso o valor era ignorado, no pior o app antigo mudava de comportamento sem ter o código novo. O repositório também não registrava se a FF era só de Android, só de iOS ou de ambas: quem descobria era o override em `env/`.

## Objetivo e fora de escopo

**Objetivo:** toda FF declara `platforms` e `minVersion`; o Remote Config só serve a FF nas plataformas declaradas e a partir da versão mínima.

**Fora de escopo:** consulta de saúde do app, versão máxima (desligar em versão nova), critério por build number e migração de FFs de outros projetos.

## Critérios de aceite

- [x] CA-1: `validate` reprova FF sem `platforms` (`android`, `ios` ou `ambas`) ou sem `minVersion` no formato `x.y.z`.
- [x] CA-2: `minVersion` aceita também um objeto por plataforma, com exatamente as plataformas da FF.
- [x] CA-3: bloco `ios`/`android` em `env/` para plataforma fora de `platforms` é reprovado.
- [x] CA-4: toggle abaixo da versão mínima, ou fora das plataformas, recebe `false`; `rc_*` não é enviada (o app usa o padrão dele).
- [x] CA-5: as condições publicadas são `device.os == '<p>' && app.version >= '<min>'`, com `percent('<chave>')` quando há rollout; `rc_*` usa o padrão do app como valor padrão e a condição `<chave>_<plataforma>_base` para o valor padrão.
- [x] CA-6: `new-flag` exige `--platforms` e `--min-version`; o catálogo mostra os dois campos.
- [x] CA-7: `test-platforms` consulta o Firebase com a versão mínima, a logo abaixo e uma bem acima, e compara com o esperado pelo repositório.

## Desenho

- `flags/<key>.json` ganha `platforms` e `minVersion`. Os dois ficam na definição (e não em `env/`) porque dizem quando o código existe, valendo para todos os ambientes.
- `scripts/lib/flags.js` concentra as regras: `platformsOf`, `minVersionFor`, `targetingErrors`, `compareVersions`, `justBelow` e `expectedAt` (o que o Remote Config deve servir para plataforma + versão). `rules()` só considera overrides das plataformas da FF.
- `scripts/lib/remote-config.js` (`build`) recusa FF sem os campos e monta as condições. Toggle: padrão `false` explícito. Config: padrão `useInAppDefault` e uma condição `_base` por plataforma, avaliada depois do override. `diff` compara o padrão de qualquer um dos dois formatos; `isOwnedCondition` reconhece os sufixos `_ios`, `_android`, `_ios_base`, `_android_base`.
- Sintaxe do Firebase: `app.version >= '2.61.0'` (só `x.y.z` numérico; sem sufixo como `-beta`).

> **Correção (spec 0008):** o Firebase recusou essa forma no `validateTemplate` (`Was expecting: '.'`). A condição de versão passou a usar `app.version.>=(['2.61.0'])`, num único ponto do código (`versionCondition`), e o template passou a ser validado no próprio Firebase no PR.
- Migração: as 5 FFs existentes ganharam `platforms` e `minVersion: "2.61.0"`. Isso muda as condições delas; depois do merge a `main` diverge do Firebase até rodar `sync-nonprod`.

## Arquivos afetados

- `scripts/lib/flags.js`: regras de plataforma, versão e `expectedAt`.
- `scripts/lib/remote-config.js`: condições com versão, `_base`, padrão do app.
- `scripts/validate.js`, `scripts/new-flag.js`, `scripts/catalog.js`, `scripts/test-platforms.js`.
- `flags/*.json` e `catalog/keys.json`: migração das FFs existentes.
- `scripts/lib/flags.test.js`, `scripts/lib/remote-config.test.js`, `scripts/validate.test.js`: testes.
- `README.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`: documentação.

## Plano de implementação

### Task 1: Regras de plataforma e versão em `flags.js`

**Files:** `scripts/lib/flags.js`, `scripts/lib/flags.test.js`

**Interfaces:** produz `platformsOf(flag) -> string[]`, `minVersionFor(flag, platform) -> string`, `targetingErrors(flag) -> string[]`, `compareVersions(a, b) -> number`, `justBelow(v) -> string|null`, `expectedAt(flag, env, platform, version) -> { mode, value, ... }`.

1. Teste: FF sem `platforms`, com `minVersion` inválida (`2.61`, `2.61.0-beta`) e com objeto de plataformas errado devolvem erro.
2. Implementação: as funções acima.
3. Comando: `node --test scripts/lib/flags.test.js` (esperado: passa).

### Task 2: Condições com versão em `build`, `diff` e `removeKeys`

**Files:** `scripts/lib/remote-config.js`, `scripts/lib/remote-config.test.js`

**Interfaces:** consome `platformsOf`, `minVersionFor`, `targetingErrors` de `flags.js`; `build` passa a lançar erro sem os campos e a gerar as condições da CA-5.

1. Teste: avaliador mínimo das expressões prova que toggle liga na mínima, não liga logo abaixo e não liga fora das plataformas; `rc_` devolve `undefined` abaixo da mínima; `expectedAt` coincide com o que as condições servem.
2. Implementação: condições `device.os` + `app.version`, `_base` para `rc_`, `useInAppDefault`.
3. Comando: `node --test scripts/lib/remote-config.test.js`.

### Task 3: Validação, criação, catálogo e migração

**Files:** `scripts/validate.js`, `scripts/new-flag.js`, `scripts/catalog.js`, `flags/*.json`, `catalog/keys.json`, `scripts/validate.test.js`

**Interfaces:** `new-flag` recebe `--platforms <android|ios|ambas> --min-version <x.y.z>`; `validate` usa `targetingErrors` e reprova bloco de `env/` fora das plataformas.

1. Teste: `validate.test.js` cria um repositório temporário e confere cada caso das CA-1 a CA-3.
2. Implementação: as três mudanças e a migração das 5 FFs.
3. Comando: `npm test && npm run validate` (esperado: passa).

### Task 4: Teste real no Firebase

**Files:** `scripts/test-platforms.js`

**Interfaces:** consome `expectedAt`, `platformsOf`, `minVersionFor`, `justBelow`; envia `appVersion` na consulta de cada app de teste.

1. Implementação: consulta em versão alta (mede o rollout), na mínima e logo abaixo.
2. Comando: `node scripts/test-platforms.js nonprod` com a chave do NÃO PROD (esperado: `✓ plataforma e versão mínima se comportam como o repositório manda`).

## Verificação

- `npm test` (todos passam), `npm run validate` e `npm run specs`.
- `node scripts/deploy.js nonprod --dry-run` mostra `app.version >= '2.61.0'` em todas as condições.
- Depois do merge: rodar `sync-nonprod` e `node scripts/test-platforms.js nonprod` com a chave do NÃO PROD.

## Riscos e reversão

- **Expressão recusada pelo Firebase:** o `validateTemplate` do deploy falha antes de publicar; nada muda no Firebase. Reverter o merge da `chore/*`.
- **`rc_` com padrão do app:** o caminho ainda não foi exercitado em FF real (as FFs atuais são toggles). Cobrir com `test-platforms` na primeira `rc_`.
- **`main` divergente até o `sync-nonprod`:** esperado; o `verify-nonprod` alerta até a sincronia.

## Decisões

- `platforms` e `minVersion` na definição da FF, não em `env/`: o código existe (ou não) independentemente do ambiente.
- `minVersion` como texto único; objeto por plataforma só quando as versões de Android e iOS diferem.
- Toggle mantém `false` explícito abaixo da mínima; `rc_` usa o padrão do app para não inventar valor onde o código não existe.
- Comparação numérica `x.y.z` apenas, por limite do Firebase.
