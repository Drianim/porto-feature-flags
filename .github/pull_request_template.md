<!--
Template de PR. Apague as seções dos tipos que NÃO são o seu.
O tipo é definido pelo nome da branch: feature/*, update/*, remove/*, release/* ou chore/*.
Antes de abrir: npm run preflight (ou npm run pr).
-->

## Resumo
<!-- Em uma frase: o que muda e por quê. -->


## Tipo do PR
<!-- Marque um. Precisa bater com o prefixo da branch. -->
<!-- Permissão: só a equipe dona da FF (ou a plataforma) a altera; transferir FF entre equipes é só da plataforma. -->
- [ ] feature/* — criar FF nova (NÃO PROD)
- [ ] update/* — alterar FF que já existe (NÃO PROD)
- [ ] remove/* — apagar FF (NÃO PROD)
- [ ] release/* — levar para PROD
- [ ] chore/* — ajuste de script, pipeline ou documentação (não é FF)

---

## feature/* — FF nova
- **Chave(s):** `ft_...` / `rc_...`
- **Equipe dona** (de `config/teams.json`; só a equipe ou a plataforma altera):
- **Criticidade:** baixa | média | alta | crítica
- **Plataformas:** Android | iOS | ambas
- **PR do app** (link do PR com o código atrás da FF; templates em `docs/templates/codigo-app/`; ligue a FF só depois do app publicado):
- **Versão mínima do app:** `x.y.z` (a partir de qual versão o código da FF existe; por plataforma, se forem diferentes)
- **Valores por plataforma:** default `...`, iOS `...` (rollout `..%`), Android `...` (rollout `..%`)
- [ ] O nome não existe no repositório nem no Firebase NÃO PROD
- [ ] `platforms` e `minVersion` preenchidos em `flags/<chave>.json`
- [ ] Só mexi em `flags/`, `env/nonprod/` e `catalog/`
- [ ] `npm run catalog && npm run validate` passam

## update/* — alterar FF existente
- **Chave(s):**
- **O que mudou:** valor / plataforma / versão mínima / rollout / descrição
- **Valor antes → depois:**
- **Motivo:**
- [ ] A FF já existe (não criei nenhuma nova)
- [ ] Só mexi em `flags/`, `env/nonprod/` e `catalog/`

## remove/* — apagar FF
- **Chave(s):**
- **Motivo da remoção:**
- [ ] Nenhum app em produção ainda lê essa chave
- [ ] Apaguei `flags/`, `env/nonprod/`, `env/prod/` e `rm/` da FF (nada criado ou alterado)
- [ ] `npm run catalog` regenerado

## release/* — levar para PROD
- **RM:** `RM-...`
- **Chave(s):**
- **Criticidade:**
- **Data/hora do deploy (com fuso):**
- **Plano de rollout:** ex. 5% → 25% → 50% → 100%
- **Rollback:** como desligar (valor e quem executa)
- **Aprovação de equipe:** @
- **Aprovação de plataforma:** @ (pessoa diferente)
- [ ] A FF já foi validada em NÃO PROD
- [ ] Só mexi em `env/prod/`, `rm/` e `catalog/`
- [ ] `npm run validate:prod` passa

## chore/* — script, pipeline ou documentação
- **Spec:** `docs/specs/NNNN-...md` (aprovada antes do código; SDD)
- **O que muda no comportamento:**
- [ ] `npm test`, `npm run validate` e `npm run specs` passam (a pipeline do PR confere de novo)
- [ ] Critérios de aceite da spec marcados e spec `implementada`
- [ ] README, CLAUDE.md e skills atualizados, se o comportamento mudou
- [ ] Se mexe em dados de FF: depois do merge, rodar a pipeline `sync-nonprod`
- Só **admin** abre e mescla `chore/*` (o job "Tipo da branch" confere); o merge não publica nada.

---

## Antes e depois do merge
1. Espere o job **"Tudo verde"**: o botão de merge só é liberado quando todas as checagens passam.
2. Depois do merge, aguarde a **reconferência** no workflow `main`.
3. Aprove o deploy no ambiente `nonprod` (*Review deployments*) e confira o `verify-sync` verde (main = Firebase).
Se a reconferência falhar, o workflow gera uma branch `revert/*` com o link para abrir o PR de reversão.
