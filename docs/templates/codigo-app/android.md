# Template Android (Kotlin): usar a FF no app

Ponto de partida para ler Feature Flags do Firebase Remote Config no app Android. Adapte à arquitetura da tela (ViewModel ou caso de uso, Koin, StateFlow) e confira os nomes de API e os imports contra a versão do SDK do Firebase que o app usa (as extensões Kotlin mudaram de artefato entre versões).

A linha do tempo (o que sobe no app e o que sobe no repositório de FF em cada situação) está no [README](README.md). A versão para iOS está em [ios.md](ios.md), com as mesmas seis situações.

## Contrato e inicialização

Uma vez por app. O app **não lê o SDK direto na tela**: lê o contrato `FeatureFlags`, que tem um duplo fácil nos testes.

```kotlin
// As chaves são as MESMAS de flags/<chave>.json no repositório de FF. Toggle (Boolean) começa com ft e configuração (String) com rc.
enum class FeatureToggle(val key: String) {
    NOVO_CHECKOUT("ft_exemplo_novo_checkout"),
}

enum class FeatureConfig(val key: String) {
    URL_API("rc_exemplo_url_api"),
}

interface FeatureFlags {
    fun isEnabled(toggle: FeatureToggle): Boolean
    fun value(config: FeatureConfig): String
}

// O padrão embutido no app é o comportamento ANTIGO: toggle false. Vale quando não há rede, antes do primeiro fetch
// e se a chave sair do Firebase. Toda chave nova entra aqui.
val PADROES_DO_APP: Map<String, Any> = mapOf(
    "ft_exemplo_novo_checkout" to false,
    "rc_exemplo_url_api" to "https://api.exemplo.com/v1",
)

class RemoteFeatureFlags(private val remoteConfig: FirebaseRemoteConfig) : FeatureFlags {
    override fun isEnabled(toggle: FeatureToggle): Boolean = remoteConfig.getBoolean(toggle.key)
    override fun value(config: FeatureConfig): String = remoteConfig.getString(config.key)
}
```

```kotlin
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        val remoteConfig = Firebase.remoteConfig
        remoteConfig.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 3600 })
        remoteConfig.setDefaultsAsync(PADROES_DO_APP)
        remoteConfig.fetchAndActivate() // não bloqueia a abertura: até buscar, vale o último valor ativado ou o padrão do app
        startKoin { modules(featureFlagsModule) }
    }
}

val featureFlagsModule = module {
    single<FeatureFlags> { RemoteFeatureFlags(Firebase.remoteConfig) }
}
```

Regras que valem em todas as situações abaixo:

- **Uma leitura, uma decisão:** leia a FF uma vez, no início do fluxo (ViewModel ou caso de uso), e escolha o caminho. Não espalhe `isEnabled` por vários pontos nem leia em loop.
- **O caminho antigo continua no app** até a limpeza (situação 5): é ele que garante o rollback.
- **O app não compara versão nem plataforma:** quem corta por versão mínima e plataforma é o Remote Config, a partir de `flags/<chave>.json`.

### 1. Nova FF (feature/*)

Você vai criar uma FF nova e colocar código novo atrás dela. Ordem: código no app com a FF desligada, app publicado, e só então a FF é ligada no repositório de FF.

```kotlin
enum class Tela { NOVO_CHECKOUT, CHECKOUT_ATUAL }

class CheckoutViewModel(private val flags: FeatureFlags) : ViewModel() {
    private val _tela = MutableStateFlow(Tela.CHECKOUT_ATUAL)
    val tela: StateFlow<Tela> = _tela

    fun onOpen() {
        // uma leitura, uma decisão: o caminho novo e o atual ficam lado a lado
        _tela.value = if (flags.isEnabled(FeatureToggle.NOVO_CHECKOUT)) Tela.NOVO_CHECKOUT else Tela.CHECKOUT_ATUAL
    }
}
```

Checklist do PR do app: constante em `FeatureToggle`, padrão `false` em `PADROES_DO_APP`, teste dos dois estados (situação 6). Depois, no repositório de FF: `feature/*` criando a FF (`platforms` e `minVersion` = versão do app que contém este código; ver situação 4).

### 2. Ligar e subir o rollout (update/*)

**Nada sobe no app.** Ligar por plataforma, mudar o percentual (5% → 25% → 100%) e desligar são mudanças do repositório de FF, numa branch `update/*`, com o Run da pipeline. O app só precisa:

- ler a FF no início do fluxo, então a mudança vale na próxima abertura da tela, depois do próximo fetch (o intervalo mínimo é o `minimumFetchIntervalInSeconds` da inicialização);
- manter os dois caminhos de código (o rollback é voltar o valor da FF, sem publicar app).

Não há bloco de código nesta situação de propósito: se você está escrevendo código do app para "subir o rollout", a mudança está no lugar errado.

### 3. Valor de configuração (rc_*)

Para URL, texto e números em forma de texto. O padrão fica em `PADROES_DO_APP` e é o que vale sem rede ou se a chave sair do Firebase.

```kotlin
class ApiClientFactory(private val flags: FeatureFlags) {
    fun baseUrl(): String = flags.value(FeatureConfig.URL_API)
}
```

No Firebase, o `rc_*` só é enviado nas plataformas e versões da FF (`platforms` e `minVersion`); fora disso o app recebe o padrão dele. Valide o valor recebido (por exemplo, URL bem formada) antes de usar.

### 4. Plataforma e versão mínima

O corte por plataforma e versão mínima **não é feito no app**. No repositório de FF, `platforms` (`android`, `ios` ou `ambas`) e `minVersion` viram condições no Remote Config (`app.version` corresponde ao `versionName` do Android). Abaixo da versão mínima, ou em outra plataforma, o app recebe `false` (toggle) ou o padrão dele (`rc_*`).

```kotlin
// NÃO faça: comparar versão no app duplica a regra do Remote Config e diverge dela.
// if (BuildConfig.VERSION_NAME >= "2.61.0") { abrirNovoCheckout() }

// Faça: só pergunte à FF. Para versão abaixo da mínima ela já devolve false.
val usaNovoCheckout = flags.isEnabled(FeatureToggle.NOVO_CHECKOUT)
```

Checklist:

- [ ] `minVersion` da FF = o `versionName` do **primeiro** app publicado que contém o código.
- [ ] O app com o código está **publicado** antes de a FF ser ligada.
- [ ] FF só de iOS? O Android lê a mesma chave e recebe `false`; não precisa de código diferente.
- [ ] Android e iOS lançaram em versões diferentes? Use `minVersion` por plataforma no repositório de FF.

### 5. Remover a FF e limpar o código (remove/*)

Quando a FF está em 100% e a funcionalidade virou permanente, o código sai **antes** da chave. Ordem:

1. FF em 100% e a versão nova do app adotada.
2. PR no app: apaga o `if`, o caminho antigo, a constante em `FeatureToggle` e o padrão em `PADROES_DO_APP`; publica o app.
3. Espera as versões do app que ainda leem a chave saírem de uso (ou da versão mínima suportada).
4. Só então o `remove/*` no repositório de FF apaga a chave do Firebase.

Antes:

```kotlin
fun onOpen() {
    _tela.value = if (flags.isEnabled(FeatureToggle.NOVO_CHECKOUT)) Tela.NOVO_CHECKOUT else Tela.CHECKOUT_ATUAL
}
```

Depois:

```kotlin
fun onOpen() {
    _tela.value = Tela.NOVO_CHECKOUT
}
```

**Cuidado:** se a chave sair do Firebase enquanto uma versão antiga do app ainda a lê, essa versão passa a usar o padrão do app (`false`) e volta ao caminho antigo: a funcionalidade some para quem ainda a usava. Por isso o app vem primeiro.

### 6. Testar os dois estados

Sem Firebase: o contrato tem um duplo (MockK). Teste sempre a FF ligada **e** desligada, e que toda chave tem padrão.

```kotlin
class CheckoutViewModelTest {
    private val flags = mockk<FeatureFlags>()
    private val viewModel = CheckoutViewModel(flags)

    @Test
    fun `com a FF ligada abre o novo checkout`() {
        every { flags.isEnabled(FeatureToggle.NOVO_CHECKOUT) } returns true
        viewModel.onOpen()
        assertEquals(Tela.NOVO_CHECKOUT, viewModel.tela.value)
    }

    @Test
    fun `com a FF desligada mantem o checkout atual`() {
        every { flags.isEnabled(FeatureToggle.NOVO_CHECKOUT) } returns false
        viewModel.onOpen()
        assertEquals(Tela.CHECKOUT_ATUAL, viewModel.tela.value)
    }

    @Test
    fun `toda chave tem padrao no app`() {
        val chaves = FeatureToggle.values().map { it.key } + FeatureConfig.values().map { it.key }
        assertTrue(chaves.all { it in PADROES_DO_APP })
    }
}
```
