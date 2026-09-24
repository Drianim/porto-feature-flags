---
spec: 0000
titulo: <o que muda, em uma frase>
status: rascunho
criado: AAAA-MM-DD
atualizado: AAAA-MM-DD
---

# Spec 0000 — <título>

<!--
Copie para docs/specs/NNNN-slug.md (próximo número livre) e preencha TODAS as seções, na ordem.
status: rascunho -> aprovada (só com aprovação explícita do dono) -> implementada (todo CA marcado).
Nada de TBD, TODO ou "a definir" numa spec aprovada: dúvida vira pergunta ao dono, nunca palpite.
-->

## Resumo

Como **<quem>**, quero **<o quê>**, para que **<benefício>**.

## Contexto

O que existe hoje (AS-IS) e o que dói. Cite arquivos e comportamentos reais, não impressões.

## Objetivo e fora de escopo

**Objetivo:** o resultado esperado, em 1 a 3 frases.

**Fora de escopo:** o que esta spec deliberadamente NÃO faz (evita crescer no meio do caminho).

## Critérios de aceite

Cada critério é verificável por um teste ou por um comando com saída conhecida.

- [ ] CA-1: <comportamento observável>
- [ ] CA-2: <comportamento observável>

## Desenho

Como resolve: fluxo, estruturas de dados, formato de arquivos/mensagens, regras de decisão. Onde a lógica pura
vai (`scripts/lib/`) e o que fica na CLI. Compatibilidade com o que já existe (migração de dados, pipeline).

## Arquivos afetados

- `scripts/lib/exemplo.js`: <o que muda>
- `scripts/lib/exemplo.test.js`: <testes novos>

## Plano de implementação

Tarefas pequenas, cada uma com o próprio ciclo de teste. Passo = 2 a 5 minutos:
escrever o teste que falha, rodar e ver falhar, implementar o mínimo, rodar e ver passar, commit.

### Task 1: <entregável testável sozinho>

**Files:** `scripts/lib/exemplo.js`, `scripts/lib/exemplo.test.js`

**Interfaces:** consome `<o que já existe, com nome exato>`; produz `<função/arquivo/campo, com assinatura exata>`.

1. Teste: <o teste que falha>.
2. Implementação: <o mínimo para passar>.
3. Comando: `npm test` (esperado: todos passam).

## Verificação

Comandos que provam que a spec foi cumprida, com a saída esperada. Sempre `npm test`, `npm run validate` e
`npm run specs`; some o que for específico (ex.: `node scripts/deploy.js nonprod --dry-run`).

## Riscos e reversão

O que pode dar errado, como perceber e como voltar atrás (revert do merge, flag, migração de dados).

## Decisões

Escolhas feitas e o porquê, incluindo alternativas descartadas. É o que o próximo desenvolvedor mais precisa ler.
