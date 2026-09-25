---
spec: 0018
titulo: npm run flags — menu interativo para criar/alterar/remover FF
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0018 — npm run flags — menu interativo para criar/alterar/remover FF

## Resumo

Como **quem cria, altera ou remove uma FF**, quero **um comando único (`npm run flags`) que me pergunte o que eu
quero fazer, peça os dados um a um, crie a branch certa, rode o comando certo e, no final, pergunte se já pode
enviar (`git push`) e me dê o link do PR com a descrição já preenchida** — para que **eu não precise montar cada
passo (branch, comando, push, corpo do PR) na mão, nem lembrar o formato de cada campo**.

## Contexto

Hoje existem, em pedaços: `npm run flags:help` (spec 0017, só informa o comando/branch, não executa nada),
`npm run new:flag` (spec 0015, cria a FF mas exige que a branch `feature/*` já exista e que os `--flags` já
estejam montados na mão) e `npm run preflight -- --push` (spec original, empurra e dá o link simples do PR, sem
corpo preenchido). `.github/pull_request_template.md` tem uma seção por tipo de branch (`feature/*`, `update/*`,
`remove/*`, …) com campos como Chave, Equipe dona, Criticidade, Plataformas, Versão mínima, Valores por
plataforma. `scripts/lib/preflight.js` já expõe `prLink(remoteUrl, branch)` (link de comparação do GitHub); o
link do GitHub aceita o parâmetro de query `body` para pré-preencher a descrição do PR. `update:flag` e
`remove:flag` continuam sem implementação real (spec 0016/0017): o menu, para essas duas opções, mostra que
ainda não estão prontas, sem inventar comportamento.

## Objetivo e fora de escopo

**Objetivo:** `npm run flags` abre um menu no terminal:

1. Pergunta a ação (1 - Criar FF nova, 2 - Alterar FF existente, 3 - Remover FF).
2. Para a opção 1 (única implementada nesta spec):
   - Pergunta o nome da FF (chave `ft_*`/`rc_*`), equipe (lista de `config/teams.json`), criticidade,
     descrição, plataformas, versão mínima (e valor, se `rc_*`).
   - Roda `git checkout -b feature/<nome-derivado-da-chave>` (branch nova a partir da `main` atual).
   - Roda `new-flag.js` com os dados coletados (mesma lógica de validação de sempre — se algo for inválido, o
     próprio `new-flag.js` recusa e o menu para ali, sem inventar correção).
   - Se deu certo, pergunta "Enviar (git push) e abrir o PR agora? (s/N)"; só com "s" roda o push e imprime o
     link do PR (compare do GitHub) com o corpo da seção `feature/*` do template já preenchido com os dados
     coletados (via parâmetro `body` da URL).
3. Para as opções 2 e 3 (`update`/`remove`): imprime que ainda não estão implementadas (mesmo texto do
   `flags:help`) e sai, sem pedir mais nada.

**Fora de escopo:** implementar de fato `update:flag`/`remove:flag` (specs futuras, quando pedidas); abrir o
navegador automaticamente (só imprime o link; abrir com `open`/`xdg-open` fica de fora, o usuário decide);
integração com `gh` CLI (não está instalado nesta máquina; o link do GitHub com `body` resolve sem depender
dele); mudar `new-flag.js`, `flags-help.js` ou o template de PR.

## Critérios de aceite

- [x] CA-1: `npm run flags` sem argumento mostra o menu (1/2/3) e espera a escolha por `stdin`.
- [x] CA-2: escolhendo 1, pergunta em sequência chave, equipe, criticidade, descrição, plataformas, versão
      mínima (e valor, se a chave for `rc_*`), cria a branch `feature/<nome>` a partir da chave (ex.:
      `ft_camp_x` → `feature/ft-camp-x`, `_` viram `-`) e roda `new-flag.js` com esses dados.
- [x] CA-3: se `new-flag.js` recusar (validação existente: equipe inválida, versão mal formatada, etc.), o menu
      mostra o erro tal como o script imprime e termina sem perguntar sobre push.
- [x] CA-4: se `new-flag.js` aceitar, o menu pergunta "Enviar e abrir o PR agora? (s/N)"; só com "s"/"S" faz
      `git push -u origin <branch>` e imprime um link `https://github.com/.../compare/main...<branch>?expand=1&body=...`
      com o corpo da seção `feature/*` do template preenchido com os dados coletados; com qualquer outra
      resposta, só informa que a branch está pronta localmente e como enviar depois.
- [x] CA-5: escolhendo 2 ou 3, mostra "ainda não implementado" (mesmo texto do `flags:help`) e sai sem pedir mais
      nada.
- [x] CA-6: `npm test` cobre o fluxo 1 completo (com respostas simuladas por `stdin`), a recusa do `new-flag.js`
      (CA-3), a escolha de não enviar (CA-4, resposta "N"), e as opções 2/3 (CA-5); passa.

## Desenho

Novo script `scripts/flags-menu.js`, usando `require('readline')` (nativo do Node 22, sem dependência nova) e o
async iterator de linhas da interface (`rl[Symbol.asyncIterator]()`) para ler `stdin` linha a linha de forma
assíncrona (`async function main()`) — `readline/promises`'s `rl.question()` só resolve a 1ª chamada quando todo
o `stdin` chega de uma vez (como em testes com `input` do `spawnSync`); as perguntas seguintes ficam penduradas,
por isso a troca para o iterator do `readline` clássico. Reaproveita:
- `branchKind`/`prLink` de `scripts/lib/preflight.js` (o link do PR);
- `loadTeams()` de `scripts/lib/common.js` (lista de equipes válidas, para mostrar como opções);
- `KEY_RE`/`kindOf` de `scripts/lib/flags.js` (mesmo formato de chave que `new-flag.js` já exige).

Depois de coletar os dados da opção 1, o script:
1. Deriva o nome da branch a partir da chave: `key.replace(/_/g, '-')` (ex.: `ft_camp_x` → `feature/ft-camp-x`).
2. Roda `git checkout -b feature/<nome>` via `spawnSync` (se já existir uma branch com esse nome, avisa e sai,
   sem sobrescrever nada).
3. Roda `node scripts/new-flag.js <chave> --team ... --criticality ... --description "..." --platforms ...
   --min-version ... [--group ...] [--value ...]` via `spawnSync` com os mesmos argumentos que o usuário
   digitaria à mão — nenhuma validação nova é escrita no menu, `new-flag.js` continua sendo a única fonte de
   verdade de validação (o menu só monta os argumentos e mostra a saída de `new-flag.js` como está).
4. Se `new-flag.js` saiu com erro, imprime a saída dele e termina (CA-3).
5. Se dessa vez deu certo, monta o corpo do template (seção `feature/*`) com os dados coletados, pergunta se
   envia, e se sim faz `git push -u origin <branch>` e imprime o link com `encodeURIComponent(body)` na query
   `body=`.

Para as opções 2/3, apenas reaproveita a mesma mensagem de "ainda não implementado" que `flags-help.js` já usa
(mesmo texto, para não divergir) e sai — sem duplicar a lista de comandos.

## Arquivos afetados

- `scripts/flags-menu.js` (novo).
- `scripts/flags-menu.test.js` (novo).
- `package.json`: novo script `"flags": "node scripts/flags-menu.js"`.
- README/CLAUDE.md/skill `feature-flag`: uma linha citando `npm run flags` como o menu guiado (para o teste de
  cobertura de processos, `scripts/processos.test.js`).

## Plano de implementação

### Task 1: Menu interativo (opção 1 completa; opções 2/3 informativas)

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`, `package.json`

**Interfaces:** reaproveita `branchKind`/`prLink` (`scripts/lib/preflight.js`), `loadTeams`/`root`
(`scripts/lib/common.js`), `KEY_RE`/`kindOf` (`scripts/lib/flags.js`); nenhuma interface nova.

1. Criar `scripts/flags-menu.js`: menu (1/2/3) via `readline/promises`; opção 1 pergunta os campos, cria a
   branch, roda `new-flag.js`, pergunta sobre push, monta o link do PR com corpo preenchido; opções 2/3
   imprimem "ainda não implementado" e saem.
2. Criar `scripts/flags-menu.test.js`: roda o script via `spawnSync` com `input` (respostas simuladas) num
   repositório temporário (mesmo padrão de `new-flag.test.js`: `git init` + branch), cobrindo CA-1 a CA-6; o
   push real não é testado (mocar `git push` não faz sentido num teste local) — o teste responde "N" ao prompt
   de envio e confere que o `git push` NÃO rodou (sem remoto configurado no repo temporário, um push de verdade
   falharia e derrubaria o teste; por isso a escolha do teste é sempre "N" nesse ponto, cobrindo só a
   pergunta em si e a mensagem final).
3. Adicionar `"flags": "node scripts/flags-menu.js"` a `package.json`.
4. Atualizar README (seção *Comandos de FF*), CLAUDE.md (Mapa dos processos) e a skill `feature-flag`, e
   acrescentar o processo em `scripts/processos.test.js`.
5. Comando: `npm test` (novos testes); `npm run flags` (conferência manual, respondendo pelo teclado).

## Verificação

- `npm test` passa, incluindo os novos casos de `flags-menu.test.js`.
- Manual: `npm run flags` na `main`, escolher 1, preencher os campos de uma FF de teste, ver a branch criada e o
  arquivo gerado, responder "N" ao envio e conferir que nada foi empurrado; depois `git branch -D` para
  limpar o teste manual.

## Riscos e reversão

- **Prompt interativo em ambiente não interativo (CI):** este comando nunca roda no CI (só localmente, como
  `new-flag.js`); se rodar sem `stdin` disponível, `readline` trava esperando entrada — aceitável pelo mesmo
  motivo do risco já aceito na spec 0015 (uso estritamente local).
- **Nome de branch derivado da chave pode colidir com uma branch já existente:** o script confere antes de
  criar (`git rev-parse --verify` ou tentar o `checkout -b` e checar o código de saída) e avisa em vez de
  sobrescrever.
- Reversão: remover `scripts/flags-menu.js`/`.test.js` e a entrada em `package.json`; nenhum outro arquivo de FF
  é afetado (o menu só chama scripts que já existem, não escreve lógica de validação própria).

## Decisões

- Menu chama `new-flag.js` como subprocesso em vez de reimplementar a criação da FF: mantém uma única fonte de
  verdade de validação (spec 0015), evitando as duas lógicas divergirem.
- Corpo do PR pré-preenchido via parâmetro `body` do link de comparação do GitHub, em vez de usar o `gh` CLI:
  `gh` não está instalado nesta máquina; o link resolve o mesmo problema sem dependência nova.
- Opções 2/3 apenas informam "ainda não implementado" nesta spec: implementar `update:flag`/`remove:flag` de
  verdade é escopo maior (edição de arquivo existente, remoção com confirmação), fica para specs futuras
  dedicadas, na mesma ordem que o usuário já pediu (começar por `new:flag`/opção 1).
