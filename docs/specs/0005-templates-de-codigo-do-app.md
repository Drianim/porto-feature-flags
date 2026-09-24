---
spec: 0005
titulo: Templates de código do app (Android e iOS) para usar a FF em cada situação
status: implementada
criado: 2026-09-24
atualizado: 2026-09-24
---

# Spec 0005 — Templates de código do app (Android e iOS) para usar a FF em cada situação

## Resumo

Como **desenvolvedor do app**, quero **um template de código (Kotlin e Swift) para cada situação da FF**, para que **eu use a FF do mesmo jeito em todo lugar e saiba o que subir no app em cada etapa, sem esquecer o valor padrão, a versão mínima nem a limpeza depois**.

## Contexto

Este repositório governa a FF no Firebase (chave, plataformas, versão mínima, equipe, rollout), mas nada diz **como o app lê a FF**. Sem um padrão, cada pessoa lê `getBoolean("ft_x")` direto no meio da tela, esquece o valor padrão embutido no app, não alinha a versão do app com a `minVersion` da FF e deixa código morto depois que a FF chega a 100%. Há um risco pior na remoção: se a chave sai do Firebase enquanto uma versão antiga do app ainda a lê, essa versão passa a usar o padrão do app (desligada) e a funcionalidade some para quem ainda a usava. Os guias da Porto (Android com Koin, StateFlow e MockK; iOS com UIKit/SwiftUI e XCTest) não trazem padrão de FF.

## Objetivo e fora de escopo

**Objetivo:** `docs/templates/codigo-app/` com um README (a linha do tempo da FF ligando o que sobe no app ao tipo de branch deste repositório), `android.md` (Kotlin) e `ios.md` (Swift). Cada um traz um contrato pequeno de FF (interface ou protocolo), a implementação sobre o Firebase Remote Config, a injeção, e **um template por situação**, na mesma ordem nas duas plataformas.

**Situações (status da FF):** (1) nova FF, código novo protegido e desligada por padrão; (2) ligar e subir rollout, sem mudança no app; (3) valor de configuração `rc_*`; (4) plataforma e versão mínima; (5) remoção e limpeza do código; (6) teste nos dois estados.

**Fora de escopo:** alterar o código de qualquer app, gerador de código a partir do catálogo (fica como proposta), UI específica (Compose, SwiftUI, UIKit; os exemplos param no ViewModel, caso de uso ou apresentador) e outro provedor além do Firebase Remote Config.

## Critérios de aceite

- [x] CA-1: `android.md` e `ios.md` trazem as seis situações, na mesma ordem e com os mesmos títulos, cada uma com código completo do template.
- [x] CA-2: as duas plataformas definem o contrato de FF (`FeatureFlags`: leitura de toggle Boolean e de configuração String) e as chaves como constantes tipadas, com o nome exato `ft_`/`rc_` do repositório.
- [x] CA-3: toggle usa a API Boolean e tem padrão `false` embutido no app (o comportamento antigo); `rc_*` usa a API String com padrão explícito no app; nenhum exemplo lê valor sem padrão.
- [x] CA-4: o template de nova FF mantém o caminho antigo e o novo lado a lado, lê a FF uma vez por tela ou ação (não em loop) e não deixa a decisão espalhada por vários pontos.
- [x] CA-5: o template de plataforma e versão mínima diz que o corte por versão e plataforma é do Remote Config (condições publicadas a partir do repositório) e que o app **não** compara versão; traz o checklist "a versão do app que contém o código = `minVersion` da FF; publicar o app antes de ligar".
- [x] CA-6: o template de remoção mostra o código antes e depois e a ordem correta (primeiro o app sem ler a chave, depois a `remove/*`), com o aviso de que apps antigos que ainda leem a chave passam a usar o padrão do app.
- [x] CA-7: o template de teste cobre a FF ligada e desligada com um duplo do contrato (MockK no Android, stub com XCTest no iOS), sem Firebase.
- [x] CA-8: o README dos templates traz a linha do tempo por situação ligando o que sobe no app ao que acontece neste repositório (`feature/*`, `update/*`, `remove/*`, `release/*`), incluindo o rollback.
- [x] CA-9: um teste (`scripts/code-templates.test.js`) confere: as seis situações nas duas plataformas, na mesma ordem; toda chave `ft_`/`rc_` dentro de blocos de código segue o padrão de chave e a API do tipo (`ft_` com Boolean, `rc_` com String); e nenhum marcador de pendência.
- [x] CA-10: o README do repositório, o `CLAUDE.md`, a skill `feature-flag` e o template de PR apontam para os templates de código, e o template de PR de `feature/*` pede o link do PR do app.
- [x] CA-11: o README documenta como criar a branch pela interface do Bitbucket: o tipo Feature gera `feature/`, o tipo Release gera `release/` e o tipo Other permite digitar `update/`, `remove/` ou `chore/`; Bugfix e Hotfix não fazem parte do processo.

## Desenho

- **Estrutura:** `docs/templates/codigo-app/README.md`, `android.md`, `ios.md`. Os exemplos usam chaves `ft_exemplo_*` e `rc_exemplo_*` e as mesmas nas duas plataformas.
- **Contrato:** Android: `enum class FeatureToggle(val key: String)`, `enum class FeatureConfig(val key: String)` e `interface FeatureFlags { fun isEnabled(toggle: FeatureToggle): Boolean; fun value(config: FeatureConfig): String }`, com `RemoteFeatureFlags(FirebaseRemoteConfig)` e um módulo Koin. iOS: `enum FeatureToggle: String`, `enum FeatureConfig: String`, `protocol FeatureFlags` e `RemoteFeatureFlags(RemoteConfig)`, com injeção por inicializador. Os tipos se chamam `FeatureToggle` e `FeatureConfig` (e não `Toggle`) para não colidir com o `Toggle` do SwiftUI. Os padrões (`false` para toggles e o valor de cada `rc_*`) ficam numa lista única (`PADROES_DO_APP` / `padroesDoApp`) e entram no SDK na inicialização; a busca e a ativação ficam na abertura do app.
- **Uma leitura, uma decisão:** o template lê o toggle no início do fluxo (ViewModel, caso de uso ou apresentador) e escolhe o caminho; o código antigo e o novo ficam atrás da mesma função, o que torna a limpeza um `diff` pequeno.
- **Situações 2 e 4:** são de contrato com este repositório (nada de código novo no app, ou só o checklist), mas ganham seção própria para o desenvolvedor não procurar código onde não há.
- **Teste do template:** `scripts/code-templates.test.js` lê os três Markdown e confere estrutura e consistência; não compila Kotlin nem Swift (limite declarado abaixo).
- **Branches pela interface:** um trecho no README explica o mapeamento dos tipos do Bitbucket para os prefixos do processo.

## Arquivos afetados

- `docs/templates/codigo-app/README.md`, `android.md`, `ios.md`: os templates.
- `scripts/code-templates.test.js`: teste de estrutura e consistência.
- `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`: links, mapeamento de branches e o pedido do link do PR do app.

## Plano de implementação

### Task 1: Teste de estrutura dos templates

**Files:** `scripts/code-templates.test.js`

**Interfaces:** consome `KEY_RE` e `kindOf` de `scripts/lib/flags.js`; produz o teste que exige, em `android.md` e `ios.md`, as seis situações (`### 1.` a `### 6.`) na mesma ordem e com os mesmos títulos, toda chave `ft_`/`rc_` nos blocos de código com o padrão de chave e a API do tipo, e nenhum marcador de pendência.

1. Teste: escrever o teste e rodar (esperado: falha, porque os templates ainda não existem).
2. Implementação: nenhuma além do teste.
3. Comando: `node --test scripts/code-templates.test.js` (esperado: falha por arquivo ausente).

### Task 2: Template Android (Kotlin)

**Files:** `docs/templates/codigo-app/android.md`

**Interfaces:** produz `FeatureToggle`, `FeatureConfig`, `FeatureFlags`, `RemoteFeatureFlags`, `PADROES_DO_APP`, o módulo Koin e as seis situações com código completo (Kotlin, MockK).

1. Escrever a seção do contrato e da inicialização e as seis situações.
2. Comando: `node --test scripts/code-templates.test.js` (esperado: a parte de Android passa).

### Task 3: Template iOS (Swift)

**Files:** `docs/templates/codigo-app/ios.md`

**Interfaces:** produz `FeatureToggle`, `FeatureConfig`, `FeatureFlags`, `RemoteFeatureFlags`, `padroesDoApp` e as seis situações com código completo (Swift, XCTest), com os mesmos títulos do Android.

1. Escrever a seção do contrato e da inicialização e as seis situações.
2. Comando: `node --test scripts/code-templates.test.js` (esperado: passa por inteiro).

### Task 4: README dos templates, links e branches pela interface

**Files:** `docs/templates/codigo-app/README.md`, `README.md`, `CLAUDE.md`, `.claude/skills/feature-flag/SKILL.md`, `.bitbucket/pull_request_template.md`

**Interfaces:** consome os títulos das seis situações; produz a linha do tempo por situação, os links nos quatro arquivos e o mapeamento Bitbucket (Feature, Release, Other).

1. Escrever o README dos templates e ligar os links; adicionar o pedido do link do PR do app no template de `feature/*`.
2. Comando: `npm test && npm run validate && npm run specs` (esperado: passa).

## Verificação

- `npm test`, `npm run validate` e `npm run specs` passam.
- Ler `android.md` e `ios.md` lado a lado: mesmas seis situações, mesmos títulos, mesmas chaves de exemplo.
- Conferir os nomes de API do Firebase contra a versão do SDK usada em cada app (o modelo cita as APIs do Firebase Remote Config; os nomes exatos podem variar por versão).

## Riscos e reversão

- **Não compila aqui:** o teste confere estrutura e consistência, não compila Kotlin nem Swift. A verificação de compilação é ao colar o template num app; por isso a seção de verificação manda conferir a versão do SDK.
- **Estilo do app varia:** o template é um ponto de partida (contrato pequeno + injeção); as equipes adaptam à arquitetura da tela (VIP ou MVVM no iOS, ViewModel ou caso de uso no Android).
- **Reversão:** só documentação e um teste; reverter o merge da `chore/*` remove tudo sem afetar FF, deploy ou pipeline.

## Decisões

- **Contrato pequeno + injeção, em vez de ler o SDK direto na tela:** uma leitura e uma decisão por fluxo, testável com um duplo e com limpeza barata.
- **Padrão embutido no app é o comportamento antigo:** toggle `false`; assim, se a chave sumir do Firebase (rollback, remoção ou app sem rede), o app volta ao caminho antigo.
- **O app não compara versão:** o corte por versão e plataforma é do Remote Config, publicado a partir do repositório; comparar no app duplicaria a regra e divergiria dela.
- **Remoção começa no app:** a FF só sai do Firebase depois que nenhuma versão suportada do app a lê.
- **Dois templates (Kotlin e Swift) com a mesma estrutura:** as duas equipes seguem a mesma linha do tempo, e o teste força a paridade.
