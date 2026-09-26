const test = require('node:test');
const assert = require('node:assert');
const { parseNameStatus, classify, evaluate } = require('./new-flags');

const diff = (s) => classify(parseNameStatus(s));

test('flags/ adicionado é FF nova; env/nonprod junto não conta como alteração', () => {
  const r = diff('A\tflags/ft_a.json\nA\tenv/nonprod/ft_a.json\nM\tcatalog/home/keys.json');
  assert.deepStrictEqual(r, { newKeys: ['ft_a'], changedKeys: [], removedKeys: [] });
});
test('modificar flags/ ou env/nonprod de FF existente é alteração', () => {
  const r = diff('M\tflags/ft_b.json\nM\tenv/nonprod/ft_c.json');
  assert.deepStrictEqual(r.changedKeys.sort(), ['ft_b', 'ft_c']);
  assert.deepStrictEqual(r.newKeys, []);
});
test('apagar só o env/nonprod de uma FF é alteração, não remoção', () => {
  const r = diff('D\tenv/nonprod/ft_d.json');
  assert.deepStrictEqual(r.changedKeys, ['ft_d']);
  assert.deepStrictEqual(r.removedKeys, []);
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

test('flags/ apagado é FF removida', () => {
  const r = diff('D\tflags/ft_x.json\nD\tenv/nonprod/ft_x.json\nM\tcatalog/home/keys.json');
  assert.deepStrictEqual(r, { newKeys: [], changedKeys: [], removedKeys: ['ft_x'] });
});
test('remove: só remoção passa; criar ou alterar é bloqueado', () => {
  assert.strictEqual(evaluate({ mode: 'remove', newKeys: [], changedKeys: [], removedKeys: ['ft_x'], repoKeys: ['ft_x'], remoteKeys: [] }).ok, true);
  assert.strictEqual(evaluate({ mode: 'remove', newKeys: ['ft_n'], changedKeys: [], removedKeys: [], repoKeys: [], remoteKeys: [] }).ok, false);
  const r = evaluate({ mode: 'remove', newKeys: [], changedKeys: ['ft_y'], removedKeys: [], repoKeys: ['ft_y'], remoteKeys: [] });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /update\/\*/);
});
test('feature e update não podem apagar FF: mandam usar remove/*', () => {
  for (const mode of ['feature', 'update']) {
    const r = evaluate({ mode, newKeys: [], changedKeys: [], removedKeys: ['ft_x'], repoKeys: ['ft_x'], remoteKeys: [] });
    assert.strictEqual(r.ok, false);
    assert.match(r.problems[0], /remove\/\*/);
  }
});
