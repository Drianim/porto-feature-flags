# SDD nos scripts

**SDD (Spec-Driven Development):** toda mudança nos scripts começa por uma **spec escrita e aprovada**, e o código
só nasce para cumpri-la. O padrão segue a ideia do SDD da Porto (critério de aceite verificável, plano em tarefas
TDD, revisão antes de codar), sem a parte de Jira, épico e história: aqui a spec vive no repositório, em
`docs/specs/`.

## Onde vale (e onde não vale)

| O que muda | Usa SDD? | Como entra |
|---|---|---|
| Uma **FF**: `flags/`, `env/`, `rm/` (valores, rollout, criar, alterar, remover, PROD) | **Não** | `feature/*`, `update/*`, `remove/*` ou `release/*` + template de PR |
| **Scripts e automação**: `scripts/`, `bitbucket-pipelines.yml`, `.githooks/`, regras em `config/` | **Sim** | spec em `docs/specs/` + branch `chore/*` |
| **Documentação e ferramentas do Claude**: `README.md`, `CLAUDE.md`, `.claude/`, `docs/`, `.bitbucket/` | **Sim** (spec curta) | `chore/*` |

Mudança mista (script novo que exige migrar dados de FF): a spec descreve as duas partes e a `chore/*` leva os
dois. `chore/*` não publica nada, então depois do merge rode a pipeline `sync-nonprod` se o Firebase precisar mudar
(foi assim na spec 0001). Só admin mescla `chore/*`.

## O ciclo

1. **Entender.** Leia `README.md`, `CLAUDE.md` e o código que será tocado. Confirme que não é mudança de FF.
2. **Escrever a spec.** Copie `docs/sdd/template.md` para `docs/specs/NNNN-slug.md` (próximo número livre), status
   `rascunho`. Dúvida vira pergunta ao dono da demanda: nunca preencha com palpite.
3. **Aprovar a spec.** Passe pela checklist abaixo e peça a aprovação explícita do dono. Só então `status: aprovada`.
   Sem spec aprovada, não se escreve código de produção.
4. **Implementar por tarefa, em TDD.** Para cada `### Task N`: escreva o teste, veja falhar, implemente o mínimo, veja
   passar, commit. Não implemente nada que não esteja na spec; se descobrir que falta algo, volte à spec e atualize.
5. **Verificar.** `npm test`, `npm run validate`, `npm run specs` e os comandos da seção *Verificação*. Marque os
   critérios de aceite (`- [x] CA-n`) conforme provar cada um.
6. **Documentar.** Atualize `README.md`, `CLAUDE.md`, skills e o template de PR quando o comportamento mudar. Um
   **processo novo** entra no "Mapa dos processos" do `CLAUDE.md` e na lista de `scripts/processos.test.js` (o teste falha
   se um processo sumir do README, do mapa ou da skill dona). Spec vai para `status: implementada` (o `npm run specs`
   exige todos os CAs marcados).
7. **PR `chore/*`.** Descreva no PR o número da spec. O admin mescla; a pipeline da `main` reconfere e não publica.

## Checklist de revisão da spec

Uma spec só é aprovada quando cada item abaixo é "sim":

- **Problema claro:** o contexto descreve o comportamento atual com arquivos reais, não impressões.
- **Critérios testáveis:** cada `CA-n` vira teste ou comando com saída conhecida.
- **Escopo fechado:** há "fora de escopo" e nada além dele aparece no plano.
- **Desenho coerente:** respeita a arquitetura (lógica pura em `scripts/lib/`, CLI fina, pipeline só orquestra).
- **Plano executável:** tarefas pequenas, com `**Files:**` e `**Interfaces:**` (nomes exatos) e passos TDD.
- **Risco e reversão:** diz como perceber o erro e como voltar atrás; migração de dados tem plano.
- **Sem pendência:** nenhum `TBD`, `TODO` ou "a definir" (o `npm run specs` recusa em spec aprovada).

## Formato e validação

`scripts/check-specs.js` (`npm run specs`, também dentro de `npm test`) confere: nome `NNNN-slug.md`, frontmatter
(`spec`, `titulo`, `status`, `criado`, `atualizado`), as 10 seções na ordem do template, critérios no formato
`- [ ] CA-1: ...`, e, para spec aprovada ou implementada, tarefas `### Task N:` com `**Files:**` e `**Interfaces:**`
e nenhuma pendência. Estados: `rascunho` → `aprovada` → `implementada`.

Os rótulos estruturais (`Task`, `Files`, `Interfaces`) ficam em inglês porque ferramentas leem; o resto é português.

## Convenções de código dos scripts

- Node 22, CommonJS, **sem dependência nova** (só `firebase-admin`; `js-yaml` é de teste). Justifique na spec se precisar.
- **Lógica pura em `scripts/lib/`** e a CLI fina em `scripts/*.js` (lê argumentos, chama a lib, imprime, sai com código).
- **Todo comportamento tem teste** `*.test.js` ao lado (`node:test`); shell em `scripts/ci/` também tem teste.
- Mensagens em português, acionáveis (dizem o que corrigir); erro = `exit 1`. Scripts que publicam aceitam `--dry-run`.
- Nada de credencial no repositório; chaves entram por variável de ambiente secured.
- Pipeline (`bitbucket-pipelines.yml`) só **orquestra**: a regra mora em script testável. `scripts/lib/pipeline.test.js` trava o formato.

## Exemplos

- [0001 — Plataforma e versão mínima obrigatórias](../specs/0001-plataforma-e-versao-minima.md)
- [0002 — chore/* sem pipeline de PR e só admin mescla](../specs/0002-chore-sem-pipeline-e-merge-por-admin.md)

São retroativas (escritas depois do código) e servem de modelo de preenchimento. A partir da 0003, a spec vem antes.

## Com o Claude Code

A skill do projeto `.claude/skills/sdd-scripts/` faz o Claude seguir este ciclo (escrever a spec, pedir aprovação,
implementar em TDD, verificar). O `CLAUDE.md` da raiz aponta para ela.
