# Template iOS (Swift): usar a FF no app

Ponto de partida para ler Feature Flags do Firebase Remote Config no app iOS. Adapte à arquitetura da tela (MVVM em tela nova com SwiftUI, VIP em tela existente com UIKit: a leitura da FF fica no ViewModel ou no Interactor) e confira os nomes de API contra a versão do SDK do Firebase que o app usa.

A linha do tempo (o que sobe no app e o que sobe no repositório de FF em cada situação) está no [README](README.md). A versão para Android está em [android.md](android.md), com as mesmas seis situações.

## Contrato e inicialização

Uma vez por app. O app **não lê o SDK direto na tela**: lê o contrato `FeatureFlags`, que tem um duplo fácil nos testes. Os tipos se chamam `FeatureToggle` e `FeatureConfig` (e não `Toggle`) para não colidir com o `Toggle` do SwiftUI.

```swift
// As chaves são as MESMAS de flags/<chave>.json no repositório de FF. Toggle (Boolean) começa com ft e configuração (String) com rc.
enum FeatureToggle: String {
    case novoCheckout = "ft_exemplo_novo_checkout"
}

enum FeatureConfig: String {
    case urlApi = "rc_exemplo_url_api"
}

protocol FeatureFlags {
    func isEnabled(_ toggle: FeatureToggle) -> Bool
    func value(_ config: FeatureConfig) -> String
}

// O padrão embutido no app é o comportamento ANTIGO: toggle false. Vale quando não há rede, antes do primeiro fetch
// e se a chave sair do Firebase. Toda chave nova entra aqui.
let padroesDoApp: [String: NSObject] = [
    "ft_exemplo_novo_checkout": false as NSObject,
    "rc_exemplo_url_api": "https://api.exemplo.com/v1" as NSObject,
]

final class RemoteFeatureFlags: FeatureFlags {
    private let remoteConfig: RemoteConfig

    init(remoteConfig: RemoteConfig = .remoteConfig()) {
        self.remoteConfig = remoteConfig
    }

    func isEnabled(_ toggle: FeatureToggle) -> Bool {
        remoteConfig.configValue(forKey: toggle.rawValue).boolValue
    }

    func value(_ config: FeatureConfig) -> String {
        remoteConfig.configValue(forKey: config.rawValue).stringValue ?? ""
    }
}
```

```swift
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    let remoteConfig = RemoteConfig.remoteConfig()
    let settings = RemoteConfigSettings()
    settings.minimumFetchInterval = 3600
    remoteConfig.configSettings = settings
    remoteConfig.setDefaults(padroesDoApp)
    remoteConfig.fetchAndActivate(completionHandler: nil) // não bloqueia a abertura: até buscar, vale o último valor ativado ou o padrão do app
    return true
}
```

Regras que valem em todas as situações abaixo:

- **Uma leitura, uma decisão:** leia a FF uma vez, no início do fluxo (ViewModel ou Interactor), e escolha o caminho. Não espalhe `isEnabled` por vários pontos nem leia em loop.
- **O caminho antigo continua no app** até a limpeza (situação 5): é ele que garante o rollback.
- **O app não compara versão nem plataforma:** quem corta por versão mínima e plataforma é o Remote Config, a partir de `flags/<chave>.json`.

### 1. Nova FF (feature/*)

Você vai criar uma FF nova e colocar código novo atrás dela. Ordem: código no app com a FF desligada, app publicado, e só então a FF é ligada no repositório de FF.

```swift
enum Tela {
    case novoCheckout
    case checkoutAtual
}

final class CheckoutViewModel: ObservableObject {
    @Published private(set) var tela: Tela = .checkoutAtual
    private let flags: FeatureFlags

    init(flags: FeatureFlags) {
        self.flags = flags
    }

    func onAppear() {
        // uma leitura, uma decisão: o caminho novo e o atual ficam lado a lado
        tela = flags.isEnabled(.novoCheckout) ? .novoCheckout : .checkoutAtual
    }
}
```

Checklist do PR do app: caso em `FeatureToggle`, padrão `false` em `padroesDoApp`, teste dos dois estados (situação 6). Depois, no repositório de FF: `feature/*` criando a FF (`platforms` e `minVersion` = versão do app que contém este código; ver situação 4).

### 2. Ligar e subir o rollout (update/*)

**Nada sobe no app.** Ligar por plataforma, mudar o percentual (5% → 25% → 100%) e desligar são mudanças do repositório de FF, numa branch `update/*`, publicadas depois da aprovação do deploy. O app só precisa:

- ler a FF no início do fluxo, então a mudança vale na próxima abertura da tela, depois do próximo fetch (o intervalo mínimo é o `minimumFetchInterval` da inicialização);
- manter os dois caminhos de código (o rollback é voltar o valor da FF, sem publicar app).

Não há bloco de código nesta situação de propósito: se você está escrevendo código do app para "subir o rollout", a mudança está no lugar errado.

### 3. Valor de configuração (rc_*)

Para URL, texto e números em forma de texto. O padrão fica em `padroesDoApp` e é o que vale sem rede ou se a chave sair do Firebase.

```swift
struct ApiClientFactory {
    let flags: FeatureFlags

    func baseUrl() -> URL? {
        URL(string: flags.value(.urlApi))
    }
}
```

No Firebase, o `rc_*` só é enviado nas plataformas e versões da FF (`platforms` e `minVersion`); fora disso o app recebe o padrão dele. Valide o valor recebido (aqui, `URL(string:)` devolve `nil` para texto inválido) antes de usar.

### 4. Plataforma e versão mínima

O corte por plataforma e versão mínima **não é feito no app**. No repositório de FF, `platforms` (`android`, `ios` ou `ambas`) e `minVersion` viram condições no Remote Config (`app.version` corresponde ao `CFBundleShortVersionString` do iOS). Abaixo da versão mínima, ou em outra plataforma, o app recebe `false` (toggle) ou o padrão dele (`rc_*`).

```swift
// NÃO faça: comparar versão no app duplica a regra do Remote Config e diverge dela.
// if appVersion >= "2.61.0" { abrirNovoCheckout() }

// Faça: só pergunte à FF. Para versão abaixo da mínima ela já devolve false.
let usaNovoCheckout = flags.isEnabled(.novoCheckout)
```

Checklist:

- [ ] `minVersion` da FF = o `CFBundleShortVersionString` do **primeiro** app publicado que contém o código.
- [ ] O app com o código está **publicado** antes de a FF ser ligada.
- [ ] FF só de Android? O iOS lê a mesma chave e recebe `false`; não precisa de código diferente.
- [ ] Android e iOS lançaram em versões diferentes? Use `minVersion` por plataforma no repositório de FF.

### 5. Remover a FF e limpar o código (remove/*)

Quando a FF está em 100% e a funcionalidade virou permanente, o código sai **antes** da chave. Ordem:

1. FF em 100% e a versão nova do app adotada.
2. PR no app: apaga o `if`, o caminho antigo, o caso em `FeatureToggle` e o padrão em `padroesDoApp`; publica o app.
3. Espera as versões do app que ainda leem a chave saírem de uso (ou da versão mínima suportada).
4. Só então o `remove/*` no repositório de FF apaga a chave do Firebase.

Antes:

```swift
func onAppear() {
    tela = flags.isEnabled(.novoCheckout) ? .novoCheckout : .checkoutAtual
}
```

Depois:

```swift
func onAppear() {
    tela = .novoCheckout
}
```

**Cuidado:** se a chave sair do Firebase enquanto uma versão antiga do app ainda a lê, essa versão passa a usar o padrão do app (`false`) e volta ao caminho antigo: a funcionalidade some para quem ainda a usava. Por isso o app vem primeiro.

### 6. Testar os dois estados

Sem Firebase: o contrato tem um duplo (stub). Teste sempre a FF ligada **e** desligada, e que toda chave tem padrão.

```swift
struct StubFeatureFlags: FeatureFlags {
    var toggles: [FeatureToggle: Bool] = [:]

    func isEnabled(_ toggle: FeatureToggle) -> Bool { toggles[toggle] ?? false }
    func value(_ config: FeatureConfig) -> String { "" }
}

final class CheckoutViewModelTests: XCTestCase {
    func testComAFFLigadaAbreONovoCheckout() {
        let viewModel = CheckoutViewModel(flags: StubFeatureFlags(toggles: [.novoCheckout: true]))
        viewModel.onAppear()
        XCTAssertEqual(viewModel.tela, .novoCheckout)
    }

    func testComAFFDesligadaMantemOCheckoutAtual() {
        let viewModel = CheckoutViewModel(flags: StubFeatureFlags(toggles: [.novoCheckout: false]))
        viewModel.onAppear()
        XCTAssertEqual(viewModel.tela, .checkoutAtual)
    }

    func testTodaChaveTemPadraoNoApp() {
        XCTAssertNotNil(padroesDoApp[FeatureToggle.novoCheckout.rawValue])
        XCTAssertNotNil(padroesDoApp[FeatureConfig.urlApi.rawValue])
    }
}
```
