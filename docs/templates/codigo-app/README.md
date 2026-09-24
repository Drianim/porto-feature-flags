# Templates de código do app: usar a FF

Este repositório governa a FF no Firebase. Estes templates mostram **o outro lado**: o código do app (Android em Kotlin e iOS em Swift) que lê a FF, uma seção para cada situação em que a FF pode estar.

- [android.md](android.md): Kotlin, com Koin, StateFlow e MockK.
- [ios.md](ios.md): Swift, com MVVM (SwiftUI) ou VIP (UIKit) e XCTest.

As duas plataformas têm as mesmas seis situações, na mesma ordem e com as mesmas chaves de exemplo (`ft_exemplo_novo_checkout` e `rc_exemplo_url_api`). Um teste (`scripts/code-templates.test.js`) trava essa paridade. Os templates não são compilados aqui: cole no app e confira a versão do SDK do Firebase.

## Linha do tempo: o que sobe em cada lado

| # | Situação | No app (Android e iOS) | No repositório de FF |
|---|---|---|---|
| 1 | Nova FF (feature/*) | Código novo atrás do toggle, com o caminho atual ao lado; padrão `false` no app; publicar o app | `feature/*` cria a FF com `platforms` e `minVersion` = versão do app que contém o código |
| 2 | Ligar e subir o rollout (update/*) | **Nada** | `update/*` liga por plataforma, sobe o percentual ou desliga |
| 3 | Valor de configuração (rc_*) | Ler a configuração como texto, com padrão no app; validar o valor | `feature/*` cria a `rc_*`; `update/*` muda o valor |
| 4 | Plataforma e versão mínima | Nada de comparar versão no app; checklist de versão | `platforms` e `minVersion` em `flags/`; mudar depois é `update/*` |
| 5 | Remover a FF e limpar o código (remove/*) | Apagar o `if`, o caminho antigo, a constante e o padrão; publicar o app; esperar as versões antigas saírem | **Só depois:** `remove/*` apaga a chave do Firebase |
| 6 | Testar os dois estados | Teste com a FF ligada e desligada, com um duplo do contrato, e que toda chave tem padrão | (nada) |

**PROD (`release/*`):** não muda o app. O código precisa estar publicado antes; a `release/*` leva os valores da FF a PROD, por horário e em estágios.

## Rollback

Voltar a FF para desligada (ou reduzir o percentual) numa branch `update/*` devolve o app ao caminho antigo **sem publicar app novo**: é por isso que o caminho antigo fica no app até a situação 5. Se a chave sumir do Firebase, ou o app estiver sem rede, vale o padrão do app, que é o comportamento antigo (toggle `false`).

## Regras dos templates

1. **Padrão do app = comportamento antigo.** Toggle `false`; toda chave nova entra na lista de padrões do app.
2. **Uma leitura, uma decisão.** Leia a FF uma vez no início do fluxo (ViewModel, caso de uso ou Interactor) e escolha o caminho.
3. **O app não compara versão nem plataforma.** O corte é do Remote Config, publicado a partir de `flags/<chave>.json`.
4. **O app vem primeiro na remoção.** Se a chave sair do Firebase enquanto uma versão antiga ainda a lê, essa versão passa a usar o padrão do app e a funcionalidade some para quem ainda a usava.
5. **As chaves são as do repositório de FF**, com o mesmo nome (`ft_*` toggle, `rc_*` configuração).

## No PR

O PR de `feature/*` neste repositório pede o link do **PR do app** com o código atrás da FF: a FF só deve ser ligada depois que o app com o código estiver publicado.
