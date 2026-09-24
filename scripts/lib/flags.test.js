const test = require('node:test');
const assert = require('node:assert');
const { targetingErrors, platformsOf, minVersionFor, compareVersions, justBelow } = require('./flags');

test('plataformas: ambas = ios e android', () => {
  assert.deepStrictEqual(platformsOf({ platforms: 'ambas' }).sort(), ['android', 'ios']);
  assert.deepStrictEqual(platformsOf({ platforms: 'ios' }), ['ios']);
  assert.deepStrictEqual(platformsOf({ platforms: 'android' }), ['android']);
});
test('FF sem platforms ou com valor inválido é reprovada', () => {
  assert.match(targetingErrors({ minVersion: '1.0.0' })[0], /platforms obrigatório/);
  assert.match(targetingErrors({ platforms: 'web', minVersion: '1.0.0' })[0], /platforms obrigatório/);
});
test('minVersion é obrigatória e precisa ser x.y.z', () => {
  assert.match(targetingErrors({ platforms: 'ambas' })[0], /minVersion obrigatório/);
  for (const v of ['2.61', '2.61.0-beta', 'v2.61.0', '', 'abc']) assert.match(targetingErrors({ platforms: 'ambas', minVersion: v })[0], /inválida/, v);
  assert.deepStrictEqual(targetingErrors({ platforms: 'ambas', minVersion: '2.61.0' }), []);
});
test('minVersion por plataforma: exatamente as plataformas da FF', () => {
  assert.deepStrictEqual(targetingErrors({ platforms: 'ambas', minVersion: { ios: '2.61.0', android: '2.60.1' } }), []);
  assert.match(targetingErrors({ platforms: 'ambas', minVersion: { ios: '2.61.0' } })[0], /exatamente: android,ios/);
  assert.match(targetingErrors({ platforms: 'ios', minVersion: { ios: '2.61.0', android: '2.61.0' } })[0], /exatamente: ios/);
  assert.match(targetingErrors({ platforms: 'ios', minVersion: { ios: '2.61' } })[0], /inválida/);
  assert.strictEqual(minVersionFor({ minVersion: { ios: '2.61.0', android: '2.58.0' } }, 'android'), '2.58.0');
  assert.strictEqual(minVersionFor({ minVersion: '2.61.0' }, 'ios'), '2.61.0');
});
test('comparação de versões e versão logo abaixo', () => {
  assert.ok(compareVersions('2.61.0', '2.9.9') > 0);
  assert.ok(compareVersions('2.61.0', '2.61.0') === 0);
  assert.ok(compareVersions('1.99.99', '2.0.0') < 0);
  assert.strictEqual(justBelow('2.61.3'), '2.61.2');
  assert.strictEqual(justBelow('2.61.0'), '2.60.999');
  assert.strictEqual(justBelow('2.0.0'), '1.999.999');
  assert.strictEqual(justBelow('0.0.0'), null);
});

const { teamErrors } = require('./flags');
test('equipe é obrigatória e precisa estar na lista oficial', () => {
  const teams = ['squad-a', 'squad-b'];
  assert.deepStrictEqual(teamErrors({ team: 'squad-a' }, teams), []);
  assert.match(teamErrors({}, teams)[0], /team obrigatório.*squad-a, squad-b/);
  assert.match(teamErrors({ team: '' }, teams)[0], /team obrigatório/);
  assert.match(teamErrors({ team: 'Squad A' }, teams)[0], /"Squad A" não está em config\/teams\.json.*squad-a, squad-b/);
  assert.match(teamErrors({ team: 'outra' }, teams)[0], /não está em config\/teams\.json/);
});
test('o campo antigo owner é erro e manda renomear para team', () => {
  const e = teamErrors({ owner: 'squad-a' }, ['squad-a']);
  assert.match(e[0], /owner foi renomeado para team/);
  assert.deepStrictEqual(teamErrors({ owner: 'squad-a', team: 'squad-a' }, ['squad-a']).length, 1);
});
test('config/teams.json: plataforma, equipes e membros válidos', () => {
  const { teamsErrors } = require('./flags');
  const ok = { platform: ['p@x.com'], teams: { 'squad-a': { members: ['a@x.com'] }, 'squad-b': { members: [] } } };
  assert.deepStrictEqual(teamsErrors(ok), []);
  assert.match(teamsErrors({ ...ok, platform: [] })[0], /"platform" precisa de ao menos um e-mail/);
  assert.match(teamsErrors({ ...ok, teams: {} }).join('|'), /lista de equipes vazia/);
  assert.match(teamsErrors({ ...ok, teams: { 'Squad A': { members: [] } } }).join('|'), /fora do formato/);
  assert.match(teamsErrors({ ...ok, teams: { 'squad-a': { members: ['sem-arroba'] } } }).join('|'), /e-mail inválido "sem-arroba"/);
  assert.match(teamsErrors({ ...ok, teams: { 'squad-a': { members: ['a@x.com', 'A@x.com'] } } }).join('|'), /repete o e-mail/);
  assert.match(teamsErrors({ ...ok, platform: ['p@x.com', 'p@x.com'] }).join('|'), /repete o e-mail/);
  assert.match(teamsErrors({ ...ok, teams: { 'squad-a': ['a@x.com'] } }).join('|'), /deve ser \{ "members"/);
  assert.match(teamsErrors(null)[0], /deve ser um objeto/);
});
