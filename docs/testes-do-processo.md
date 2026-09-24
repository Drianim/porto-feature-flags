# Campanha de teste do processo

Testa, de ponta a ponta, cada processo do repositório: um PR por tipo de branch (positivos, que devem passar) e um PR por barreira (negativos, que devem ficar **vermelhos** no passo indicado). Os dados são de teste (`*_teste_*`, `*_neg_*`) e podem ser apagados no fim.

## Ordem sugerida

1. **Abrir primeiro os PRs negativos.** Eles dependem de FFs que ainda existem (`ft_plat_ios`); confira que cada um fica vermelho no passo certo e **não mescle**.
2. **Mesclar `remove/limpar-ffs-de-teste`**, clicar em **Run** e conferir que o Firebase ficou sem as FFs.
3. **Mesclar `feature/teste-ffs-novas`**, **Run**, e conferir sincronia e teste de plataforma.
4. **Mesclar `chore/teste-processo`** (só admin).
5. **Depois:** `update/teste-alterar`, `remove/teste-remover-uma` e `release/teste-prod`, criadas com as FFs novas já na `main`. A `release/*` fica só no PR: PROD ainda não tem projeto no Firebase.

## Positivos

| Branch | Processo | O que muda | PR esperado | Depois do merge |
|---|---|---|---|---|
| `remove/limpar-ffs-de-teste` | Remover FF | apaga as 5 FFs de teste | verde | reconferência ✓, **Run**, `remove-flags` apaga 5 chaves, `verify-sync` ✓ |
| `feature/teste-ffs-novas` | Criar FF nova | 4 FFs: ambas 100%, iOS 50%, `rc_` com override, versão mínima por plataforma | verde; a prévia lista 4 FFs | **Run** publica; `npm run status -- sync` ✓; `test-platforms` ✓ |
| `chore/teste-processo` | chore/* | esta página e a spec 0007 | sem pipeline de PR | só admin mescla; a `main` valida e não oferece deploy |

## Negativos (todos devem ficar vermelhos)

| Branch | Barreira testada | Passo que deve falhar |
|---|---|---|
| `feature/neg-escopo-prod` | feature não altera PROD | Escopo da branch |
| `feature/neg-altera-existente` | feature só cria FF nova | FF nova x update |
| `update/neg-cria-ff-nova` | update só altera FF existente | FF nova x update |
| `feature/neg-sem-versao-minima` | `minVersion` obrigatória | Testes e validação |
| `feature/neg-equipe-invalida` | equipe da lista oficial | Testes e validação |
| `update/neg-outra-equipe` | só a equipe dona (ou a plataforma) altera a FF | Permissão por equipe |
| `remove/neg-altera` | remove só apaga | Escopo da branch |
| `release/neg-toca-nonprod` | release só mexe em PROD | Escopo da branch |

## Reversão automática (opcional)

Mesclar `update/neg-cria-ff-nova` (inofensiva: só adiciona uma FF que nunca é publicada) faz a reconferência da `main` falhar e a pipeline preparar `revert/pr-<n>-update-neg-cria-ff-nova` com o link de um clique. Só vale se a chave SSH de escrita estiver cadastrada na conta ou no workspace.

## Depois de cada merge, conferir

- `npm run status -- sync` (com a chave do NÃO PROD): main = Firebase.
- `npm run status -- list`: o estado esperado por plataforma.
- No log da pipeline: o passo de Run, o `verify-sync` e nenhuma divergência.
