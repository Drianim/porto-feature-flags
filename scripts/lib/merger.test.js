const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('./merger');

const admins = ['Admin@x.com'];
test('admin pode mesclar chore/* (ignora maiúsculas)', () => {
  assert.strictEqual(evaluate({ source: 'chore/ajuste', mergerEmail: 'admin@x.com', admins }).ok, true);
});
test('quem não é admin não pode mesclar chore/*', () => {
  const r = evaluate({ source: 'chore/ajuste', mergerEmail: 'outro@x.com', admins });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /só admin pode mesclar chore/);
});
test('outras origens não passam por essa regra', () => {
  for (const source of ['feature/a', 'update/a', 'remove/a', 'release/a', '']) assert.strictEqual(evaluate({ source, mergerEmail: 'outro@x.com', admins }).ok, true);
});
test('lista de admins vazia ou merger desconhecido reprova chore/*', () => {
  assert.strictEqual(evaluate({ source: 'chore/a', mergerEmail: 'admin@x.com', admins: [] }).ok, false);
  assert.strictEqual(evaluate({ source: 'chore/a', mergerEmail: '', admins }).ok, false);
});
