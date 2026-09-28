---
spec: 0032
titulo: reduzir o deck de processo de deploy de 31 para 18 slides
status: implementada
criado: 2026-09-28
atualizado: 2026-09-28
---

# Spec 0032 — reduzir o deck de processo de deploy de 31 para 18 slides

## Resumo

Como **quem apresenta ou consulta o deck de processo**, quero **o mesmo conteúdo em bem menos slides**, para que
**a apresentação seja mais rápida de rodar e de acompanhar, sem perder nenhuma informação do processo**.

## Contexto

`docs/processo-de-deploy-de-feature-flags.html` (versionado pela spec 0011, deck manualmente mantido, **não**
gerado a partir do README) tem hoje 31 slides. O usuário pediu para reduzir a quantidade de slides/passos porque
31 é excessivo para o conteúdo. O arquivo local em `~/Downloads/Processo de Deploy de Feature Flags.html` é
byte-idêntico ao versionado (confirmado por `diff`); só o do repositório será editado.

Cada slide é um `<section class="deck-slide" id="N" aria-roledescription="slide" aria-label="Slide N of 31">` com
markup profundamente aninhado (`data-node-path`/`data-text-path`, `--fit-size: calc(...)`, ícones da fonte
`mc-anthropicons`) e dois rodapés por slide (`data-frame-id="e1-..."` com o título do deck, `data-frame-id="e2-..."`
com o número de página, zero-padded). Um `<script type="application/json" id="deck-motion">` no fim do `<body>`
guarda `{"slides":[...]}`, um objeto `{bg, steps, embeds}` por slide, na mesma ordem/quantidade das `<section>`.

Lendo o script de paginação do deck (o `<script>` inline que lê `deck-motion`), a lógica de navegação usa
`document.querySelectorAll(".deck-slide")` (ordem do DOM) e indexa `$.slides[índice]` pela posição — o atributo
`id` da `<section>` não é lido em nenhum lugar do script, é só cosmético/acessibilidade (`aria-label`). Logo, o
requisito funcional real é: **quantidade de `<section class="deck-slide">` == quantidade de entradas em
`deck-motion.slides`, na mesma ordem**. Renumerar `id`, `aria-label` e o rodapé de página (texto "01".."31") é
necessário só por consistência de leitura, não pela lógica de paginação.

Levantamento de conteúdo (feito nesta sessão, lendo o texto de todos os 31 slides) mostra sobreposição clara entre:
repositório/estrutura de pastas (slides 4 e 5), regras de branch/passo a passo/CI/preflight (6, 7, 8, 27), equipe
dona/nome único (9, 10), tipo/plataforma/versão mínima (11, 12), templates de código/ordem de remoção (13, 15),
pipeline/sincronia (16, 17), os sete slides "Etapa N de 7" (4, 18-23) que já re-narram o que os slides 2 (Visão
geral) e 24 (Resumo) resumem, e proteções/reversão automática (25, 26). O slide 24 ("Resumo") é quase idêntico ao
slide 2 ("Visão geral"); a única frase que não está em nenhum outro lugar ("em PROD o RM registra aprovações e
plano; em NÃO PROD o PR e a pipeline são o registro") é absorvida pelo slide 2.

## Objetivo e fora de escopo

**Objetivo:** o deck passa de 31 para exatamente **18 slides**, sem perder nenhuma informação de processo hoje
presente (só remove repetição), com `id`/`aria-label`/rodapé de página renumerados 01–18 e o `deck-motion.slides`
com 18 entradas na mesma ordem.

**Fora de escopo:**
- Não muda o conteúdo do processo em si (README, CLAUDE.md, skills) — só a apresentação dele no deck.
- Não redesenha o estilo visual do deck (fontes, cores, `--fit-size`, ícones `mc-anthropicons`) — reaproveita os
  blocos existentes dos slides de origem ao fundir.
- Não atualiza o arquivo em `~/Downloads` — é cópia local; o usuário decide se quer re-salvar depois de ver o
  resultado.
- Não adiciona conteúdo novo que não existia em algum dos 31 slides originais.

## Critérios de aceite

- [x] CA-1: `docs/processo-de-deploy-de-feature-flags.html` tem exatamente 18 `<section class="deck-slide">`,
      com `id="1"`..`id="18"` e `aria-label="Slide N of 18"` para N de 1 a 18, sem pular número.
- [x] CA-2: o rodapé de página (`data-frame-id="e2-..."`) de cada slide mostra o número zero-padded correto
      ("01".."18") na mesma ordem das seções.
- [x] CA-3: o JSON de `<script type="application/json" id="deck-motion">` tem `slides` com exatamente 18
      entradas, na mesma ordem das seções, preservando `bg`/`steps`/`embeds` (slide 1 e 18 com `bg:"#10233f"`,
      os demais com `bg:"#fbfbf8"`, igual ao padrão hoje usado nas bordas do deck).
- [x] CA-4: cada um dos 9 slides fundidos (ver mapeamento na seção *Desenho*) contém, em algum ponto do seu texto,
      todo o conteúdo textual relevante dos dois-ou-três slides de origem que ele substitui (conferido por leitura
      manual comparando com `/tmp/slides_summary.txt` desta sessão).
- [x] CA-5: nenhuma tag HTML quebrada (arquivo continua parseável; checagem com um parser HTML) e a estrutura de
      `data-node-path`/`data-frame-id` de cada slide fundido não colide (paths únicos dentro do seu próprio
      slide).
- [x] CA-6: `npm test`, `npm run validate` e `npm run specs` continuam passando (mudança não deveria afetá-los,
      já que nenhum script/teste referencia o deck, mas confirma que nada mais quebrou).

## Desenho

Mapeamento final (31 → 18), preservando a ordem lógica atual do processo:

| # novo | Título | Origem | Ação |
|---|---|---|---|
| 1 | Capa | 1 | mantém |
| 2 | Visão geral (7 etapas) | 2 (+ frase do 24) | mantém, ganha 1 frase do slide 24 |
| 3 | Fluxograma do processo | 3 | mantém |
| 4 | Repositório de regras | 4 + 5 | funde |
| 5 | Regra por branch | 6 | mantém |
| 6 | Passo a passo, CI e preflight | 7 + 8 + 27 | funde |
| 7 | Equipe dona e nome único | 9 + 10 | funde |
| 8 | Tipo, plataforma e versão mínima | 11 + 12 | funde |
| 9 | Templates de código do app | 13 + 15 | funde |
| 10 | Contrato e leitura (Kotlin/Swift) | 14 | mantém |
| 11 | Pipeline e garantia de sincronia | 16 + 17 | funde |
| 12 | Criticidade, RM e aprovações | 19 + 20 + 21 | funde |
| 13 | Ambientes, agendamento e rollout progressivo | 18 + 22 + 23 | funde |
| 14 | Proteções e reversão automática | 25 + 26 | funde |
| 15 | Evoluir os scripts (SDD) | 28 | mantém |
| 16 | Trabalhar com o Claude Code | 29 | mantém |
| 17 | Consultar o status | 30 | mantém |
| 18 | Próximos passos | 31 | mantém |

Slide 24 ("Resumo") é cortado sem sucessor próprio: seu conteúdo é redundante com o slide 2, exceto a frase sobre
RM/registro, que passa a viver no slide 2.

**Mecânica de renumeração:** um script one-off (não versionado, só para gerar o HTML final) lê o arquivo atual,
extrai as 31 `<section>` por offset, monta a lista de 18 slides finais copiando (para os "mantém") ou combinando
manualmente o HTML (para os "funde") as seções de origem, e para cada slide final substitui `id="N"`,
`aria-label="Slide N of 31"` → `"Slide N of 18"` e o texto do rodapé de página pelo N novo (zero-padded). O bloco
`deck-motion` é reconstruído com 18 entradas, cada uma copiando `bg`/`steps`/`embeds` da primeira seção de origem
do slide final correspondente (todas as entradas hoje têm `steps` e `embeds` triviais/vazios, então a cópia é
direta).

**Fusão de slides:** cada um dos 9 slides fundidos reaproveita o HTML (`data-node-path`, ícones, texto) dos slides
de origem, reorganizado num único layout de duas colunas ou lista consolidada, no mesmo padrão visual do resto do
deck (mesmas fontes/cores/`--fit-size`). Quando o conteúdo das duas origens já é lista + tabela, cabe lado a lado
sem reescrever texto.

## Arquivos afetados

- `docs/processo-de-deploy-de-feature-flags.html`: reescrito por completo (mesma estrutura de deck, 18 slides em
  vez de 31, `deck-motion` com 18 entradas).

## Plano de implementação

### Task 1: gerar o esqueleto de 18 slides (slides "mantém", renumeração e deck-motion)

**Files:** `docs/processo-de-deploy-de-feature-flags.html`

**Interfaces:** nenhuma (HTML estático); preserva a estrutura `<section class="deck-slide">` e o JSON
`deck-motion` já usados pelo script de paginação embutido no `<head>`/`<body>` do próprio arquivo (não editado).

1. Verificação antes: `grep -c 'class="deck-slide"'` no arquivo atual dá 31; `deck-motion.slides.length` dá 31.
2. Implementação: montar o novo arquivo com os 9 slides "mantém" copiados na nova posição/numeração e placeholders
   para os 9 slides fundidos (a preencher na Task 2); `deck-motion` reconstruído com 18 entradas.
3. Comando de verificação: `grep -c 'class="deck-slide"'` dá 18 (mesmo com os placeholders); `aria-label="Slide N
   of 18"` presente para N=1..18 sem repetição nem lacuna.

### Task 2: escrever os 9 slides fundidos

**Files:** `docs/processo-de-deploy-de-feature-flags.html`

**Interfaces:** nenhuma (HTML estático).

1. Verificação antes: conteúdo de cada par/trio de slides de origem (texto em `/tmp/slides_summary.txt`).
2. Implementação: para cada um dos 9 slides fundidos do mapeamento, montar o HTML final reaproveitando os blocos
   de origem (ver *Desenho*).
3. Comando de verificação: leitura manual comparando cada slide fundido com o texto de origem (CA-4); parser HTML
   confirma que não há tag quebrada (CA-5).

### Task 3: verificação final

**Files:** nenhum (só comandos).

**Interfaces:** nenhuma.

1. `npm test`, `npm run validate`, `npm run specs`.
2. Abrir o HTML num browser e navegar pelos 18 slides (checagem visual manual).

## Verificação

- `grep -c 'class="deck-slide"' docs/processo-de-deploy-de-feature-flags.html` → 18.
- `grep -o 'aria-label="Slide [0-9]* of 18"' docs/processo-de-deploy-de-feature-flags.html | sort -u -V` → 18
  linhas, "Slide 1 of 18".."Slide 18 of 18".
- Extrair `deck-motion` e confirmar `len(json["slides"]) == 18` (script Python one-off, não versionado).
- `npm test`, `npm run validate`, `npm run specs`.
- Abrir o arquivo num browser e navegar por todos os slides (checagem visual manual do usuário).

## Riscos e reversão

- **Risco:** perder alguma informação de processo ao fundir slides (texto cortado sem querer). Mitigado pelo CA-4
  (conferência slide a slide contra o texto original extraído nesta sessão).
- **Risco:** quebrar a paginação do deck (JS embutido) se o `deck-motion` ficar com contagem diferente das
  `<section>`. Mitigado pelo CA-3 e pela checagem visual final no browser.
- **Reversão:** `revert/*` do commit de merge (protocolo padrão do repositório); é um HTML estático sem dado de
  negócio, reversão sem efeito colateral.

## Decisões

- **Por que cortar o slide 24 ("Resumo") em vez de fundir com outro:** seu conteúdo já está quase inteiro no
  slide 2 ("Visão geral"); a única frase original é absorvida pelo slide 2, evitando manter dois slides quase
  idênticos no início e no fim do deck.
- **Por que consolidar os 7 slides "Etapa N de 7" em vez de preservá-los intactos:** o usuário confirmou
  explicitamente (via pergunta de esclarecimento) que a estrutura "1 slide por etapa" pode ser quebrada para
  permitir um corte mais agressivo; etapas 2/6/7 (ambientes, agendamento, rollout) e 3/4/5 (criticidade, RM,
  aprovações) formam dois grupos coesos de conteúdo relacionado.
- **Por que não regenerar o deck do zero (outro layout/ferramenta):** a spec 0011 já decidiu que este é um
  artefato manualmente mantido; refazer do zero fugiria do escopo (só reduzir a quantidade de slides) e
  arriscaria mudar o estilo visual sem necessidade.

## Correção pós-entrega: sobreposição de texto no slide 8

Depois da spec `implementada`, o usuário reportou (captura de tela) texto sobreposto/ilegível no card "Regras" do
slide 8 ("Tipo, plataforma e versão mínima"). Causa raiz: ao fundir os slides 11+12 (Task 2), as duas linhas
novas do card (`data-text-path="1.0.2.4"` e `"1.0.2.5"`, vindas do slide 11) ficaram sem os valores de
auto-encolhimento (`flex-basis`/`--fit`) que as três linhas irmãs (`1.0.2.1`-`1.0.2.3`, vindas do slide 12) já
tinham — pré-calculados pela ferramenta original de autoria do deck para a fonte cheia de 5 linhas dentro da
altura fixa do card, e nunca recalculados dinamicamente por nenhum script embutido no HTML. Sem esses valores, as
duas linhas novas renderizavam no tamanho de fonte "cheio" e caíam por cima da linha anterior.

**Confirmado por renderização real** (Chrome headless `--screenshot`, não só leitura do HTML) antes e depois da
correção. Fix: as 5 linhas do card passam a usar o mesmo par `flex-basis`/`--fit` (recalculado para o novo total
de 5 linhas, em vez das 3 originais), aplicado só dentro da `<section id="8">`. Sem mudança de contagem de slides,
`deck-motion` ou qualquer outro slide — `npm test`, `npm run validate` e `npm run specs` continuam passando.

## Correção pós-entrega: nota de critérios de classificação faltando no slide 12

O usuário reportou que o slide 12 ("Criticidade, RM e aprovações") estava diferente do proposto. Comparando com os
três slides de origem (`19 + 20 + 21`, fundidos na Task 2), a tabela de criticidade, a linha de aprovação PROD em
negrito e os dois cards ("Arquivo de RM" e "Dupla aprovação obrigatória") vieram completos — mas uma linha do
slide 19 (a nota `"[Critérios exatos de classificação a validar com a plataforma]"`, logo abaixo da linha em
negrito) tinha ficado de fora do merge, violando o CA-4 (preservar todo o conteúdo textual relevante das origens).

Fix: nota reinserida como um novo nó (`data-text-path="3"`), no mesmo estilo de legenda cinza do slide 19 original,
entre a linha em negrito (`data-text-path="2"`) e o par de cards (renumerado de `data-node-path="3"` para `"4"`).
Confirmado por renderização real (Chrome headless) que o slide cabe sem sobreposição com a linha extra. Sem mudança
de contagem de slides, `deck-motion` ou qualquer outro slide — `npm test`, `npm run validate` e `npm run specs`
continuam passando.
