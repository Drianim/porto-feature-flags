const test = require('node:test');
const assert = require('node:assert');
const { parseNameStatus, classify, evaluate } = require('./new-flags');

const diff = (s) => classify(parseNameStatus(s));

test('flags/ adicionado é FF nova; env/nonprod junto não conta como alteração', () => {
  const r = diff('A\tflags/ft_a.json\nA\tenv/nonprod/ft_a.json\nM\tcatalog/keys.json');
  assert.deepStrictEqual(r, { newKeys: ['ft_a'], changedKeys: [] });
});
test('modificar flags/ ou env/nonprod de FF existente é alteração', () => {
  const r = diff('M\tflags/ft_b.json\nM\tenv/nonprod/ft_c.json');
  assert.deepStrictEqual(r.changedKeys.sort(), ['ft_b', 'ft_c']);
  assert.deepStrictEqual(r.newKeys, []);
});
test('remover FF conta como alteração', () => {
  assert.deepStrictEqual(diff('D\tflags/ft_d.json').changedKeys, ['ft_d']);
});

const ok = { repoKeys: ['ft_x'], remoteKeys: ['ft_x', 'ft_so_no_firebase'] };

test('feature: FF nova com nome livre passa', () => {
  assert.strictEqual(evaluate({ mode: 'feature', newKeys: ['ft_nova'], changedKeys: [], ...ok }).ok, true);
});
test('feature: alterar FF existente é bloqueado e manda usar update/*', () => {
  const r = evaluate({ mode: 'feature', newKeys: [], changedKeys: ['ft_x'], ...ok });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /já existe.*update\/\*/);
});
test('feature: nome que já existe no Firebase (mesmo fora do repo) é bloqueado', () => {
  const r = evaluate({ mode: 'feature', newKeys: ['ft_so_no_firebase'], changedKeys: [], ...ok });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /Firebase NÃO PROD/);
});
test('feature: nome duplicado ignorando maiúsculas é bloqueado', () => {
  assert.strictEqual(evaluate({ mode: 'feature', newKeys: ['ft_X'], changedKeys: [], ...ok }).ok, false);
  assert.strictEqual(evaluate({ mode: 'feature', newKeys: ['ft_SO_no_firebase'], changedKeys: [], ...ok }).ok, false);
});
test('update: alterar FF existente passa; criar FF nova é bloqueado', () => {
  assert.strictEqual(evaluate({ mode: 'update', newKeys: [], changedKeys: ['ft_x'], ...ok }).ok, true);
  const r = evaluate({ mode: 'update', newKeys: ['ft_nova'], changedKeys: [], ...ok });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /feature\/\*/);
});
