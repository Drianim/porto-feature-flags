---
spec: 0007
titulo: Campanha de teste do processo (matriz de branches positivas e negativas)
status: implementada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0007 — Campanha de teste do processo (matriz de branches positivas e negativas)

## Resumo

Como **responsável pelo processo de FF**, quero **uma matriz de branches de teste, uma por processo e uma por barreira**, para que **eu confirme de ponta a ponta, na pipeline real, que o que os testes locais prometem também vale no Bitbucket e no Firebase**.

## Contexto

Os testes automatizados cobrem a lógica e os scripts com repositórios temporários e clientes falsos, mas nada exercita junto o PR, a pipeline do Bitbucket, o Run e o Remote Config real. Boa parte do que foi construído (escopo por branch, nome único, permissão por equipe, reconferência da `main`, reversão automática, remoção no Firebase) só foi provada localmente ou por PRs de teste avulsos.

## Objetivo e fora de escopo

**Objetivo:** uma página de campanha (`docs/testes-do-processo.md`) com a ordem, as branches positivas e negativas, o resultado esperado no PR e o que conferir depois do merge, e as branches criadas conforme a matriz.

**Fora de escopo:** automatizar a abertura dos PRs, testar PROD no Firebase (ainda não há projeto) e testar o merge por uma pessoa que não é admin (exige outra conta).

## Critérios de aceite

- [x] CA-1: a página lista as branches positivas (remover, criar, chore) e as negativas, cada uma com o processo ou barreira e o resultado esperado.
- [x] CA-2: cada branch negativa reprova localmente no `preflight` no passo esperado, e cada positiva passa.
- [x] CA-3: a ordem sugerida abre os PRs negativos antes de mesclar a remoção, porque dependem das FFs que existem.
- [x] CA-4: a página diz o que conferir depois de cada merge e como testar a reversão automática.

## Desenho

Documentação e branches: a página vive em `docs/testes-do-processo.md`. As branches saem da `main`, uma por linha da matriz, com o conteúdo mínimo que provoca o resultado esperado; os dados de teste usam os prefixos `_teste_` e `_neg_`.

## Arquivos afetados

- `docs/testes-do-processo.md`: a campanha.
- `docs/specs/0007-campanha-de-teste-do-processo.md`: esta spec.

## Plano de implementação

### Task 1: Página da campanha

**Files:** `docs/testes-do-processo.md`

**Interfaces:** consome os passos do PR (`Testes e validação`, `Escopo da branch`, `Permissão por equipe`, `FF nova x update`) e os comandos `npm run status` e `test-platforms`; produz a matriz e a ordem.

1. Escrever a matriz e a ordem sugerida.
2. Comando: `npm run specs` (esperado: passa).

### Task 2: Branches da matriz

**Files:** branches `remove/`, `feature/`, `update/`, `release/` e `chore/` listadas na página

**Interfaces:** cada branch produz o resultado esperado no `preflight`.

1. Criar cada branch a partir da `main` com o conteúdo mínimo.
2. Comando: `node scripts/preflight.js` em cada uma (esperado: as positivas passam; as negativas falham no passo indicado).

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- Cada branch da matriz confere com o resultado esperado no `preflight`; depois, na pipeline real, ao abrir os PRs.

## Riscos e reversão

- **A pipeline real pode divergir do `preflight`:** é exatamente o que a campanha procura; a diferença vira correção.
- **Dados de teste no Firebase:** as FFs `_teste_` ficam publicadas até serem removidas; a própria campanha as remove.
- **Reversão:** apagar as branches e reverter o merge da `chore/*` remove página e spec.

## Decisões

- Negativos primeiro: dependem de FFs existentes e mostram que as barreiras seguram antes de qualquer mudança no Firebase.
- Uma branch por barreira: quando um PR fica verde ou vermelho por engano, o nome já diz o que não funcionou.
- `release/*` só no PR: PROD não tem projeto no Firebase; mesclar dispararia passos que exigem credenciais que ainda não existem.
