const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('./approvals');

// Revisões como a API do GitHub devolve (GET /repos/<dono>/<repo>/pulls/<n>/reviews), em ordem de envio.
const cfg = { platformLogins: ['plat1'] };
const rev = (login, state = 'APPROVED') => ({ user: { login }, state });

test('equipe + plataforma aprovados => ok', () => {
  const r = evaluate([rev('plat1'), rev('dev2')], 'autor', cfg);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([r.platform, r.team], [['plat1'], ['dev2']]);
});
test('só equipe => falta plataforma; só plataforma => falta equipe', () => {
  assert.match(evaluate([rev('dev2')], 'autor', cfg).problems[0], /plataforma/);
  assert.match(evaluate([rev('plat1')], 'autor', cfg).problems[0], /equipe/);
});
test('autor não conta como aprovador (ignora maiúsculas)', () => {
  assert.strictEqual(evaluate([rev('plat1'), rev('Autor')], 'autor', cfg).ok, false);
});
test('vale a última revisão de cada pessoa: aprovação depois retirada não conta', () => {
  assert.strictEqual(evaluate([rev('plat1'), rev('dev2'), rev('dev2', 'CHANGES_REQUESTED')], 'autor', cfg).ok, false);
  assert.strictEqual(evaluate([rev('plat1'), rev('dev2', 'CHANGES_REQUESTED'), rev('dev2')], 'autor', cfg).ok, true);
  assert.strictEqual(evaluate([rev('plat1'), rev('dev2'), rev('dev2', 'DISMISSED')], 'autor', cfg).ok, false);
  assert.strictEqual(evaluate([rev('plat1'), rev('dev2'), rev('dev2', 'COMMENTED')], 'autor', cfg).ok, true, 'comentário não desfaz aprovação');
});
test('lista de plataforma vazia falha', () => {
  assert.match(evaluate([rev('dev2')], 'autor', { platformLogins: [] }).problems.join('|'), /platformLogins/);
});
