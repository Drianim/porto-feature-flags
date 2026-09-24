<!--
Template de PR de Feature Flag. Apague as seções dos tipos que NÃO são o seu.
O tipo é definido pelo nome da branch: feature/*, update/*, remove/* ou release/*.
Antes de abrir: npm run preflight (ou npm run pr).
-->

## Resumo
<!-- Em uma frase: o que muda e por quê. -->


## Tipo do PR
<!-- Marque um. Precisa bater com o prefixo da branch. -->
- [ ] feature/* — criar FF nova (NÃO PROD)
- [ ] update/* — alterar FF que já existe (NÃO PROD)
- [ ] remove/* — apagar FF (NÃO PROD)
- [ ] release/* — levar para PROD

---

## feature/* — FF nova
- **Chave(s):** `ft_...` / `rc_...`
- **Squad / dono:**
- **Criticidade:** baixa | média | alta | crítica
- **Valores por plataforma:** default `...`, iOS `...` (rollout `..%`), Android `...` (rollout `..%`)
- [ ] O nome não existe no repositório nem no Firebase NÃO PROD
- [ ] Só mexi em `flags/`, `env/nonprod/` e `catalog/`
- [ ] `npm run catalog && npm run validate` passam

## update/* — alterar FF existente
- **Chave(s):**
- **O que mudou:** valor / plataforma / rollout / descrição
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

---

## Depois do merge
1. Aguarde a **reconferência do merge** na pipeline da main.
2. Clique em **Run** no passo "Aprovar, publicar ou remover e verificar NÃO PROD".
3. Confirme o `verify-sync` verde (main = Firebase).
Se algo falhar, a pipeline gera uma branch `revert/*` com o link para abrir o PR de reversão.
