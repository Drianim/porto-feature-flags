const test = require('node:test');
const assert = require('node:assert');
const { prKind, allGreen } = require('./pr-gate');

const admins = ['adrianoo-del'];
test('tipo da branch do PR e o que roda para cada tipo', () => {
  assert.deepStrictEqual(prKind({ branch: 'feature/x', author: 'qualquer', adminLogins: admins }), { ok: true, kind: 'feature', ff: true, problems: [] });
  for (const b of ['update/x', 'remove/x', 'release/x']) assert.strictEqual(prKind({ branch: b, author: 'q', adminLogins: admins }).ff, true, b);
});
test('chore/* e revert/*: só admin abre (autor do PR, ignora maiúsculas)', () => {
  assert.deepStrictEqual(prKind({ branch: 'chore/x', author: 'Adrianoo-Del', adminLogins: admins }), { ok: true, kind: 'chore', ff: false, problems: [] });
  const r = prKind({ branch: 'revert/pr-1-x', author: 'outra-pessoa', adminLogins: admins });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /só admin abre revert\/\*.*outra-pessoa/);
  assert.match(prKind({ branch: 'chore/x', author: 'a', adminLogins: [] }).problems[0], /adminLogins/);
});
test('branch fora do processo reprova', () => {
  for (const b of ['hotfix/x', 'bugfix/y', 'main', 'develop', '']) {
    const r = prKind({ branch: b, author: 'adrianoo-del', adminLogins: admins });
    assert.strictEqual(r.ok, false, b);
    assert.match(r.problems[0], /fora do processo/);
  }
});

test('Tudo verde: passa só se nenhum job falhou nem foi cancelado e o tipo passou', () => {
  const needs = (over = {}) => ({ tipo: { result: 'success' }, validacao: { result: 'success' }, escopo: { result: 'skipped' }, ...over });
  assert.deepStrictEqual(allGreen(needs()), { ok: true, problems: [] });
  for (const bad of ['failure', 'cancelled']) {
    const r = allGreen(needs({ validacao: { result: bad } }));
    assert.strictEqual(r.ok, false, bad);
    assert.match(r.problems[0], new RegExp(`validacao: ${bad}`));
  }
  assert.match(allGreen(needs({ tipo: { result: 'skipped' } })).problems[0], /tipo/);
  assert.strictEqual(allGreen({}).ok, false);
});
