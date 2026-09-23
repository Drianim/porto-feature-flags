const test = require('node:test');
const assert = require('node:assert');
const { checkScope, checkScopeChanges } = require('./scope');

test('feature pode alterar flags e env/nonprod', () => {
  assert.strictEqual(checkScope('feature/x', ['flags/ft_a.json', 'env/nonprod/ft_a.json', 'catalog/keys.json']).ok, true);
});
test('feature não pode alterar env/prod nem rm', () => {
  const r = checkScope('feature/x', ['env/prod/ft_a.json', 'rm/RM-1.json', 'flags/ft_a.json']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 2);
});
test('release pode alterar env/prod, rm e catalog', () => {
  assert.strictEqual(checkScope('release/1.0', ['env/prod/ft_a.json', 'rm/RM-1.json', 'catalog/keys.json']).ok, true);
});
test('release não pode alterar flags nem env/nonprod nem código', () => {
  const r = checkScope('release/1.0', ['flags/ft_a.json', 'env/nonprod/ft_a.json', 'scripts/deploy.js']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 3);
});
test('outros prefixos não são restringidos', () => {
  assert.strictEqual(checkScope('chore/x', ['env/prod/ft_a.json', 'scripts/deploy.js']).ok, true);
});
test('update tem o mesmo escopo de feature', () => {
  assert.strictEqual(checkScope('update/x', ['flags/ft_a.json', 'env/nonprod/ft_a.json']).ok, true);
  assert.strictEqual(checkScope('update/x', ['env/prod/ft_a.json']).ok, false);
});

const ch = (...l) => l.map((x) => ({ status: x[0], file: x.slice(2) }));
test('remove só pode apagar FF (flags, env/nonprod, env/prod, rm); catalog pode mudar', () => {
  assert.strictEqual(checkScopeChanges('remove/x', ch('D flags/a.json', 'D env/nonprod/a.json', 'D env/prod/a.json', 'D rm/RM-1.json', 'M catalog/keys.json')).ok, true);
});
test('remove não pode criar, alterar nem tocar em código', () => {
  const r = checkScopeChanges('remove/x', ch('A flags/n.json', 'M env/nonprod/a.json', 'M scripts/deploy.js'));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 3);
});
test('demais branches seguem a regra por caminho', () => {
  assert.strictEqual(checkScopeChanges('feature/x', ch('A flags/n.json')).ok, true);
  assert.strictEqual(checkScopeChanges('feature/x', ch('A env/prod/n.json')).ok, false);
});
