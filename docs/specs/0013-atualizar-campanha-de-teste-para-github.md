---
spec: 0013
titulo: Atualizar a campanha de teste do processo para o GitHub e explicar os campos do template de PR
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0013 — Atualizar a campanha de teste do processo para o GitHub e explicar os campos do template de PR

## Resumo

Como **responsável pelo processo de FF**, quero **`docs/testes-do-processo.md` com a linguagem e as FFs do GitHub
atual, e o README explicando o que cada campo do template de PR espera**, para que **a campanha completa (positivos
e os 8 negativos) rode sobre um documento correto e quem abre um PR saiba preencher o template sem adivinhar**.

## Contexto

`docs/testes-do-processo.md` (spec 0007, implementada) foi escrito para o Bitbucket: manda "clicar em **Run**" (hoje
é aprovar o ambiente `nonprod` em *Review deployments*, ver `README.md` linha 77 do template de PR e a seção
*Pipelines*) e cita `ft_plat_ios`, uma FF que não existe mais — o repositório está sem nenhuma FF desde a
`remove/limpar-ffs-de-teste` (PR #3). A matriz de `feature/teste-ffs-novas` também precisa de 4 chaves concretas
(hoje só descreve os cenários em prosa). Separadamente, ao usar o `.github/pull_request_template.md` o usuário não
achou, no README, uma explicação campo a campo do que preencher em cada seção (a seção *Preflight e template de PR*,
linha 217, só diz que o arquivo existe e que se apaga o que não se usa).

## Objetivo e fora de escopo

**Objetivo:** (1) reescrever `docs/testes-do-processo.md` com a linguagem do GitHub, sem `ft_plat_ios`, com 4 FFs
concretas para os positivos e a ordem de execução ajustada ao repositório vazio de hoje; (2) acrescentar, na seção
*Preflight e template de PR* do `README.md`, um parágrafo por tipo de branch explicando os campos do template.

**Fora de escopo:** reabrir ou reescrever a spec 0007 (fica como registro histórico da 1ª rodada, no Bitbucket);
criar ou rodar qualquer branch da campanha (é o próximo passo, fora desta spec); mudar o conteúdo do
`.github/pull_request_template.md` em si.

## Critérios de aceite

- [x] CA-1: `docs/testes-do-processo.md` não contém mais "Run" nem `ft_plat_ios`; a linguagem de aprovação usa
  "aprovar o ambiente `nonprod`" / *Review deployments*.
- [x] CA-2: a tabela de positivos lista as 4 chaves concretas (`ft_camp_toggle_ambas`, `ft_camp_toggle_ios_50`,
  `rc_camp_url_override`, `ft_camp_minver_plataforma`) com seus valores, e a ordem sugerida cobre negativos sem
  dependência antes do primeiro merge, depois o merge de `feature/teste-ffs-novas`, depois os negativos que
  dependem de FF existente, depois `update/*`, `remove/*` e por fim `release/*` (só PR).
- [x] CA-3: `README.md`, na seção *Preflight e template de PR*, explica em 1 a 2 frases por tipo de branch o que
  cada campo do template espera e de onde vem o valor (ex.: equipe dona vem de `config/teams.json`).
- [x] CA-4: `npm run specs` passa (esta spec no formato).

## Desenho

Só edição de documentação (`docs/testes-do-processo.md`, `README.md`); nenhum script ou pipeline muda. A tabela de
positivos ganha uma coluna extra "Detalhe da FF" com os valores de cada uma das 4 chaves. A seção de negativos
mantém a tabela original (8 linhas, barreira/passo), só com `update/neg-outra-equipe` explicando a identidade de
autor sintética (não é dado de equipe real, é só um e-mail de teste inequívoco tipo
`neg-outra-equipe@teste.invalido`, usado uma vez, na branch que nunca é mesclada).

## Arquivos afetados

- `docs/testes-do-processo.md`: reescrita (linguagem GitHub, FFs concretas, ordem ajustada).
- `README.md`: novo parágrafo na seção *Preflight e template de PR*.

## Plano de implementação

### Task 1: Reescrever a campanha

**Files:** `docs/testes-do-processo.md`

**Interfaces:** nenhuma; consome os passos já nomeados no PR (`Testes e validação`, `Escopo da branch`, `Permissão
por equipe`, `FF nova x update`) e o vocabulário de aprovação de ambiente do `README.md`/pipelines.

1. Reescrever a página com a tabela de positivos (4 FFs concretas), a de negativos (8, ajustada) e a ordem de
   execução em 6 fases (sem dependência → merge `feature/*` → dependentes → `update/*` → `remove/*` →
   `release/*`).
2. Comando: `npm run specs` (esperado: passa).

### Task 2: Explicar os campos do template de PR no README

**Files:** `README.md`

**Interfaces:** nenhuma; texto novo referenciando `.github/pull_request_template.md` e `config/teams.json`.

1. Acrescentar, na seção *Preflight e template de PR*, um parágrafo por tipo de branch (feature/update/remove/
   release/chore) com 1-2 frases sobre o que cada campo espera.
2. Comando: `npm run specs` (esperado: passa; não há teste automatizado de conteúdo do README).

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- `grep -n "Run\|ft_plat_ios" docs/testes-do-processo.md` não retorna nada.
- Leitura humana do novo parágrafo do README confirma que cobre os 5 tipos de branch.

## Riscos e reversão

- **Nenhum:** é só documentação; reverter é reverter o merge do `chore/*`, sem efeito em FF, script ou pipeline.

## Decisões

- Spec nova (0013) em vez de reabrir a 0007: a 0007 já está `implementada` e descreve fielmente o que foi feito na
  1ª rodada (histórico); esta é uma atualização de conteúdo, não uma correção da spec anterior.
- Chaves da campanha com prefixo `camp_` (não mais `teste_`) para não colidir, se algum dia alguém reintroduzir os
  nomes antigos como exemplo em outro lugar do repositório.
