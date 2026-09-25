---
spec: 0016
titulo: npm run flags:help lista os comandos de FF (new/update/remove)
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0016 — npm run flags:help lista os comandos de FF (new/update/remove)

## Resumo

Como **quem cria, altera ou remove uma FF pela linha de comando**, quero **um `npm run flags:help` que liste os
comandos disponíveis (`new:flag`, `update:flag`, `remove:flag`) e o que cada um faz**, para que **eu não precise
lembrar de cor o nome de cada comando nem abrir o README toda vez**.

## Contexto

Hoje só existe `npm run new:flag` (cria `flags/<key>.json` + `env/nonprod/<key>.json`, e já exige rodar numa
branch `feature/*`, spec 0015). `update:flag` e `remove:flag` ainda não existem como comandos guiados — alterar
uma FF hoje é edição manual dos arquivos, e remover é `scripts/remove-flags.js` (que na verdade é o script de
*deploy* que retira uma chave do Firebase, não um CLI local de edição). O usuário pediu uma família de comandos
guiados (`new:flag`, `update:flag`, `remove:flag`), a ser construída **local primeiro**, começando pelo
`new:flag` (spec 0015, já implementada). Esta spec cobre só o `help`: uma forma de listar o que existe e o que
falta, sem esperar as outras duas specs.

## Objetivo e fora de escopo

**Objetivo:** `npm run flags:help` imprime, para cada um dos três comandos (`new:flag`, `update:flag`,
`remove:flag`), o nome do comando e uma frase do que ele faz; para os que ainda não existem, imprime "ainda não
implementado" em vez do uso.

**Fora de escopo:** implementar `update:flag` ou `remove:flag` de verdade (specs futuras); mudar `new:flag`;
qualquer help automático dentro de `new-flag.js`/`new-rm.js` (nenhum comando ganha `--help` próprio nesta spec).

## Critérios de aceite

- [x] CA-1: `npm run flags:help` roda sem argumento e sai com código 0, listando os três comandos
      (`npm run new:flag`, `npm run update:flag`, `npm run remove:flag`) em linhas separadas.
- [x] CA-2: ao lado de `new:flag`, mostra a frase real do que ele faz (cria `flags/<key>.json` +
      `env/nonprod/<key>.json`, exige branch `feature/*`).
- [x] CA-3: ao lado de `update:flag` e `remove:flag`, mostra claramente que ainda não estão implementados (não
      finge que existem).
- [x] CA-4: `npm test` cobre a saída do comando (contém os três nomes; `new:flag` tem descrição de "cria"; os
      outros dois têm "ainda não implementado") e passa.

## Desenho

Script novo `scripts/flags-help.js`, sem dependências de `lib/` além de imprimir uma lista fixa (array de
`{ cmd, status: 'ok'|'pendente', desc }`) — não há estado externo para ler (o que existe/não existe hoje é fato
conhecido, não descoberto em tempo de execução). `package.json` ganha `"flags:help": "node scripts/flags-help.js"`.
Quando `update:flag`/`remove:flag` forem implementados (specs futuras), essa mesma lista é atualizada como parte
daquela spec (não é redescoberta automaticamente — é lista estática, de propósito, para não confundir "existe no
código" com "aparece no help").

## Arquivos afetados

- `scripts/flags-help.js` (novo).
- `scripts/flags-help.test.js` (novo).
- `package.json`: novo script `flags:help`.

## Plano de implementação

### Task 1: Comando flags:help

**Files:** `scripts/flags-help.js`, `scripts/flags-help.test.js`, `package.json`

**Interfaces:** nenhuma nova; script autocontido.

1. Criar `scripts/flags-help.js`: array fixo com os três comandos, cada um com `desc` e `status`; imprime uma
   linha por comando (`✓ npm run new:flag — ...` para os prontos, `… npm run update:flag — ainda não
   implementado` para os pendentes).
2. Criar `scripts/flags-help.test.js`: roda o script via `execFileSync`/`spawnSync` e confere que a saída traz os
   três comandos e o status certo de cada um.
3. Adicionar `"flags:help": "node scripts/flags-help.js"` a `package.json`.
4. Comando: `npm test` (novo teste); `npm run flags:help` (conferência manual).

## Verificação

- `npm test` passa, incluindo o novo teste de `flags-help.js`.
- Manual: `npm run flags:help` mostra os três comandos, com `new:flag` descrito e os outros dois marcados como
  pendentes.

## Riscos e reversão

- **Nenhum:** comando novo, não interfere em nenhum outro. Lista estática pode ficar desatualizada se
  `update:flag`/`remove:flag` forem implementados sem atualizar este arquivo — mitigado por ser um array curto e
  óbvio de achar (mesmo arquivo, um item por comando).

## Decisões

- Comando novo (`flags:help`) em vez de `--help` dentro de `new-flag.js`: o usuário quer uma visão de família (os
  três comandos juntos), não ajuda de um script isolado.
- Lista estática em vez de descobrir dinamicamente quais scripts existem: mais simples, e o texto de cada
  descrição é escrito por humano (frase clara), não gerado.
