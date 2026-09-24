---
spec: 0003
titulo: Skill e comando para consultar o status das FFs
status: implementada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0003 — Skill e comando para consultar o status das FFs

## Resumo

Como **desenvolvedor ou dono de uma FF**, quero **perguntar ao Claude (ou rodar um comando) pelo status das Feature Flags**, para que **eu veja, sem abrir o console do Firebase, o que está ligado, em quais plataformas, a partir de qual versão, em que porcentagem e se o Firebase confere com a `main`**.

## Contexto

Hoje o status de uma FF só se descobre lendo `flags/` e `env/` à mão, abrindo o console do Firebase ou rodando `verify-sync` (que só diz "sincronizado" ou lista divergências). Não existe uma visão única por FF, nem consulta por plataforma, dono ou porcentagem, nem o histórico do que foi publicado. A skill `feature-flags` do marketplace de plugins (Fury) resolve isso para outro produto consultando uma API ao vivo: lista, detalhe, rollout, busca, por criador, resumo e "por que estou fora". Queremos o equivalente para o Remote Config deste repositório.

## Objetivo e fora de escopo

**Objetivo:** um comando somente leitura, `scripts/ff-status.js`, e uma skill do projeto, `ff-status`, que respondem sobre o estado das FFs a partir do repositório e, quando há credencial, do Remote Config real (NÃO PROD).

**Fora de escopo:** qualquer escrita (publicar, corrigir, apagar); métricas de uso ou saúde por FF (o Remote Config não as fornece; ficam no Analytics/Crashlytics); avaliar "por que o usuário X está fora" para um usuário específico; PROD no Firebase (não há projeto ainda; PROD aparece só pelo RM do repositório); publicar a skill no marketplace de plugins.

## Critérios de aceite

- [x] CA-1: `ff-status.js list` mostra uma linha por FF com chave, tipo (toggle/config), tipo no Remote Config (Boolean/String), plataformas, versão mínima, criticidade, dono e o estado por plataforma (`ligada 100%`, `ligada 50%`, `desligada`, `n/a`).
- [x] CA-2: `ff-status.js detail <chave>` mostra a ficha completa: definição, valores por ambiente e plataforma, o que o app recebe (na versão mínima, logo abaixo e fora das plataformas) e, com Firebase, as condições e o valor padrão publicados.
- [x] CA-3: `ff-status.js rollout <chave>` mostra a porcentagem por plataforma e a versão mínima; para PROD, o estágio atual do RM ou "aguardando o horário".
- [x] CA-4: `ff-status.js summary` conta FFs por estado, plataforma, tipo e criticidade, indica quantas estão em rollout parcial e mostra a última publicação no Firebase (versão, data, quem).
- [x] CA-5: `ff-status.js sync` compara `main` com o Firebase por FF (`ok`, `diverge` com o motivo, `ausente`) e lista as chaves que só existem no Firebase.
- [x] CA-6: `ff-status.js history [--limit N]` lista as últimas versões publicadas (número, data, quem, descrição), 10 por padrão.
- [x] CA-7: `ff-status.js stale` aponta candidatas a limpeza: toggles ligados em 100% em todas as plataformas da FF, mais chaves no Firebase que não estão no repositório.
- [x] CA-8: os filtros `--platform android|ios`, `--owner <squad>`, `--search <termo>` e `--criticality <nível>` valem para `list` e `summary`.
- [x] CA-9: sem `FIREBASE_SA_KEY_NONPROD` (ou com `--offline`) o comando responde só com o repositório e avisa "Firebase não consultado"; com a credencial, qualquer falha de rede sai com mensagem clara e código 1.
- [x] CA-10: o comando é somente leitura: nenhuma chamada de escrita do Admin SDK é feita (`validateTemplate`, `publishTemplate`, `createTemplateFromJSON`, etc.) e um teste com um cliente falso que falha em qualquer escrita prova isso.
- [x] CA-11: chave, termo, dono e demais argumentos são validados (chave `ft_`/`rc_`, termo `[A-Za-z0-9_-]{1,40}`, plataforma e criticidade nos valores válidos); entrada fora disso sai com erro sem executar nada.
- [x] CA-12: `--json` imprime a mesma informação em JSON estável para o Claude ou outra ferramenta consumir.
- [x] CA-13: a skill `.claude/skills/ff-status/SKILL.md` mapeia perguntas em português e inglês para os subcomandos, valida os argumentos antes de montar o comando, usa só `node scripts/ff-status.js`, é somente leitura e sugere o próximo passo depois de cada resposta.
- [x] CA-14: `check-specs` não confunde palavras comuns em português (a palavra "todo" e "método") com marcador de pendência: só contam as siglas de pendência em maiúsculas e as expressões de adiamento previstas no template.

## Desenho

**Fontes.** (1) Repositório: `loadFlags()`, `loadRms()`, `environments()` de `scripts/lib/common.js`. (2) Firebase NÃO PROD, se houver credencial: `connect(cfgEnv)` de `remote-config.js` → `getTemplate()` e `listVersions({ pageSize })`. Nenhum método de escrita é importado no caminho do comando.

**Lógica pura em `scripts/lib/status.js`** (testável sem Firebase; recebe `template` e `versions` como dados):

- `flagRow(flag, env, { rms, now })` → linha de status por FF a partir do repositório: estado por plataforma vem de `rules()`/`expectedAt()` (mesma regra que o deploy usa, então não pode divergir dela).
- `syncOf(flag, env, template, cfgEnv)` → `ok | diverge | ausente` por FF, reaproveitando `build()` e `diff()` de `remote-config.js` para uma FF só.
- `extras(template, flags)` → chaves do Firebase fora do repositório.
- `summarize(rows)`, `staleCandidates(rows, extras)`, `filterRows(rows, filters)`.
- `renderTable(rows)`, `renderDetail(...)`, `renderSummary(...)`, `renderHistory(...)`: Markdown, o que a skill mostra ao usuário.

**CLI em `scripts/ff-status.js`:** `node scripts/ff-status.js <list|detail|rollout|summary|sync|history|stale> [chave] [--env nonprod|prod] [--platform ..] [--owner ..] [--search ..] [--criticality ..] [--limit N] [--json] [--offline]`. Lê argumentos, valida (CA-11), monta os dados, chama a lógica e imprime. Sai com 1 em erro. `--env prod` usa só o repositório (o RM define o estágio); não há projeto de PROD no Firebase ainda.

**Skill `ff-status`:** copia o jeito da skill de referência (classificação de intenção por tabela, exemplos de uso, regras de segurança, sugestão do próximo passo), trocando as chamadas HTTP por `node scripts/ff-status.js`. Idioma da resposta: o do usuário.

**Convivência com a skill `feature-flag`:** `feature-flag` cria e altera FFs; `ff-status` só consulta. Cada uma cita a outra.

## Arquivos afetados

- `scripts/lib/specs.js` e `scripts/lib/specs.test.js`: correção do marcador de pendência.
- `scripts/lib/status.js` e `scripts/lib/status.test.js`: lógica pura e testes.
- `scripts/ff-status.js` e `scripts/ff-status.test.js`: CLI e testes (modo offline e cliente falso).
- `.claude/skills/ff-status/SKILL.md` e `scripts/skills.test.js`: a skill e o teste que trava o formato dela.
- `.claude/skills/feature-flag/SKILL.md`, `CLAUDE.md`, `README.md`: apontam para a nova skill e o comando.
- `package.json`: script `npm run status`.

## Plano de implementação

### Task 1: Linha de status por FF a partir do repositório

**Files:** `scripts/lib/status.js`, `scripts/lib/status.test.js`

**Interfaces:** consome `rules`, `expectedAt`, `platformsOf`, `minVersionFor`, `kindOf`, `valueTypeOf` de `scripts/lib/flags.js` e `currentStage` de `scripts/lib/rollout.js`; produz `flagRow(flag, env, { rms, now }) -> { key, kind, valueType, platforms, minVersion, criticality, owner, group, description, perPlatform: { ios, android } }`, onde cada plataforma é `{ state: 'ligada'|'desligada'|'n/a', percent, value }`; produz `filterRows(rows, { platform, owner, search, criticality })`.

1. Teste: FF ligada em 100% no iOS e 50% no Android, FF só de iOS (Android `n/a`), FF `rc_` com valor, e cada filtro.
2. Implementação: `flagRow` e `filterRows`.
3. Comando: `node --test scripts/lib/status.test.js` (esperado: passa).

### Task 2: Sincronia, extras, resumo e candidatas a limpeza

**Files:** `scripts/lib/status.js`, `scripts/lib/status.test.js`

**Interfaces:** consome `build`, `diff`, `findRemote` de `scripts/lib/remote-config.js`; produz `syncOf(flag, env, template, cfgEnv, rms, now) -> { state: 'ok'|'diverge'|'ausente', problems: string[] }`, `extras(template, flags) -> string[]`, `summarize(rows) -> { total, porEstado, porPlataforma, porTipo, porCriticidade, parciais }`, `staleCandidates(rows, extraKeys) -> { ligadasEm100: string[], foraDoRepositorio: string[] }`.

1. Teste: template gerado por `apply(build(...))` dá `ok`; valor adulterado dá `diverge` com o motivo; FF sem parâmetro dá `ausente`; chave só no template entra em `extras`; contagens e candidatas.
2. Implementação: as quatro funções.
3. Comando: `node --test scripts/lib/status.test.js`.

### Task 3: Renderização em Markdown

**Files:** `scripts/lib/status.js`, `scripts/lib/status.test.js`

**Interfaces:** produz `servedFor(flag, env)`, `remoteInfo(template, key)`, `renderTable(rows, { sync }) -> string`, `renderDetail(row, { flag, env, sync, template }) -> string`, `renderRollout(row, { flag, env, rm, now }) -> string`, `renderSummary(summary, { lastVersion }) -> string`, `renderHistory(versions) -> string`, `renderSync({ rows, sync, extras }) -> string` e `renderStale({ ligadasEm100, foraDoRepositorio }) -> string`.

1. Teste: saída contém cabeçalho, uma linha por FF, o estado por plataforma e o aviso "Firebase não consultado" quando não há template.
2. Implementação: as renderizações.
3. Comando: `node --test scripts/lib/status.test.js`.

### Task 4: CLI somente leitura, validação e modo offline

**Files:** `scripts/ff-status.js`, `scripts/ff-status.test.js`, `package.json`

**Interfaces:** consome tudo de `scripts/lib/status.js`, `connect` de `scripts/lib/remote-config.js`, `loadFlags`, `loadRms`, `environments`, `parseArgs` de `scripts/lib/common.js`; produz `parseStatusArgs(args) -> consulta` (em `scripts/lib/status.js`, lança erro em argumento inválido), `run(argv, deps) -> Promise<exit code>` (exportado por `scripts/ff-status.js`, com `deps` injetável) e o comando `node scripts/ff-status.js <subcomando> ...` (exit 0 em sucesso, 1 em erro) e `npm run status`.

1. Teste: subcomandos rodando `--offline` sobre o repositório real; `--json` parseável; argumento inválido (`ft_x; rm -rf`, plataforma `web`) sai com 1; com `rc` falso que falha em qualquer método de escrita, `list`, `sync`, `history` e `stale` passam (CA-10).
2. Implementação: parsing, validação, conexão opcional, despacho por subcomando. A conexão é injetável para o teste.
3. Comando: `npm test` (esperado: todos passam).

### Task 5: Skill, documentação e verificação final

**Files:** `.claude/skills/ff-status/SKILL.md`, `.claude/skills/feature-flag/SKILL.md`, `CLAUDE.md`, `README.md`

**Interfaces:** consome o comando `node scripts/ff-status.js`; produz a skill `ff-status` com tabela de intenções (listar, detalhe, rollout, buscar, dono, plataforma, resumo, sincronia, histórico, obsoletas), exemplos de uso, regras de segurança e sugestão do próximo passo.

1. Escrita da skill, espelhando a estrutura da skill de referência (segurança, intenções, ajuda sem argumentos, tratamento de erro, regras).
2. Atualizar README (tabela de scripts, seção de Claude Code), CLAUDE.md (comando) e a skill `feature-flag` (cita `ff-status`).
3. Comando: `npm test && npm run validate && npm run specs` e marcar os critérios de aceite.

### Task 6: Corrigir o falso positivo do marcador de pendência

**Files:** `scripts/lib/specs.js`, `scripts/lib/specs.test.js`

**Interfaces:** consome o `PENDING` de `scripts/lib/specs.js`; produz o mesmo `checkSpec(fileName, text)`, agora sem reprovar as palavras comuns "todo" e "método" e reprovando as siglas de pendência em maiúsculas e as expressões de adiamento.

1. Teste: spec aprovada com "todo o repositório" e "método" passa; com cada marcador de pendência reprova.
2. Implementação: regex com maiúsculas exatas e limites de palavra que entendem acento.
3. Comando: `node --test scripts/lib/specs.test.js` (esperado: passa).

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- `node scripts/ff-status.js list --offline` mostra as 5 FFs de teste com plataforma e versão mínima; `summary --offline` fecha as contagens.
- Com `FIREBASE_SA_KEY_NONPROD`: `node scripts/ff-status.js sync` e `history` respondem com dados reais (verificação manual, depois do `sync-nonprod`).
- Pedir à skill "quais FFs estão ligadas no iOS?" e "detalhe ft_plat_ios_50" e conferir que ela roda o comando e apresenta o resultado.

## Riscos e reversão

- **`listVersions` exige permissão do service account:** o papel *Firebase Remote Config Admin* já cobre; se faltar, `history` avisa e o resto continua.
- **Estado por plataforma deriva do repositório, não do Firebase:** por isso `sync` existe; a linha de status mostra a sincronia ao lado.
- **Reversão:** o comando é isolado (arquivos novos); reverter o merge da `chore/*` remove a skill e o script sem afetar deploy nem pipeline.

## Decisões

- **Script Node com a lógica testada, e a skill só o chama**, em vez de `curl` dentro da skill como na referência: o Remote Config exige o Admin SDK e a regra de "o que o app recebe" já existe em `flags.js`; duplicá-la na skill divergiria.
- **Somente leitura e sem credencial obrigatória:** o modo offline serve quem não tem a chave do Firebase e mantém a skill útil no dia a dia.
- **Status "ligada/desligada" vem do repositório e a sincronia mostra se o Firebase confere**, para não haver duas fontes de verdade concorrentes.
- **Skill dentro deste repositório** (`.claude/skills/`), não no marketplace de plugins: ela depende dos scripts daqui.
- **Sem métricas de uso:** o Remote Config não tem esse dado; a skill redireciona para Analytics/Crashlytics, como a de referência faz com o Usage Monitoring.
