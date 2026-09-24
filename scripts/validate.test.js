const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

// Repo mínimo em pasta temporária com uma FF; devolve o resultado do validate.
function validate(flag, nonprod = { nonprod: { default: 'false' } }, teams) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  for (const d of ['flags', 'env/nonprod', 'env/prod', 'rm']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify(teams !== undefined ? teams : { platform: ['p@x.com'], teams: { 'squad-poc': { members: [] } } }));
  const base = { key: 'ft_v', description: 'd', team: 'squad-poc', criticality: 'baixa' };
  fs.writeFileSync(path.join(dir, 'flags/ft_v.json'), JSON.stringify({ ...base, ...flag }));
  fs.writeFileSync(path.join(dir, 'env/nonprod/ft_v.json'), JSON.stringify(nonprod));
  const r = spawnSync('node', ['scripts/validate.js'], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

test('FF com plataforma e versão mínima passa', () => {
  assert.strictEqual(validate({ platforms: 'ambas', minVersion: '2.61.0' }).ok, true);
});
test('FF sem versão mínima é reprovada', () => {
  const r = validate({ platforms: 'ambas' });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /minVersion obrigatório/);
});
test('FF sem plataforma é reprovada', () => {
  const r = validate({ minVersion: '2.61.0' });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /platforms obrigatório/);
});
test('bloco de plataforma que a FF não cobre é reprovado', () => {
  const r = validate({ platforms: 'ios', minVersion: '2.61.0' }, { nonprod: { default: 'false', android: { value: 'true' } } });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /nonprod\.android definido, mas a FF é só para ios/);
});
test('bloco de plataforma dentro do escopo da FF passa', () => {
  assert.strictEqual(validate({ platforms: 'ios', minVersion: '2.61.0' }, { nonprod: { default: 'false', ios: { value: 'true' } } }).ok, true);
});

test('FF sem equipe é reprovada e a mensagem lista as equipes válidas', () => {
  const r = validate({ platforms: 'ambas', minVersion: '2.61.0', team: undefined });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /team obrigatório.*squad-poc/);
});
test('equipe fora de config/teams.json é reprovada', () => {
  const r = validate({ platforms: 'ambas', minVersion: '2.61.0', team: 'outra-equipe' });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /"outra-equipe" não está em config\/teams\.json/);
});
test('campo antigo owner é reprovado com a instrução de migrar', () => {
  const r = validate({ platforms: 'ambas', minVersion: '2.61.0', owner: 'squad-poc' });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /owner foi renomeado para team/);
});
test('config/teams.json inválido (plataforma vazia, e-mail ruim, equipe fora do formato) é reprovado', () => {
  const f = { platforms: 'ambas', minVersion: '2.61.0' };
  const cfg = (over) => ({ platform: ['p@x.com'], teams: { 'squad-poc': { members: [] } }, ...over });
  assert.match(validate(f, undefined, cfg({ platform: [] })).out, /"platform" precisa de ao menos um e-mail/);
  assert.match(validate(f, undefined, cfg({ teams: {} })).out, /lista de equipes vazia/);
  assert.match(validate(f, undefined, cfg({ teams: { 'Squad POC': { members: [] } } })).out, /fora do formato/);
  assert.match(validate(f, undefined, cfg({ teams: { 'squad-poc': { members: ['x'] } } })).out, /e-mail inválido/);
});
