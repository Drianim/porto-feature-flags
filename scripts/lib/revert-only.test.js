const test = require('node:test');
const assert = require('node:assert');
const { revertOnlyProblems } = require('./revert-only');

test('branch revert/* com só commits de revert de merge da main passa', () => {
  assert.deepStrictEqual(revertOnlyProblems(['Revert "Merged in feature/x (pull request #37)"']), []);
  assert.deepStrictEqual(revertOnlyProblems(['Revert "Merged in feature/x (pull request #37)"', 'Revert "Merged in update/y (pull request #39)"']), []);
});
test('commit que não é revert de merge é recusado', () => {
  const p = revertOnlyProblems(['Revert "Merged in feature/x (pull request #37)"', 'feat: outra coisa']);
  assert.strictEqual(p.length, 1);
  assert.match(p[0], /"feat: outra coisa" não é um revert/);
  assert.match(revertOnlyProblems(['Revert "feat: um commit comum"'])[0], /não é um revert/);
});
test('branch sem commits é recusada', () => {
  assert.match(revertOnlyProblems([])[0], /nenhum commit/);
});

test('revert de merge no formato do GitHub ("Merge pull request #N from ...") passa', () => {
  assert.deepStrictEqual(revertOnlyProblems(['Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"']), []);
  assert.deepStrictEqual(revertOnlyProblems([
    'Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"',
    'Revert "Merged in feature/x (pull request #37)"',
  ]), []);
});

test('commit que não é revert de nenhum dos dois formatos continua recusado', () => {
  const p = revertOnlyProblems(['Revert "Merge pull request #20 from Drianim/feature/ft-teste-v7"', 'feat: outra coisa']);
  assert.strictEqual(p.length, 1);
  assert.match(p[0], /"feat: outra coisa" não é um revert/);
});
