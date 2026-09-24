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

test('a conta-bot (mergeBot) também pode mesclar chore/*: é quem mescla depois de a pipeline conferir o admin', () => {
  assert.strictEqual(evaluate({ source: 'chore/a', mergerEmail: 'Bot@x.com', admins, mergeBot: 'bot@x.com' }).ok, true);
  assert.strictEqual(evaluate({ source: 'chore/a', mergerEmail: 'outro@x.com', admins, mergeBot: 'bot@x.com' }).ok, false);
  assert.strictEqual(evaluate({ source: 'chore/a', mergerEmail: 'admin@x.com', admins, mergeBot: '' }).ok, true);
});

const { approversErrors } = require('./merger');
test('config/approvers.json: formato de mergeBot, adminUuids e minApprovals', () => {
  const ok = { admins: ['a@x.com'], adminUuids: ['{11111111-2222-3333-4444-555555555555}'], mergeBot: 'bot@x.com', minApprovals: 0, platform: [] };
  assert.deepStrictEqual(approversErrors(ok), []);
  assert.deepStrictEqual(approversErrors({ ...ok, mergeBot: '', adminUuids: [] }), [], 'vazios = ainda não configurado');
  assert.match(approversErrors({ ...ok, mergeBot: 'sem-arroba' }).join('|'), /mergeBot/);
  assert.match(approversErrors({ ...ok, adminUuids: ['nao-e-uuid'] }).join('|'), /adminUuids/);
  assert.match(approversErrors({ ...ok, adminUuids: 'x' }).join('|'), /adminUuids/);
  for (const m of [-1, 1.5, '1']) assert.match(approversErrors({ ...ok, minApprovals: m }).join('|'), /minApprovals/, String(m));
  assert.match(approversErrors({ ...ok, admins: [] }).join('|'), /admins/);
});
