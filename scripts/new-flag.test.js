const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
// Repositório temporário (scripts + config) para rodar new-flag sem sujar o real.
function newFlag(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify({ platform: ['p@x.com'], teams: { 'squad-a': { members: [] }, 'squad-b': { members: [] } } }));
  fs.mkdirSync(path.join(dir, 'flags'), { recursive: true });
  const r = spawnSync('node', ['scripts/new-flag.js', ...args], { cwd: dir, encoding: 'utf8' });
  const file = path.join(dir, 'flags/ft_novo.json');
  const flag = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, flag };
}
const ok = ['ft_novo', '--criticality', 'baixa', '--description', 'Teste', '--platforms', 'ambas', '--min-version', '2.61.0'];

test('cria a FF com a equipe informada', () => {
  const r = newFlag([...ok, '--team', 'squad-b']);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.strictEqual(r.flag.owner, undefined);
});
test('--team é obrigatório e precisa estar na lista oficial', () => {
  const missing = newFlag(ok);
  assert.strictEqual(missing.code, 1);
  assert.match(missing.out, /--team/);
  const bad = newFlag([...ok, '--team', 'outra']);
  assert.strictEqual(bad.code, 1);
  assert.match(bad.out, /"outra" não está em config\/teams\.json.*squad-a, squad-b/);
  assert.strictEqual(bad.flag, null);
});
test('--owner é recusado com a instrução de usar --team', () => {
  const r = newFlag([...ok, '--owner', 'squad-a']);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /--owner foi renomeado para --team/);
  assert.strictEqual(r.flag, null);
});
