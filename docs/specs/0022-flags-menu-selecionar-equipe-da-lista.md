---
spec: 0022
titulo: npm run flags — selecionar a equipe dona de uma lista numerada
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0022 — npm run flags — selecionar a equipe dona de uma lista numerada

## Resumo

Como **quem cria uma FF pelo `npm run flags`**, quero **escolher a equipe dona de uma lista numerada das equipes já
cadastradas**, para que **eu não precise digitar o nome de cor e não descubra um erro de digitação só depois que
`new-flag.js` recusa** (a branch já criada, no fim do fluxo).

## Contexto

Hoje (spec 0018) `scripts/flags-menu.js:48` pergunta `Equipe dona (${equipes.join(', ')}): ` e aceita texto livre;
`equipes` vem de `loadTeams()` (`scripts/lib/common.js`), a mesma lista que `config/teams.json` define. Se o texto
não bater exatamente com uma equipe cadastrada (ex.: `Home`, ou `plataforma` — que é o papel especial de
plataforma, não uma equipe), o menu segue em frente, cria a branch `feature/*`, e só `new-flag.js` (chamado no
fim) recusa com `team "X" não está em config/teams.json (equipes: squad-poc)`. O usuário precisa então apagar a
branch e rodar o menu de novo. Hoje `config/teams.json` só tem `squad-poc` cadastrada.

## Objetivo e fora de escopo

**Objetivo:** na opção 1 (criar FF), a pergunta da equipe dona mostra as equipes de `loadTeams()` numeradas (ex.:
`1 - squad-poc`) e só aceita um número da lista; se o usuário digitar algo que não seja um número válido da lista,
a pergunta repete (mostrando a lista de novo), sem avançar para as próximas perguntas nem criar a branch.

**Fora de escopo:** mudar `new-flag.js` (continua exigindo `--team` e validando; a validação lá permanece como
rede de segurança, só deixa de ser alcançada por essa causa específica) ou `config/teams.json`; qualquer forma de
seleção por seta/teclado especial (a lista numerada usa só `readline` linha a linha, igual ao resto do menu);
mudar a pergunta de criticidade, plataformas ou qualquer outro campo (só a equipe).

## Critérios de aceite

- [x] CA-1: a pergunta da equipe mostra cada equipe de `loadTeams()` numerada, uma por linha (`1 - squad-poc`,
      `2 - squad-x`, ...), seguida de `Escolha o número da equipe: `.
- [x] CA-2: respondendo um número válido (`1` a `N`), o menu segue com o nome da equipe correspondente (mesmo
      valor que hoje seguiria para `new-flag.js --team`).
- [x] CA-3: respondendo algo inválido (fora do intervalo, texto, vazio), o menu mostra a lista de novo e repete a
      pergunta, sem avançar nem criar a branch, até receber um número válido.
- [x] CA-4: `npm test` cobre CA-1 a CA-3 (escolha válida de primeira, escolha inválida seguida de válida) e passa;
      os testes existentes de `flags-menu.test.js` que hoje simulam `squad-b`/`squad-fora` por texto livre são
      ajustados para responder pelo número da lista.
- [x] CA-5: `npm run specs` passa.

## Desenho

Nova função em `scripts/flags-menu.js`, `perguntaEquipe(rl, equipes)`: imprime `${i+1} - ${equipes[i]}` para cada
equipe, pergunta `Escolha o número da equipe: ` via `pergunta()` (já existente), tenta `Number(resposta)`; se for
um inteiro entre `1` e `equipes.length`, devolve `equipes[n-1]`; senão imprime a lista de novo e repete (mesmo
padrão de laço de `perguntaObrigatoria`, mas validando contra a lista em vez de só "não vazio"). Substitui, em
`criarFF`, a linha atual `const team = await perguntaObrigatoria(rl, ...)` por `const team =
await perguntaEquipe(rl, equipes)`. Nenhuma mudança em `new-flag.js`: o valor devolvido já é sempre um nome válido
de `config/teams.json`, então a validação de lá deixa de barrar por esse motivo, mas continua existindo (defesa
em profundidade, e outros campos ainda passam por ela).

## Arquivos afetados

- `scripts/flags-menu.js`: nova função `perguntaEquipe`; troca a pergunta de equipe em `criarFF`.
- `scripts/flags-menu.test.js`: testes novos (CA-1 a CA-3) e ajuste dos testes existentes que hoje respondem
  `squad-b`/`squad-fora` por texto (passam a responder pelo número).

## Plano de implementação

### Task 1: Seleção da equipe por lista numerada

**Files:** `scripts/flags-menu.js`, `scripts/flags-menu.test.js`

**Interfaces:** `perguntaEquipe(rl, equipes: string[]): Promise<string>` — nova função interna de
`scripts/flags-menu.js`, chamada por `criarFF` no lugar da pergunta de texto livre atual; usa `pergunta(rl, texto)`
já existente.

1. Teste (`flags-menu.test.js`): responder `2` para uma lista de duas equipes escolhe a segunda; responder um
   número fora do intervalo (`9`) e depois `1` mostra a lista de novo e segue com a primeira; os dois testes
   existentes que hoje passam `squad-b`/`squad-fora` como texto passam a passar o número da posição na lista (e o
   teste de "equipe inválida" muda de nome/asserção: já não existe mais como texto livre — vira o novo CA-3, ou é
   removido se ficar redundante com o teste novo de número inválido).
2. Implementação: `perguntaEquipe` em `scripts/flags-menu.js`, chamada em `criarFF` no lugar da linha atual da
   equipe.
3. Comando: `npm test` (esperado: todos passam, incluindo os ajustados).

## Verificação

- `npm test` passa, incluindo os casos novos e ajustados de `flags-menu.test.js`.
- `npm run specs` passa.
- Manual: `npm run flags`, escolher 1, ver a lista numerada de equipes, responder um número inválido e ver a
  lista repetir, depois responder um válido e seguir o fluxo normalmente.

## Riscos e reversão

- Único ponto de mudança é a pergunta da equipe em `criarFF`; não afeta `new-flag.js`, `config/teams.json` nem as
  demais perguntas do menu. Reversão: reverter o commit desta spec (volta a pergunta de texto livre).
- Se `config/teams.json` não tiver nenhuma equipe cadastrada (`equipes` vazio), a lista fica vazia e qualquer
  número é inválido — mesmo caso-limite que hoje já quebraria `new-flag.js` (equipe obrigatória); não é agravado
  por esta spec, mas não é resolvido aqui (fora de escopo: cadastro de equipe é `chore/*` à parte).

## Decisões

- Lista numerada em vez de validar o texto digitado contra a lista (reperguntando com o erro): pedido explícito
  do usuário ("vamos deixar selecionar o que tem já cadastrado"), e evita qualquer risco de digitação (maiúscula,
  hífen, espaço) que a validação por texto ainda deixaria passar como erro do usuário.
- Sem biblioteca de seleção por setas (ex. `inquirer`): mantém a convenção do projeto (sem dependência nova sem
  justificar na spec) e o padrão já usado no resto do menu (`readline` linha a linha).
