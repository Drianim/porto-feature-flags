const test = require('node:test');
const assert = require('node:assert');
const { evaluate, approversErrors } = require('./merger');

const adminLogins = ['Adrianoo-Del'];
test('admin pode mesclar chore/* e revert/* (login do GitHub, ignora maiúsculas)', () => {
  for (const source of ['chore/ajuste', 'revert/pr-9-feature-x']) {
    assert.deepStrictEqual(evaluate({ source, mergedBy: 'adrianoo-del', adminLogins }), { ok: true, problems: [] }, source);
  }
});
test('quem não é admin não pode mesclar chore/* nem revert/*', () => {
  const r = evaluate({ source: 'chore/ajuste', mergedBy: 'outra-pessoa', adminLogins });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /só admin pode mesclar chore\/\*; o merge foi feito por outra-pessoa/);
  assert.strictEqual(evaluate({ source: 'revert/pr-1-x', mergedBy: 'outra-pessoa', adminLogins }).ok, false);
});
test('outras origens não passam por essa regra', () => {
  for (const source of ['feature/a', 'update/a', 'remove/a', 'release/a', '']) assert.strictEqual(evaluate({ source, mergedBy: 'outra', adminLogins }).ok, true);
});
test('lista de admins vazia ou quem mesclou desconhecido reprova', () => {
  assert.match(evaluate({ source: 'chore/a', mergedBy: 'adrianoo-del', adminLogins: [] }).problems[0], /adminLogins/);
  assert.match(evaluate({ source: 'chore/a', mergedBy: '', adminLogins }).problems[0], /não consegui identificar/);
});

test('config/approvers.json: adminLogins e platformLogins (logins do GitHub)', () => {
  const ok = { adminLogins: ['adrianoo-del'], platformLogins: [] };
  assert.deepStrictEqual(approversErrors(ok), []);
  assert.match(approversErrors({ ...ok, adminLogins: [] }).join('|'), /adminLogins/);
  assert.match(approversErrors({ ...ok, adminLogins: ['a@b.com'] }).join('|'), /adminLogins/);
  assert.match(approversErrors({ ...ok, platformLogins: ['com espaço'] }).join('|'), /platformLogins/);
  assert.match(approversErrors({ ...ok, platformLogins: 'x' }).join('|'), /platformLogins/);
  assert.match(approversErrors({ ...ok, admins: ['a@b.com'] }).join('|'), /substituído por adminLogins/);
});
