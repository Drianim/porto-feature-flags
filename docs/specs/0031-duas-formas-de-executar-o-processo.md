---
spec: 0031
titulo: README explica as duas formas de executar o processo de FF (scripts ou Claude Code)
status: implementada
criado: 2026-09-27
atualizado: 2026-09-28
---

# Spec 0031 — README explica as duas formas de executar o processo de FF (scripts ou Claude Code)

## Resumo

Como **quem vai operar uma FF neste repositório pela primeira vez**, quero **uma seção no README que explique, passo
a passo, as duas formas de executar o processo (rodando os scripts diretamente, ou pedindo a um Claude Code)**, para
que **eu escolha o caminho certo para o meu caso e saiba o pré-requisito de cada um antes de começar**.

## Contexto

O README já documenta cada processo em detalhe, espalhado por seções: "Processo: como uma FF chega ao Firebase"
(linhas 132–231, com o passo a passo via `npm run new:flag`/`npm run catalog`/`npm run preflight`/`npm run pr`) e
"Trabalhando com o Claude Code e o SDD" (linhas 369–399, com a tabela das três skills e o ciclo do SDD). O que falta
é um ponto de entrada curto, logo no início do documento, que diga explicitamente: **existem duas formas de
executar os mesmos passos** — rodando os comandos você mesmo (precisa de Node.js/npm instalado) ou conversando com
um Claude Code que já sabe rodar esses comandos por você (usando as skills `feature-flag`/`ff-status`/`sdd-scripts`)
— e que aponte para onde cada uma está detalhada, em vez de fazer quem chega ao repositório montar esse mapa sozinho
lendo o documento inteiro.

Não existe hoje nenhuma seção que compare as duas formas lado a lado nem que avise sobre o pré-requisito de `npm`
para a forma 1. `scripts/processos.test.js` garante que todo *processo* (criar FF, alterar, remover, etc.) apareça
no README, no Mapa dos processos do `CLAUDE.md` e na skill dona — mas isso já está coberto; o que esta spec
acrescenta é uma camada de navegação sobre esses processos já existentes, não um processo novo.

## Objetivo e fora de escopo

**Objetivo:** README ganha uma seção curta, logo depois de "Em uma tela", que explica as duas formas de executar o
processo (scripts crus vs. Claude Code), com os passos de cada uma e o aviso do pré-requisito de `npm` na forma 1.

**Fora de escopo:**
- Não cria nenhum comando, script ou skill novo — só documenta o que já existe.
- Não duplica o passo a passo detalhado já escrito em "Processo: como uma FF chega ao Firebase" nem em "Trabalhando
  com o Claude Code e o SDD": a seção nova resume e referencia essas seções (link interno), não as reescreve.
- Não mexe em `CLAUDE.md`, nas skills nem em `scripts/processos.test.js`: não é um "processo" novo na acepção do
  teste (não introduz uma branch, comando ou skill nova), é uma seção de orientação sobre processos já cobertos.

## Critérios de aceite

- [x] CA-1: README tem uma seção nova (`## Duas formas de executar o processo`, logo após "Em uma tela" e antes de
      "Mapa de pastas e arquivos") que descreve as duas formas: **1 - Scripts** e **2 - Claude Code**.
- [x] CA-2: a subseção "1 - Scripts" explica que é preciso ter **Node.js e npm instalados** (`node -v`/`npm -v`
      para conferir) antes de rodar qualquer comando, lista a sequência mínima de comandos para o caso mais comum
      (criar uma FF: `npm run new:flag`, editar `env/nonprod/<chave>.json`, `npm run catalog && npm run validate`,
      `npm run preflight`/`npm run pr`) e linka para "Processo: como uma FF chega ao Firebase" para o detalhe
      completo (inclusive alterar/remover/PROD).
- [x] CA-3: a subseção "2 - Claude Code" explica que basta pedir em português/inglês o que se quer (ex.: "criar uma
      FF nova", "qual o status da ft_x", "mudar um script") e o Claude Code aciona a skill certa
      (`feature-flag`/`ff-status`/`sdd-scripts`) e roda os mesmos comandos por conta própria, sem precisar decorar
      sintaxe; linka para "Trabalhando com o Claude Code e o SDD" para o detalhe completo.
- [x] CA-4: `npm test`, `npm run validate` e `npm run specs` passam sem alteração de comportamento (mudança é só
      documentação).

## Desenho

Seção nova, só texto (Markdown), sem tabela obrigatória (uma lista com dois itens numerados "1" e "2" já atende o
pedido do usuário de nomear as duas formas). Cada subseção termina apontando (link Markdown) para a seção existente
que já tem o passo a passo completo, evitando duplicar conteúdo que já existe e que teria de ser mantido em dois
lugares.

## Arquivos afetados

- `README.md`: nova seção `## Duas formas de executar o processo` inserida entre "Em uma tela" (termina na tabela
  de branches, linha ~30) e "### Mapa de pastas e arquivos" (linha 32).

## Plano de implementação

### Task 1: escrever a seção no README

**Files:** `README.md`

**Interfaces:** nenhuma (texto).

1. Verificação antes: `npm run specs` e `npm test` passam no estado atual (baseline).
2. Implementação: inserir a seção `## Duas formas de executar o processo` com as subseções "1 - Scripts" (aviso de
   `npm` + comandos mínimos + link) e "2 - Claude Code" (como pedir + skills + link).
3. Comando: `npm run specs` e `npm test` (esperado: continuam passando, nenhum teste depende do texto novo).

## Verificação

- `npm test`, `npm run validate`, `npm run specs`.
- Leitura manual: a seção nova não repete o passo a passo inteiro das duas seções que referencia, só resume e
  linka.

## Riscos e reversão

- **Risco:** a seção nova ficar redundante com as duas seções que já existem. Mitigado por linkar em vez de
  reescrever o passo a passo.
- **Reversão:** `revert/*` do commit de merge (protocolo padrão do repositório); é só texto, sem dado nem código.

## Decisões

- **Por que não é um "processo novo" para `scripts/processos.test.js`:** o teste cobre processos operacionais (criar
  FF, alterar, consultar status, etc.); esta seção é uma camada de navegação sobre processos que já estão cobertos
  lá, não introduz comando, branch ou skill nova.
- **Por que linkar em vez de duplicar:** as duas seções referenciadas ("Processo: como uma FF chega ao Firebase" e
  "Trabalhando com o Claude Code e o SDD") já são detalhadas e mantidas; duplicar o conteúdo criaria dois lugares
  para atualizar a cada mudança futura.
