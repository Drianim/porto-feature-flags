# Campanha de teste do processo

Testa, de ponta a ponta, cada processo do repositório: um PR por tipo de branch (positivos, que devem passar) e um
PR por barreira (negativos, que devem ficar **vermelhos** no passo indicado). Os dados são de teste (`*_camp_*`,
`*_neg_*`) e podem ser apagados no fim.

## Ordem sugerida

O repositório está sem nenhuma FF (a rodada anterior foi limpa antes desta campanha), então a ordem começa pelos
negativos que não precisam de FF nenhuma existindo, só depois cria as FFs novas, e só então roda os negativos e os
positivos que dependem delas.

1. **Mesclar `chore/teste-processo`** (esta página; só admin).
2. **Abrir os negativos sem dependência** — `feature/neg-sem-versao-minima`, `feature/neg-equipe-invalida`,
   `update/neg-cria-ff-nova`, `release/neg-toca-nonprod`, `feature/neg-escopo-prod`. Confira que cada um fica
   vermelho no passo certo e **não mescle**.
3. **Mesclar `feature/teste-ffs-novas`**, aprovar o ambiente `nonprod` (*Review deployments*) e conferir que o
   Firebase ficou com as 4 FFs novas.
4. **Abrir os negativos que dependem de FF existente** — `feature/neg-altera-existente`, `update/neg-outra-equipe`,
   `remove/neg-altera`. Mesma checagem: vermelho no passo certo, **não mescle**.
5. **Mesclar, em sequência:** `update/teste-alterar`, `remove/teste-remover-uma` e `release/teste-prod` (esta
   última fica só no PR: PROD ainda não tem projeto no Firebase).

## Positivos

| Branch | Processo | Detalhe da FF | PR esperado | Depois do merge |
|---|---|---|---|---|
| `feature/teste-ffs-novas` | Criar FF nova | 4 FFs: `ft_camp_toggle_ambas` (toggle, ambas, 100%), `ft_camp_toggle_ios_50` (toggle, só iOS, rollout 50%), `rc_camp_url_override` (config, com override por plataforma), `ft_camp_minver_plataforma` (toggle, ambas, `minVersion` por plataforma) | verde; a prévia lista as 4 FFs | aprovar `nonprod`; `npm run status -- sync` ✓; `test-platforms` ✓ |
| `update/teste-alterar` | Alterar FF existente | `ft_camp_toggle_ios_50`: rollout 50% → 75% | verde | aprovar `nonprod`; sincronia ✓ |
| `remove/teste-remover-uma` | Remover FF | apaga `rc_camp_url_override` (`flags/` + `env/nonprod/`) | verde | aprovar `nonprod`; `remove-flags` apaga a chave; `verify-sync` ✓ |
| `release/teste-prod` | release/* | `env/prod/ft_camp_toggle_ambas.json` + `rm/RM-...-ft-camp-toggle-ambas.json` | verde (`validate:prod` passa nas checagens do PR) | não mescla: PROD ainda não tem projeto no Firebase |
| `chore/teste-processo` | chore/* | esta página, a spec 0013 e o parágrafo novo do README sobre o template de PR | sem pipeline de FF | só admin mescla; a `main` valida e não oferece deploy |

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

`update/neg-outra-equipe` altera `ft_camp_toggle_ambas` (equipe `squad-poc`) com um commit assinado por um e-mail de
teste inequívoco (ex.: `neg-outra-equipe@teste.invalido`), que não está nem em `config/teams.json` (`squad-poc` ou
`platform`). Não é dado de equipe real — é só uma identidade de autor sintética para provar que
`check-ownership.js` barra quem não é da equipe dona nem da plataforma. Essa branch nunca é mesclada.

## Reversão automática (opcional)

Mesclar `update/neg-cria-ff-nova` (inofensiva: só adiciona uma FF que nunca é publicada) faz a reconferência da
`main` falhar e a pipeline preparar `revert/pr-<n>-update-neg-cria-ff-nova` com o link de um clique. Só vale se a
chave SSH de escrita estiver cadastrada na conta ou no workspace.

## Depois de cada merge, conferir

- `npm run status -- sync` (com a chave do NÃO PROD): main = Firebase.
- `npm run status -- list`: o estado esperado por plataforma.
- No log da pipeline: a aprovação do ambiente `nonprod`, o `verify-sync` e nenhuma divergência.
