---
spec: 0011
titulo: Deck de apresentação do processo de deploy de FFs, versionado no repositório
status: implementada
criado: 2026-09-25
atualizado: 2026-09-25
---

# Spec 0011 — Deck de apresentação do processo de deploy de FFs, versionado no repositório

## Resumo

Como **quem usa este README para aprender ou explicar o processo**, quero **um deck visual do processo de deploy de
FFs versionado no repositório**, para que **o material de apresentação não fique perdido numa pasta local e siga a
mesma fonte de verdade do resto da documentação**.

## Contexto

Existe um deck HTML autocontido (`Processo de Deploy de Feature Flags.html`, gerado como artifact, 31 slides) que
descreve o processo ponta a ponta (repositório de regras, ambientes, criticidade, RM, aprovações, agendamento,
rollout). Ele foi revisado e corrigido para bater com o processo atual deste repositório (linguagem GitHub, sem
Bitbucket, sem o slide de teste fictício). Hoje ele só existe em `~/Downloads`, fora de qualquer controle de versão,
então não acompanha mudanças futuras do processo e não é encontrado por quem abre o repositório.

## Objetivo e fora de escopo

**Objetivo:** copiar o deck para `docs/processo-de-deploy-de-feature-flags.html` e adicionar um ponteiro para ele no
`README.md` (Sumário e "Para quem é este README"), para quem quiser uma visão visual antes de ler o texto.

**Fora de escopo:** manter o deck sincronizado automaticamente com o processo (é um snapshot, atualizado à mão
quando o processo mudar); converter o deck para Markdown; qualquer mudança de comportamento de script, pipeline ou FF.

## Critérios de aceite

- [x] CA-1: `docs/processo-de-deploy-de-feature-flags.html` existe e abre num navegador mostrando as 31 slides.
- [x] CA-2: o Sumário do `README.md` referencia o deck (item novo ou nota junto do item 1, "Em uma tela").
- [x] CA-3: a seção "Para quem é este README" ou "Em uma tela" linka para `docs/processo-de-deploy-de-feature-flags.html`.
- [x] CA-4: `npm run specs` continua passando (esta spec no formato).

## Desenho

Cópia direta de arquivo (sem geração, sem script novo): o deck é estático e não depende de dado do repositório. Fica
em `docs/` junto com `testes-do-processo.md` e as demais pastas de documentação, sem subpasta nova (é um único
arquivo). O link no README usa caminho relativo (`docs/processo-de-deploy-de-feature-flags.html`), igual aos demais
links de `docs/`.

## Arquivos afetados

- `docs/processo-de-deploy-de-feature-flags.html`: novo (cópia do deck revisado).
- `README.md`: novo item no Sumário e link em "Para quem é este README".

## Plano de implementação

### Task 1: Copiar o deck e linkar no README

**Files:** `docs/processo-de-deploy-de-feature-flags.html`, `README.md`

**Interfaces:** nenhuma (arquivo estático); o README ganha um link relativo para o arquivo novo.

1. Copiar o HTML revisado para `docs/processo-de-deploy-de-feature-flags.html`.
2. Adicionar o link no Sumário e em "Para quem é este README".
3. Comando: abrir o arquivo num navegador e conferir as 31 slides; `npm run specs` (esperado: passa).

## Verificação

- `npm run specs` passa (spec no formato, CAs marcados ao final).
- Abrir `docs/processo-de-deploy-de-feature-flags.html` num navegador e navegar até o fim (31 slides).
- `grep -n "processo-de-deploy-de-feature-flags.html" README.md` mostra os dois pontos (Sumário e texto).

## Riscos e reversão

- **Deck fica desatualizado se o processo mudar e ninguém lembrar de editá-lo:** é um snapshot; risco aceito, sem
  automação prevista (fora de escopo). Reverter é remover o arquivo e o link, sem efeito em FF, script ou pipeline.
- **Arquivo HTML grande (~770 KB) no repositório:** aceitável para um repositório de governança pequeno; sem
  binário, é texto (diffável).

## Decisões

- Cópia estática em vez de gerar o deck a partir do README ou vice-versa: o deck é material de apresentação (visual,
  com efeitos), o README é referência técnica; manter os dois, sincronizados à mão, evita depender de uma ferramenta
  de build nova sem necessidade real.
- Sem subpasta `docs/apresentacao/`: é um arquivo único; criar pasta para um arquivo só seria estrutura em excesso.
