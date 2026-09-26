---
spec: 0026
titulo: catalog/keys.json por equipe, para eliminar conflito entre PRs de equipes diferentes
status: implementada
criado: 2026-09-26
atualizado: 2026-09-26
---

# Spec 0026 — catalog/keys.json por equipe, para eliminar conflito entre PRs de equipes diferentes

## Resumo

Como **quem opera múltiplas equipes abrindo `feature/*`/`update/*`/`remove/*` ao mesmo tempo**, quero **que
`npm run catalog` gere um arquivo por equipe (`catalog/<equipe>/keys.json`) em vez de um único
`catalog/keys.json` agregado**, para que **duas equipes possam mesclar seus PRs em qualquer ordem sem precisar
resolver conflito de rebase no catálogo**, já que hoje as duas regeneram o mesmo arquivo.

## Contexto

Hoje `flags/<key>.json` e `env/nonprod|prod/<key>.json` já são um arquivo por chave: duas equipes criando FFs
diferentes não colidem nesses caminhos. O ponto de conflito real é `scripts/catalog.js`: ele lê **todas** as FFs
(`loadFlags()`, `scripts/lib/common.js`) e escreve um único `catalog/keys.json` ordenado por `key`
(`flags.sort((a,b) => a.key.localeCompare(b.key))`). Toda `feature/*`/`update/*`/`remove/*` roda `npm run catalog`
e commita esse arquivo (README, linha 169; `git status --branch` já mostrou isso em `feature/ft-v8` e
`chore/team_2` nesta sessão). Se a equipe A mescla primeiro, a base do PR da equipe B fica desatualizada
exatamente nas linhas do catálogo agregado (a lista de `keys[]` interna muda de tamanho e posição a cada FF nova
de qualquer equipe) — mesmo que as FFs de A e B sejam completamente diferentes, o PR de B pode acabar com
conflito de merge só nesse arquivo, ou passar por cima da entrada de A se o rebase for feito sem cuidado.

`npm run validate` roda `node scripts/catalog.js --check` (comparando o arquivo gerado com o commitado) — essa
checagem também precisa se adaptar a múltiplos arquivos.

`deploy.js` (quem publica no Firebase) não lê `catalog/keys.json`: ele usa `loadFlags()` direto
(`scripts/lib/common.js`), então o catálogo é só um artefato de leitura/documentação, nunca faz parte do caminho
de publicação — confirmado lendo `scripts/deploy.js` e `scripts/lib/remote-config.js` nesta sessão.

`flags/` e `env/` continuam como estão hoje (um arquivo por chave, sem mudança de pasta): a mudança desta spec é
só no artefato gerado (`catalog/`), decisão tomada com o usuário para não migrar dado nenhum de FF existente.

## Objetivo e fora de escopo

**Objetivo:**
1. `node scripts/catalog.js` gera um arquivo por equipe: `catalog/<team>/keys.json`, contendo só as FFs cujo
   `team` é essa equipe (mesmo formato de hoje, campo a campo, só filtrado).
2. `node scripts/catalog.js --check` confere que **todos** os `catalog/<team>/keys.json` (uma pasta por equipe de
   `config/teams.json`) estão em dia; se qualquer equipe tiver o arquivo desatualizado ou ausente, falha
   nomeando qual.
3. `node scripts/catalog.js --all` imprime no stdout o catálogo agregado de todas as equipes (mesmo formato do
   `catalog/keys.json` de hoje, com `keys` de todas as FFs) — **sem escrever arquivo em disco nem commitar nada**;
   serve só para quem quer ver o todo (ex.: consulta manual, `ff-status`).
4. `catalog/keys.json` (o arquivo único de hoje) deixa de ser gerado e é removido do repositório nesta `chore/*`.

**Fora de escopo:** mover `flags/` ou `env/` para pastas por equipe (decisão já tomada com o usuário: só o
catálogo muda; `flags/`/`env/` continuam um arquivo por chave, já sem conflito); mudar `check-scope.js` para
restringir `catalog/<team>/` por equipe (a equipe autora de um PR só toca no catálogo dela mesma, mas essa
restrição de per­missão fica pelo `check-ownership.js`/`check-scope.js` só se o usuário pedir depois — aqui é só
gerar/checar o arquivo certo); migrar `ff-status.js` para ler os catálogos por equipe (ele já usa `loadFlags()`
direto, não `catalog/keys.json`, então não muda).

## Critérios de aceite

- [x] CA-1: com `config/teams.json` tendo as equipes `home` e `servicos` (e `plataforma`, ver CA-2), e FFs `ft_a`
      (team `home`) e `ft_b` (team `servicos`), `node scripts/catalog.js` grava `catalog/home/keys.json` (só
      `ft_a`, `total: 1`) e `catalog/servicos/keys.json` (só `ft_b`, `total: 1`). Provado por
      `scripts/catalog.test.js`, teste "gera um catalog/<equipe>/keys.json por equipe, só com as FFs da própria
      equipe".
- [x] CA-2: equipe sem nenhuma FF (ex.: `plataforma`, hoje) ainda ganha `catalog/plataforma/keys.json` com
      `total: 0` e `keys: []` — todo `catalog/<team>/` existe para toda equipe de `config/teams.json`, mesmo
      vazio. Provado por `scripts/catalog.test.js`, teste "equipe sem FF ganha catalog/<equipe>/keys.json vazio".
      Confirmado também no repositório real: `catalog/plataforma/keys.json` gerado com `total: 0`.
- [x] CA-3: `node scripts/catalog.js --check` passa quando todos os `catalog/<team>/keys.json` batem com o
      recalculado; alterar uma FF sem rodar `npm run catalog` de novo faz `--check` falhar nomeando o
      `catalog/<team>/keys.json` desatualizado (equipe da FF alterada), e falha também quando falta o arquivo de
      uma equipe. Provado por `scripts/catalog.test.js`, testes "--check passa...", "--check falha nomeando a
      equipe..." e "--check falha quando falta o catálogo de uma equipe".
- [x] CA-4: `node scripts/catalog.js --all` imprime no stdout um JSON com todas as FFs de todas as equipes (mesmo
      formato de `keys[]` de hoje), e **não** cria nem altera nenhum arquivo em `catalog/`. Provado por
      `scripts/catalog.test.js`, teste "--all imprime o agregado...".
- [x] CA-5: `catalog/keys.json` (arquivo único antigo) não existe mais após esta spec; nenhum script ou doc ainda
      referencia esse caminho como saída. Removido do git (`git rm catalog/keys.json`); README.md, CLAUDE.md,
      `scripts/lib/scope.js`, `scripts/lib/scope.test.js`, `scripts/lib/new-flags.test.js`,
      `scripts/lib/ownership.test.js`, `scripts/check-ownership.test.js` atualizados para `catalog/<equipe>/`.
      Confirmado por `grep -rn "catalog/keys.json"` não retornando mais nenhum arquivo do repositório (só esta
      spec, como registro histórico).
- [x] CA-6: duas FFs de equipes diferentes criadas em branches diferentes (simulado no teste: gerar o catálogo com
      só a FF de uma equipe, depois com as duas) alteram só o `catalog/<team>/keys.json` da própria equipe —
      nenhuma mudança no `catalog/<outra-equipe>/keys.json`. Provado por `scripts/catalog.test.js`, teste "FF de
      uma equipe não altera o catálogo de outra equipe".
- [x] CA-7: `npm test` (289/289), `npm run validate` e `npm run specs` passam.

## Desenho

**`scripts/catalog.js`:**
- Troca o cálculo único por: agrupar `loadFlags()` por `f.team`; para cada equipe de `loadTeams()`
  (`scripts/lib/common.js`, já lê `config/teams.json`), montar o mesmo objeto de catálogo de hoje
  (`_comment`, `total`, `keys: [...]`) só com as FFs dessa equipe (`total` e `keys` recalculados por equipe,
  `keys` ordenado por `key` como hoje); grava em `catalog/<team>/keys.json`.
- `--check`: para cada equipe, recalcula e compara com o arquivo em disco (mesmo texto exato de hoje, gerado com
  `JSON.stringify(catalog, null, 2) + '\n'`); nomeia a equipe e o caminho no erro, sem escrever nada.
- `--all`: monta o mesmo formato de hoje (`total` = todas as FFs, `keys` = todas, ordenadas por `key`,
  independente da equipe) e só `console.log` do JSON — nunca grava arquivo.
- Sem `--check` nem `--all`: grava todos os `catalog/<team>/keys.json` (comportamento padrão descrito acima).
- FF sem `team` válido (não deveria acontecer — `validate.js` já reprova antes) não entra em nenhum catálogo por
  equipe; não é objetivo desta spec tratar esse caso além do que `validate.js` já garante.

**`scripts/lib/common.js`:** sem mudança de assinatura; usa `loadTeams()` já existente.

**Remoção:** apagar `catalog/keys.json` do repositório nesta `chore/*` (o próprio commit desta spec já grava os
`catalog/<team>/keys.json` novos e remove o antigo).

## Arquivos afetados

- `scripts/catalog.js`: reescrito para gerar/checar por equipe e o modo `--all`.
- `scripts/catalog.test.js` (novo): testes de CA-1 a CA-6, com `flags`/`config/teams.json` de teste (usando as
  mesmas convenções de injeção de dependência já usadas em outros testes de `scripts/*.test.js`, ou um diretório
  temporário — a decidir na implementação, sem mudar a assinatura pública de `catalog.js`).
- `catalog/keys.json`: removido.
- `README.md`: linha 40 (mapa de pastas), linha 58 (tabela de scripts), linha 169 (fluxo de `feature/*`), linhas
  138-141 (regra por tipo de branch: `catalog/` passa a ser `catalog/<equipe>/`), linha 398 (armadilhas).
- `CLAUDE.md`: linha do "Mapa dos processos" que cita `npm run catalog` (segue citando o comando, sem mudança de
  texto — o comando continua o mesmo, só o resultado muda de um arquivo para vários).
- `scripts/lib/scope.js`: comentário e checagem de `release/*`/`remove/*` que citam `catalog/` — confirmam que o
  prefixo `catalog/` (usado em `f.startsWith('catalog/')`) continua batendo com `catalog/<team>/keys.json` (é
  prefixo de caminho, não precisa mudar; só o comentário do arquivo é atualizado para não confundir).
- `scripts/lib/scope.test.js`, `scripts/lib/new-flags.test.js`, `scripts/lib/ownership.test.js`,
  `scripts/check-ownership.test.js`, `scripts/processos.test.js`: testes que citam `catalog/keys.json` como
  exemplo de caminho — trocar para `catalog/<equipe>/keys.json` (ou uma equipe de exemplo concreta) onde o teste
  depende do caminho exato; onde só testam o prefixo `catalog/` sem verificar o nome exato, não muda.

## Plano de implementação

### Task 1: `catalog.js` gera e confere por equipe

**Files:** `scripts/catalog.js`, `scripts/catalog.test.js`

**Interfaces:** usa `loadFlags`, `loadTeams` de `./lib/common` (já existem, sem mudança de assinatura).

1. Teste: com duas equipes e uma FF em cada, `node scripts/catalog.js` grava dois arquivos
   (`catalog/<team1>/keys.json`, `catalog/<team2>/keys.json`), cada um só com a FF da própria equipe; equipe sem
   FF ganha arquivo com `total: 0`.
2. Implementação: agrupar por `team`, gravar um arquivo por equipe de `loadTeams()`.
3. Comando: `npm test` (esperado: os novos testes passam).

### Task 2: `--check` por equipe e `--all` sem gravar

**Files:** `scripts/catalog.js`, `scripts/catalog.test.js`

**Interfaces:** `--check` e `--all` como flags de `parseArgs` (já existente).

1. Teste: `--check` falha nomeando a equipe quando um `catalog/<team>/keys.json` está desatualizado ou ausente;
   `--all` imprime todas as FFs de todas as equipes e não altera nenhum arquivo (`git status` sem diferença antes
   e depois, no teste real ou verificado manualmente).
2. Implementação: `--check` itera as equipes; `--all` monta o agregado e só `console.log`.
3. Comando: `npm test`.

### Task 3: remover o catálogo único antigo e atualizar docs/testes existentes

**Files:** `catalog/keys.json` (removido), `README.md`, `scripts/lib/scope.js` (comentário),
`scripts/lib/scope.test.js`, `scripts/lib/new-flags.test.js`, `scripts/lib/ownership.test.js`,
`scripts/check-ownership.test.js`, `scripts/processos.test.js`

**Interfaces:** nenhuma nova; só ajusta caminhos de exemplo (`catalog/keys.json` → `catalog/<equipe>/keys.json`)
em testes e comentários já existentes.

1. Apagar `catalog/keys.json`; ajustar os testes existentes que citam esse caminho para
   `catalog/<equipe>/keys.json` (equipe de exemplo do próprio teste).
2. Atualizar o README nos pontos listados em *Arquivos afetados*.
3. Comando: `npm test`, `npm run validate`, `npm run specs` (esperado: todos passam).

## Verificação

- `npm test` passa, incluindo `scripts/catalog.test.js` (novo) e os testes existentes ajustados.
- `npm run validate` passa (chama `catalog.js --check` por equipe).
- `npm run specs` passa.
- Manual: `npm run catalog` gera um `catalog/<equipe>/keys.json` por equipe de `config/teams.json`; `node
  scripts/catalog.js --all` imprime o agregado sem gravar nada (`git status --short` limpo antes e depois).

## Riscos e reversão

- `catalog/keys.json` (arquivo único) some do repositório: qualquer processo externo que ainda leia esse caminho
  direto (nenhum script do repositório lê — só é gerado e checado — confirmado nesta sessão) para de encontrar o
  arquivo. Reversão: reverter o commit desta spec recria `catalog/keys.json` e apaga os `catalog/<team>/`.
- Migração de dado: nenhuma — o conteúdo por equipe é só um recorte do que já existia no arquivo único; a
  primeira execução de `npm run catalog` nesta `chore/*` já gera todos os arquivos novos a partir do
  `flags/*.json` atual.
- Equipe nova em `config/teams.json` sem `catalog/<equipe>/` ainda: a próxima `npm run catalog` já cria o arquivo
  (vazio, se a equipe não tiver FF); não precisa de passo manual.

## Decisões

- Só o catálogo muda de pasta (não `flags/`/`env/`): `flags/<key>.json` e `env/nonprod|prod/<key>.json` já são um
  arquivo por chave, então já não colidem entre equipes; migrar essas pastas também exigiria mudar
  `check-ownership.js`, `scope.js`, `new-flag.js`, `remove-flags.js` e o preflight sem ganho de isolamento
  adicional — decisão do usuário, para manter a mudança pequena e sem migrar os 2 arquivos de FF já existentes.
- Um catálogo agregado (`--all`) continua disponível, mas só sob demanda e sem virar arquivo commitado: preserva
  a utilidade de "ver tudo" sem recriar o ponto de conflito que esta spec remove.
- Equipe sem FF ainda ganha um `catalog/<team>/keys.json` vazio (em vez de não criar o arquivo): mantém o
  `--check` simples (sempre uma equipe, sempre um arquivo) e deixa explícito, por equipe, que não há FF nenhuma
  ainda.
