const test = require('node:test');
const assert = require('node:assert');
const { branchKind, prLink } = require('./preflight');

test('branchKind reconhece os quatro tipos e ignora o resto', () => {
  assert.strictEqual(branchKind('feature/x'), 'feature');
  assert.strictEqual(branchKind('update/x'), 'update');
  assert.strictEqual(branchKind('remove/x'), 'remove');
  assert.strictEqual(branchKind('release/1.0'), 'release');
  assert.strictEqual(branchKind('chore/x'), null);
  assert.strictEqual(branchKind('main'), null);
});
test('prLink monta o link de um clique a partir do remoto SSH ou HTTPS', () => {
  const want = 'https://bitbucket.org/Drianim/porto-feature-flags/pull-requests/new?source=feature/x&dest=main';
  assert.strictEqual(prLink('git@bitbucket.org:Drianim/porto-feature-flags.git', 'feature/x'), want);
  assert.strictEqual(prLink('https://Drianim@bitbucket.org/Drianim/porto-feature-flags.git', 'feature/x'), want);
  assert.strictEqual(prLink('https://bitbucket.org/Drianim/porto-feature-flags', 'feature/x'), want);
  assert.strictEqual(prLink('git@gitlab.com:a/b.git', 'feature/x'), null);
});
test('prLink do GitHub: link de comparação que abre o PR', () => {
  const want = 'https://github.com/drianimadriano/porto-feature-flags/compare/main...feature/x?expand=1';
  assert.strictEqual(prLink('git@github.com:drianimadriano/porto-feature-flags.git', 'feature/x'), want);
  assert.strictEqual(prLink('https://github.com/drianimadriano/porto-feature-flags.git', 'feature/x'), want);
  assert.strictEqual(prLink('https://github.com/drianimadriano/porto-feature-flags', 'feature/x'), want);
});
