const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('./approvals');

const cfg = { platform: ['plat1'] };
const pr = (approved) => ({
  author: { account_id: 'autor' },
  participants: approved.map((id) => ({ user: { account_id: id }, approved: true })),
});

test('equipe + plataforma aprovados => ok', () => {
  assert.strictEqual(evaluate(pr(['plat1', 'dev2']), cfg).ok, true);
});
test('só equipe => falta plataforma', () => {
  const r = evaluate(pr(['dev2']), cfg);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /plataforma/);
});
test('só plataforma => falta equipe', () => {
  assert.strictEqual(evaluate(pr(['plat1']), cfg).ok, false);
});
test('autor não conta como aprovador', () => {
  assert.strictEqual(evaluate(pr(['plat1', 'autor']), cfg).ok, false);
});
test('lista de plataforma vazia falha', () => {
  assert.strictEqual(evaluate(pr(['dev2']), { platform: [] }).ok, false);
});
