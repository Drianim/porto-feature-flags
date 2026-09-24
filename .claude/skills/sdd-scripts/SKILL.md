---
name: sdd-scripts
description: Spec-Driven Development para mudanças nos scripts, pipeline, hooks e documentação deste repositório (não para FFs). Use quando o pedido for criar ou alterar scripts/, bitbucket-pipelines.yml, .githooks/, regras em config/, README/CLAUDE.md ou skills — escreve a spec em docs/specs/, pede aprovação, implementa em TDD e verifica.
---

# SDD nos scripts

Vale para **scripts e automação** (`scripts/`, `bitbucket-pipelines.yml`, `.githooks/`, regras em `config/`, docs e
skills). **Não vale para FF** (`flags/`, `env/`, `rm/`): FF segue a skill `feature-flag`, sem spec.

Processo completo e checklist: `docs/sdd/README.md`. Template: `docs/sdd/template.md`. Exemplos: `docs/specs/0001-*` e `0002-*`.

## Ciclo (siga na ordem, sem pular)

1. **Entenda.** Leia `README.md`, `CLAUDE.md` e o código afetado. Confirme com o usuário se for ambíguo se a mudança é
   de script ou de FF.
2. **Escreva a spec.** Copie `docs/sdd/template.md` para `docs/specs/NNNN-slug.md` (próximo número livre), `status:
   rascunho`, todas as seções. Dúvida vira pergunta ao usuário; nunca preencha com palpite e nunca deixe `TBD`.
3. **Peça a aprovação explícita** da spec (resuma os critérios de aceite e as decisões). Só então `status: aprovada`.
   **Sem spec aprovada, não escreva código de produção.**
4. **Implemente por tarefa, em TDD** (teste que falha → mínimo → passa → commit). Nada fora da spec; se faltar algo,
   volte e atualize a spec.
5. **Verifique:** `npm test`, `npm run validate`, `npm run specs` e os comandos da seção *Verificação*; marque cada
   `- [x] CA-n` só depois de provar.
6. **Documente:** README, CLAUDE.md, skills e template de PR quando o comportamento mudar; spec → `implementada`.
7. **Entrega:** branch `chore/*`, PR citando o número da spec. **Só faça push ou abra PR se o usuário pedir.** Só admin mescla.

## Regras de escrita da spec

- Critérios `- [ ] CA-1: ...` verificáveis por teste ou comando com saída conhecida.
- Cada `### Task N:` traz `**Files:**` e `**Interfaces:**` (nomes exatos de funções e campos).
- Migração de dados de FF que a mudança exigir entra na spec (a `chore/*` leva os dados; depois `sync-nonprod`).

## Convenções do código

Lógica pura em `scripts/lib/`, CLI fina em `scripts/*.js`, testes `*.test.js` ao lado, sem dependência nova, mensagens
em português e acionáveis, `--dry-run` em quem publica, nenhuma credencial no repositório.
