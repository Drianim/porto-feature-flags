---
spec: 0030
titulo: remover o rollout automático por tempo em NÃO PROD; percentual muda só por PR manual
status: implementada
criado: 2026-09-27
atualizado: 2026-09-27
---

# Spec 0030 — remover o rollout automático por tempo em NÃO PROD; percentual muda só por PR manual

## Resumo

Como **quem opera FFs `media`/`critica`**, quero **que o percentual de rollout em NÃO PROD só mude quando alguém
abrir um `update/*` alterando `rolloutPercent` diretamente**, para que **eu não dependa do `schedule` do GitHub
Actions (confirmado não confiável nesta conta/repositório) para saber ou garantir quando o rollout avança**.

## Contexto

A spec 0028 criou avanço automático de estágio por tempo em NÃO PROD: ao ativar uma plataforma de FF `media`/
`critica`, `env/nonprod/<key>.json` ganha `rolloutStartedAt`; `scripts/lib/rollout.js`
(`nonprodEffectivePercent`/`nextNonprodStage`/`NONPROD_ROLLOUT_PLANS`) deriva o percentual da diferença entre
`rolloutStartedAt` e agora; `.github/workflows/nonprod-scheduler.yml` (cron a cada 15 min) republica esse cálculo
sem aprovação manual; a spec 0029 acrescentou visibilidade (`npm run status -- rollout`) e alerta de falha
(`scripts/ci/alertar-falha-scheduler.js`) em cima disso.

Depois do merge, investigamos por que o `ft_teste_rollout_auto` não avançava no horário esperado. Um teste
pontual e descartável (`.github/workflows/teste-cron.yml`, sem spec por pedido explícito do usuário) provou, com
uma Issue criada pelo próprio disparo (#38), que o `schedule` do GitHub Actions atrasou **4h07m36s** neste
repositório (esperado `2026-09-27T14:30:00Z`, real `2026-09-27T18:37:36Z`, evento `schedule`). Isso confirma que
`nonprod-scheduler.yml` — e, por extensão, todo o mecanismo de estágio-por-tempo da spec 0028 — não tem garantia
de horário: o percentual "efetivo" calculado por `nonprodEffectivePercent` pode estar certo matematicamente e
mesmo assim o Firebase só refletir isso horas depois, porque é o cron que republica.

O usuário decidiu abandonar o mecanismo por tempo inteiramente: "não vamos mais criar os Jobs e sim PRs [...] para
serem executados conforme escolhido as % da FF", confirmando "sim, substituir de vez" quando perguntado se isso
substitui por completo a automação (spec 0028/0029) em vez de conviver com ela ou valer só para uma FF.

`rolloutPercent` em `env/nonprod/<key>.json` já existe como teto/override manual (`scripts/lib/flags.js`,
`rules()`) — é o mecanismo que esta spec passa a usar como único caminho: uma pessoa escolhe o percentual e abre
um `update/*` alterando esse campo diretamente. A progressão sugerida por criticidade (media 25%→100%; critica
5%→25%→50%→100%) deixa de ser aplicada automaticamente, mas continua documentada como sequência recomendada para
quem decide o próximo `update/*` manualmente.

## Objetivo e fora de escopo

**Objetivo:** nenhum percentual de NÃO PROD muda sozinho por tempo. `rolloutPercent` em `env/nonprod/<key>.json`
é a única fonte do percentual servido, alterado só por `update/*` revisado. Remove o cron dedicado a isso
(`nonprod-scheduler.yml`) e o código que ele existia para servir (`nonprodEffectivePercent`, `nextNonprodStage`,
`NONPROD_ROLLOUT_PLANS`, `rolloutStartedAt`, alerta de falha do scheduler).

**Fora de escopo:**
- Rollout de PROD (RM, `rolloutPlan`, `prodSchedule`) — continua igual, não usa `rolloutStartedAt`.
- Qualquer novo comando de "alterar FF existente" no menu interativo (`flags-menu.js` opções 2/3 continuam não
  implementadas); editar `rolloutPercent` continua sendo edição direta do JSON num `update/*`, como hoje já é
  possível para qualquer override.
- Publicação em NÃO PROD ao mesclar `main` (`main.yml`/`publicar-nonprod`) — não muda; é o mecanismo que já
  publica cada `update/*` mesclado, e passa a ser o único caminho de mudança de percentual.

## Critérios de aceite

- [x] CA-1: `npm run new:flag`/`npm run flags` não grava mais `rolloutStartedAt` em nenhuma criticidade; ativar
      uma plataforma sem `--rollout-percent` grava o override sem esse campo (100% direto, como `baixa` hoje).
- [x] CA-2: `scripts/lib/rollout.js` não exporta mais `nonprodEffectivePercent`, `nextNonprodStage` nem
      `NONPROD_ROLLOUT_PLANS`; `scripts/lib/remote-config.js` (`build`) e `scripts/lib/status.js` (`flagRow`,
      `renderRollout`) calculam o percentual de NÃO PROD só a partir de `rolloutPercent` (sem `now`/tempo).
- [x] CA-3: `scripts/validate.js` reprova `rolloutStartedAt` em qualquer ambiente (campo removido, não só
      "só vale em nonprod").
- [x] CA-4: `.github/workflows/nonprod-scheduler.yml` e `scripts/ci/alertar-falha-scheduler.js` (+ teste) não
      existem mais; `scripts/lib/workflows.test.js` reflete a lista de workflows sem ele.
- [x] CA-5: `env/nonprod/ft_v13.json`, `env/nonprod/ft_v12.json` e `env/nonprod/ft_teste_rollout_auto.json`
      migrados: sem `rolloutStartedAt`, com o percentual que já estava efetivamente em vigor (todas já haviam
      alcançado 100% pelo tempo decorrido — a mudança não altera o que o Firebase serve).
- [x] CA-6: README.md, `.claude/skills/feature-flag/SKILL.md`, `CLAUDE.md` (Mapa dos processos) e
      `scripts/processos.test.js` não mencionam mais rollout automático por tempo em NÃO PROD; documentam o novo
      processo (`update/*` altera `rolloutPercent`) e mantêm a progressão sugerida por criticidade como guia, não
      automação.
- [x] CA-7: `npm test`, `npm run validate` e `npm run specs` passam.

## Desenho

**Antes:** `rolloutPercent` (teto manual, sempre existiu) + `rolloutStartedAt` (opcional, dispara o cálculo por
tempo que ignora ou limita `rolloutPercent` conforme o estágio). Dois caminhos concorrentes para o mesmo percentual.

**Depois:** só `rolloutPercent` (opcional; ausente = 100%). Uma pessoa decide o valor e o muda por PR. Em
`remote-config.js`/`status.js`, o percentual de NÃO PROD para toggles vira sempre `o.rolloutPercent ?? 100`,
igual ao que já valia para `baixa` e para `rc_*`/config — não há mais ramo condicionado a criticidade nem a
`now`. `currentStage`/`effectivePercent`/`horarioPermitido` (usados por PROD/RM) não mudam.

**Migração de dados:** as três FFs com `rolloutStartedAt` já ultrapassaram, pelo tempo decorrido, todos os
estágios (100%) — confirmado calculando `nonprodEffectivePercent` com a hora atual antes de remover o código.
Migrar é só apagar o campo `rolloutStartedAt` dos overrides `ios`/`android`; sem o campo e sem `rolloutPercent`
explícito, o override já serve 100% (mesmo valor que o cálculo por tempo já dava). Nenhum `rolloutPercent`
precisa ser escrito.

**Guia de estágios (documentação, não código):** README/skill mantêm a tabela "media 25%→100%; critica
5%→25%→50%→100%" como sequência sugerida de `update/*`s sucessivos, deixando claro que quem decide avançar (e
quando) é a pessoa, não um job.

## Arquivos afetados

- `scripts/new-flag.js`: remove o bloco que grava `rolloutStartedAt` quando `criticality` é `media`/`critica`.
- `scripts/new-flag.test.js`: remove/ajusta os testes CA-6 da spec 0028 que hoje esperam `rolloutStartedAt`.
- `scripts/lib/rollout.js`: remove `NONPROD_ROLLOUT_PLANS`, `nonprodEffectivePercent`, `nextNonprodStage` e os
  comentários que só existiam para eles.
- `scripts/lib/rollout.test.js`: remove os testes desses três símbolos.
- `scripts/lib/remote-config.js`: `build()` para de importar/chamar `nonprodEffectivePercent`; `pct` de NÃO PROD
  vira só `o.rolloutPercent ?? 100`.
- `scripts/lib/remote-config.test.js`: remove os testes CA-1..CA-4 da spec 0028/0029 que exercitam
  `rolloutStartedAt` num toggle de NÃO PROD.
- `scripts/lib/status.js`: `flagRow` para de calcular `stagedNonprod`/`nextStage` via `nonprodEffectivePercent`/
  `nextNonprodStage`; percentual de NÃO PROD vira `o.rolloutPercent ?? 100` direto, igual PROD sem RM/tempo.
  `renderRollout` remove o ramo "NÃO PROD em rollout automático por criticidade".
- `scripts/lib/status.test.js`: remove os testes CA-1/CA-3 (spec 0029) que dependem de `rolloutStartedAt`/
  `nextStage`/`stagedNonprod`.
- `scripts/ff-status.test.js`: ajusta o teste CA-4 que monta uma FF com `rolloutStartedAt` esperando `nextStage`.
- `scripts/validate.js`: troca o erro condicional (`só vale em nonprod`) por reprovar `rolloutStartedAt` sempre.
- `scripts/validate.test.js`: ajusta os três testes CA-5 (spec 0028) para o novo comportamento.
- `.github/workflows/nonprod-scheduler.yml`: apagado.
- `scripts/ci/alertar-falha-scheduler.js` e `scripts/ci/alertar-falha-scheduler.test.js`: apagados.
- `scripts/lib/workflows.test.js`: remove os testes `CA-8`/`CA-5` (spec 0029) sobre o scheduler; lista de
  workflows some um arquivo.
- `env/nonprod/ft_v13.json`, `env/nonprod/ft_v12.json`, `env/nonprod/ft_teste_rollout_auto.json`: remove
  `rolloutStartedAt` dos overrides `ios`/`android`.
- `README.md`: reescreve "Rollout automático em NÃO PROD por criticidade" → "Alterar o percentual de rollout em
  NÃO PROD".
- `.claude/skills/feature-flag/SKILL.md`: reescreve o bullet "NÃO PROD também segue estágios automáticos".
- `CLAUDE.md`: atualiza a linha do Mapa dos processos.
- `scripts/processos.test.js`: atualiza as strings esperadas para o processo (nome/âncoras).

## Plano de implementação

### Task 1: parar de gravar `rolloutStartedAt` na criação/ativação da FF

**Files:** `scripts/new-flag.js`, `scripts/new-flag.test.js`

**Interfaces:** remove o uso de `estagiada`/`rolloutStartedAt` ao montar `platformValues[p]`.

1. Teste: ajustar os testes CA-6 (spec 0028) para esperar que `env.nonprod.<p>` não tenha `rolloutStartedAt` para
   nenhuma criticidade.
2. Implementação: remover as linhas `estagiada`/`rolloutStartedAt` de `new-flag.js`.
3. Comando: `npm test` (esperado: `new-flag.test.js` passa).

### Task 2: remover o cálculo por tempo de `rollout.js` e seu consumo

**Files:** `scripts/lib/rollout.js`, `scripts/lib/rollout.test.js`, `scripts/lib/remote-config.js`,
`scripts/lib/remote-config.test.js`, `scripts/lib/status.js`, `scripts/lib/status.test.js`,
`scripts/ff-status.test.js`

**Interfaces:** `remote-config.js`/`status.js` usam só `o.rolloutPercent ?? 100` para NÃO PROD; `rollout.js`
exporta só `currentStage`, `effectivePercent`, `horarioPermitido` (PROD/RM).

1. Teste: remover os testes de `nonprodEffectivePercent`/`nextNonprodStage` em `rollout.test.js`,
   `remote-config.test.js` (CA-1..CA-4 da 0028/0029), `status.test.js` (CA-1/CA-3 da 0029) e o teste CA-4 de
   `ff-status.test.js`; ajustar as expectativas para o percentual direto.
2. Implementação: remover as três funções/constante de `rollout.js`; remover o `else if` de `remote-config.js`;
   remover `stagedNonprod`/`nextStage` de `status.js` (`flagRow` e `renderRollout`).
3. Comando: `npm test` (esperado: todos passam, sem os testes removidos).

### Task 3: `validate.js` reprova `rolloutStartedAt` sempre

**Files:** `scripts/validate.js`, `scripts/validate.test.js`

**Interfaces:** mensagem de erro nova, ex. `${env}.${p}.rolloutStartedAt não é mais suportado (spec 0030): defina
rolloutPercent diretamente`.

1. Teste: ajustar os três testes CA-5 (spec 0028) para esperar erro também em `nonprod`.
2. Implementação: trocar o `if (env === 'prod')` por reprovar incondicionalmente quando o campo existir.
3. Comando: `npm test`.

### Task 4: remover o workflow e o alerta de falha do scheduler

**Files:** `.github/workflows/nonprod-scheduler.yml`, `scripts/ci/alertar-falha-scheduler.js`,
`scripts/ci/alertar-falha-scheduler.test.js`, `scripts/lib/workflows.test.js`

**Interfaces:** nenhuma (remoção).

1. Teste: remover os testes `CA-8`/`CA-5` de `workflows.test.js` que examinam `nonprod-scheduler.yml`; atualizar a
   lista de arquivos esperada (um a menos).
2. Implementação: apagar os três arquivos.
3. Comando: `npm test`.

### Task 5: migrar os dados das três FFs afetadas

**Files:** `env/nonprod/ft_v13.json`, `env/nonprod/ft_v12.json`, `env/nonprod/ft_teste_rollout_auto.json`

**Interfaces:** nenhuma (dado).

1. Comando de verificação antes de editar: confirmar que as três já calculam 100% pelo tempo decorrido (feito
   nesta investigação).
2. Implementação: remover `rolloutStartedAt` de cada override `ios`/`android` nos três arquivos.
3. Comando: `npm run validate` (esperado: sem erros; `node scripts/deploy.js nonprod --dry-run` mostra o mesmo
   percentual de antes, 100%, para as três).

### Task 6: documentação

**Files:** `README.md`, `.claude/skills/feature-flag/SKILL.md`, `CLAUDE.md`, `scripts/processos.test.js`

**Interfaces:** nenhuma (texto).

1. Teste: ajustar `scripts/processos.test.js` (linha do processo) para as novas âncoras de texto.
2. Implementação: reescrever as seções listadas em *Arquivos afetados*.
3. Comando: `npm run specs` e `npm test`.

## Verificação

- `npm test`, `npm run validate`, `npm run specs`.
- `node scripts/deploy.js nonprod --dry-run` antes e depois da Task 5: mesma saída para `ft_v13`/`ft_v12`/
  `ft_teste_rollout_auto` (100% nas três, plataformas ativadas).
- `npm run status -- rollout ft_v13` (ou outra `media`/`critica`): não mostra mais "próximo estágio", só o
  percentual atual de `rolloutPercent`.
- `git grep -n rolloutStartedAt` fora de `docs/specs/002{8,9}-*` e do changelog desta spec: vazio.

## Riscos e reversão

- **Risco:** alguém migra dados achando que o percentual muda (na verdade as três FFs já estavam em 100%
  efetivo; nenhum comportamento observável muda na Task 5). Mitigado conferindo o `--dry-run` antes/depois.
- **Risco:** documentação desatualizada confundir quem espera avanço automático. Mitigado pela Task 6 (mesmo PR).
- **Reversão:** `revert/*` do commit de merge (protocolo padrão do repositório); os dados de `env/nonprod/` têm
  histórico no git caso seja preciso recuperar `rolloutStartedAt` original.

## Decisões

- **Por que remover em vez de manter o mecanismo e só trocar o disparo do cron:** a evidência (Issue #38, atraso
  de 4h07m) mostra que o problema é o `schedule` do GitHub Actions em si, não a implementação; qualquer
  disparo agendado (cron mais denso, `workflow_run`, o que for) herda a mesma incerteza. O usuário decidiu não
  perseguir mais mitigação de cron e sim eliminar a dependência de tempo/agendamento do NÃO PROD.
- **Por que manter a tabela de estágios sugeridos na documentação:** ela ainda é útil como guia de quanto
  percentual usar e quando avançar — só deixa de ser aplicada sozinha. Removê-la da doc perderia conhecimento de
  domínio (spec 0028) sem necessidade.
- **Por que não construir agora o "Alterar FF existente" em `flags-menu.js`:** fora de escopo desta spec (edição
  direta do JSON via `update/*` já é suportada e documentada pela skill `feature-flag`); nenhum pedido do usuário
  cobriu isso.
