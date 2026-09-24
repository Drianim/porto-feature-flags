const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { checkSpec } = require('./specs');

const root = path.join(__dirname, '..', '..');
const template = fs.readFileSync(path.join(root, 'docs', 'sdd', 'template.md'), 'utf8');
// o template preenchido com número e datas válidos é uma spec em rascunho válida
const draft = (over = {}) => template.replace('spec: 0000', `spec: ${over.n || '0003'}`).replace(/AAAA-MM-DD/g, '2026-09-24').replace('status: rascunho', `status: ${over.status || 'rascunho'}`);

test('todas as specs do repositório estão no formato', () => {
  const dir = path.join(root, 'docs', 'specs');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    assert.deepStrictEqual(checkSpec(f, fs.readFileSync(path.join(dir, f), 'utf8')), [], f);
  }
});
test('o template preenchido é um rascunho válido (template e validador andam juntos)', () => {
  assert.deepStrictEqual(checkSpec('0003-exemplo.md', draft()), []);
});
test('nome de arquivo inválido e número diferente do frontmatter', () => {
  assert.match(checkSpec('exemplo.md', draft()).join('|'), /NNNN-slug\.md/);
  assert.match(checkSpec('0004-exemplo.md', draft()).join('|'), /difere do número do arquivo/);
});
test('frontmatter ausente ou incompleto', () => {
  assert.match(checkSpec('0003-x.md', '# sem frontmatter')[0], /frontmatter/);
  assert.match(checkSpec('0003-x.md', draft().replace('titulo:', 'titulo_:')).join('|'), /campo "titulo" obrigatório/);
  assert.match(checkSpec('0003-x.md', draft({ status: 'pronta' })).join('|'), /status deve ser/);
});
test('seção ausente ou fora de ordem', () => {
  assert.match(checkSpec('0003-x.md', draft().replace('## Decisões', '## Outra')).join('|'), /seção "## Decisões" ausente/);
  const swapped = draft().replace('## Resumo', '## Decisões X').replace('## Decisões\n', '## Resumo\n').replace('## Decisões X', '## Decisões');
  assert.match(checkSpec('0003-x.md', swapped).join('|'), /fora de ordem/);
});
test('critério de aceite precisa do formato CA-n', () => {
  assert.match(checkSpec('0003-x.md', draft().replace(/- \[ \] CA-\d+:/g, '- [ ] item:')).join('|'), /Critérios de aceite/);
});
test('spec aprovada exige tarefas com Files e Interfaces e não aceita pendência', () => {
  const p = checkSpec('0003-x.md', draft({ status: 'aprovada' })).join('|');
  assert.match(p, /marcador de pendência/); // o template tem "TODO" no comentário
  const ok = draft({ status: 'aprovada' }).replace(/<!--[\s\S]*?-->\n/, '').replace(/<[^>\n]+>/g, 'ok');
  assert.deepStrictEqual(checkSpec('0003-x.md', ok), []);
  assert.match(checkSpec('0003-x.md', ok.replace('**Files:**', '**Arquivos:**')).join('|'), /falta o bloco \*\*Files:\*\*/);
  assert.match(checkSpec('0003-x.md', ok.replace('**Interfaces:**', '**Iface:**')).join('|'), /falta o bloco \*\*Interfaces:\*\*/);
  assert.match(checkSpec('0003-x.md', ok.replace(/### Task 1:.*/, '### Etapa 1')).join('|'), /Task N/);
  assert.match(checkSpec('0003-x.md', ok.replace('## Decisões\n', '## Decisões\n\nTBD\n')).join('|'), /marcador de pendência/);
});
test('spec implementada exige todos os critérios marcados', () => {
  const ok = draft({ status: 'implementada' }).replace(/<!--[\s\S]*?-->\n/, '').replace(/<[^>\n]+>/g, 'ok');
  assert.match(checkSpec('0003-x.md', ok).join('|'), /critério de aceite ainda desmarcado/);
  assert.deepStrictEqual(checkSpec('0003-x.md', ok.replace(/- \[ \] CA/g, '- [x] CA')), []);
});

test('palavras comuns em português não são marcador de pendência', () => {
  const ok = draft({ status: 'aprovada' }).replace(/<!--[\s\S]*?-->\n/, '').replace(/<[^>\n]+>/g, 'ok');
  const withText = ok.replace('## Decisões\n', '## Decisões\n\nTodo o repositório usa esse método; todo teste passa.\n');
  assert.deepStrictEqual(checkSpec('0003-x.md', withText), []);
  for (const bad of ['TODO', 'TBD', 'FIXME', 'a definir', 'preencher depois']) {
    assert.match(checkSpec('0003-x.md', ok.replace('## Decisões\n', `## Decisões\n\nisto fica ${bad} na próxima\n`)).join('|'), /marcador de pendência/, bad);
  }
});
