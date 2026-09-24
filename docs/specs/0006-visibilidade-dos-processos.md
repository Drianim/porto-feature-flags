---
spec: 0006
titulo: Visibilidade de todos os processos nas skills e no CLAUDE.md, com teste de cobertura
status: aprovada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0006 — Visibilidade de todos os processos nas skills e no CLAUDE.md, com teste de cobertura

## Resumo

Como **quem trabalha neste repositório com um Claude Code**, quero **que as skills e o `CLAUDE.md` conheçam todos os processos que criamos, sem trechos desatualizados**, para que **o Claude saiba o que fazer (e o que não fazer) em qualquer pedido, e um processo novo não fique de fora**.

## Contexto

Uma auditoria comparou 20 processos com o texto de cada arquivo. O `README.md` cobre os 20, o `CLAUDE.md` (sempre carregado) cobre 9 e a skill `feature-flag` cobre 13. Faltam na `feature-flag`: o Run manual da pipeline como regra geral, a reversão automática, o `test-platforms`, o hook `pre-push`, o template de PR, a criação de branch pela interface do Bitbucket, o escopo de PoC e onde ficam as credenciais. Há trechos errados: manda rodar `check-new-flags` antes do PR de `release/*` (hoje é `npm run preflight`) e diz que o deploy usa `FIREBASE_PROJECT_<ENV>` como variável de Deployment (o NÃO PROD usa a variável de repositório `FIREBASE_SA_KEY_NONPROD`). A `description` do frontmatter não cita remover, equipe, permissão nem código do app, então a skill pode não ser acionada nesses pedidos. As skills cresceram por acréscimo, sem nada que avise quando ficam para trás.

## Objetivo e fora de escopo

**Objetivo:** (1) reescrever a skill `feature-flag` para cobrir todos os processos de operação de FF, sem trechos errados e com uma `description` que aciona nos pedidos certos; (2) um "Mapa dos processos" no `CLAUDE.md` (processo, onde está, comando ou skill); (3) as três skills se referenciam, sem duplicar conteúdo; (4) um teste que mantém a lista de processos e falha quando um processo some do README, do mapa ou da skill dona, ou quando uma skill cita um comando que não existe.

**Fora de escopo:** mudar comportamento de scripts, pipeline ou FF; criar skills novas; gerar o `CLAUDE.md` a partir de uma fonte (o mapa é escrito à mão e o teste o confere).

## Critérios de aceite

- [ ] CA-1: o `CLAUDE.md` ganha o "Mapa dos processos", uma tabela com todos os processos da lista do teste, cada um com onde está documentado e o comando ou a skill.
- [ ] CA-2: a `description` da skill `feature-flag` cita os pedidos que devem acioná-la: criar, alterar, remover, levar a PROD, equipe e permissão, plataforma e versão mínima, código do app, rollback, pipeline, PR e branch.
- [ ] CA-3: a skill não tem mais os trechos errados: usa `npm run preflight` antes do PR de `release/*` e descreve a credencial como variável de repositório `FIREBASE_SA_KEY_NONPROD` (secured) com o escopo de PoC (só NÃO PROD).
- [ ] CA-4: a skill cobre o Run manual depois do merge, a reversão automática (o que fazer quando aparece `revert/*`), `test-platforms`, o hook `pre-push`, o template de PR, a criação de branch pela interface do Bitbucket, o catálogo e o rollback.
- [ ] CA-5: as três skills se referenciam (`feature-flag`, `ff-status`, `sdd-scripts`) e cada uma diz quando usar a outra.
- [ ] CA-6: `scripts/processos.test.js` lista os processos e exige que cada um esteja no README, no mapa do `CLAUDE.md` e na skill dona, com a mensagem trazendo o nome do processo que falta.
- [ ] CA-7: o mesmo teste confere que todo `npm run <script>` e todo `node scripts/<arquivo>` citado nas skills, no `CLAUDE.md` e no README existe (em `package.json` e em `scripts/`).
- [ ] CA-8: `docs/sdd/README.md` e a skill `sdd-scripts` mandam colocar um processo novo no mapa e no teste de cobertura no passo "Documentar".

## Desenho

- **Registro dos processos:** vive em `scripts/processos.test.js` (uma lista com nome, pistas do README, skill dona e pistas da skill). Processo novo entra ali; o teste é o que lembra.
- **Skill `feature-flag` reescrita por inteiro** (não por acréscimo), na ordem em que uma pessoa usa: contexto e regras gerais; perguntas antes de criar; qual branch usar e como criá-la (inclusive pela interface do Bitbucket); criar, alterar, remover, PROD; o que acontece depois do merge (reconferência, Run manual, deploy, verify, `sync-nonprod`, reversão automática); equipe e permissão; plataforma e versão mínima; código do app; rollback; verificações (`test-platforms`, `verify-sync`); e ponteiros para `ff-status` e `sdd-scripts`.
- **Mapa no `CLAUDE.md`:** tabela curta e sempre carregada; o detalhe continua no README e nas skills.
- **Guarda contra comandos velhos:** o teste extrai `npm run <x>` e `node scripts/<y>.js` dos textos e confere contra `package.json` e `scripts/`.
- **Descrições:** o teste exige palavras-gatilho na `description` de cada skill.

## Arquivos afetados

- `scripts/processos.test.js`: registro dos processos e testes de cobertura.
- `.claude/skills/feature-flag/SKILL.md`: reescrita.
- `.claude/skills/ff-status/SKILL.md`, `.claude/skills/sdd-scripts/SKILL.md`: referências entre skills e o passo de documentar.
- `CLAUDE.md`: mapa dos processos.
- `docs/sdd/README.md`: passo "Documentar" cita o mapa e o teste.

## Plano de implementação

### Task 1: Teste de cobertura dos processos

**Files:** `scripts/processos.test.js`

**Interfaces:** consome `package.json` (scripts npm), a pasta `scripts/` e os textos de `README.md`, `CLAUDE.md` e das três skills; produz os testes de CA-1 a CA-7.

1. Teste: escrever o teste com a lista de processos e rodar (esperado: falha nos processos que faltam e nos trechos errados).
2. Implementação: nenhuma além do teste.
3. Comando: `node --test scripts/processos.test.js` (esperado: falha, listando o que falta).

### Task 2: Reescrever a skill feature-flag

**Files:** `.claude/skills/feature-flag/SKILL.md`

**Interfaces:** produz a skill com a `description` nova e as seções listadas no Desenho.

1. Escrever a skill por inteiro, corrigindo os trechos errados e cobrindo os processos que faltam.
2. Comando: `node --test scripts/processos.test.js` (esperado: os testes da skill passam).

### Task 3: Mapa no CLAUDE.md e referências entre skills

**Files:** `CLAUDE.md`, `.claude/skills/ff-status/SKILL.md`, `.claude/skills/sdd-scripts/SKILL.md`, `docs/sdd/README.md`

**Interfaces:** consome a lista de processos do teste; produz o "Mapa dos processos", as referências entre skills e o passo "Documentar" atualizado.

1. Escrever o mapa e as referências.
2. Comando: `npm test && npm run validate && npm run specs` (esperado: passa).

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- Rodar de novo a auditoria (processo por arquivo): cada processo aparece no README, no mapa do `CLAUDE.md` e na skill dona.
- Remover um processo do mapa e ver o teste falhar com o nome dele (verificação manual do teste).

## Riscos e reversão

- **Palavra-chave por substring é frágil:** o teste confere presença de pistas, não qualidade do texto. Ele não substitui a leitura, só evita o esquecimento.
- **Lista de processos precisa ser mantida:** um processo novo só é cobrado se entrar na lista; por isso o passo "Documentar" do SDD manda atualizá-la.
- **Reversão:** só documentação e um teste; reverter o merge da `chore/*` devolve as skills ao estado anterior sem afetar FF, deploy ou pipeline.

## Decisões

- Reescrever a skill por inteiro: o acréscimo foi o que gerou as inconsistências.
- Mapa no `CLAUDE.md` (sempre carregado) e detalhe nas skills (por gatilho): dá visibilidade barata sem inflar o contexto.
- Teste em vez de gerador: um gerador do `CLAUDE.md` seria mais uma coisa a manter; o teste custa pouco e pega o esquecimento.
