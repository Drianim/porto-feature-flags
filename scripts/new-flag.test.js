const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
// Repositório temporário (scripts + config) para rodar new-flag sem sujar o real.
function newFlag(args, branch = 'feature/nova') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify({ platform: ['p@x.com'], teams: { 'squad-a': { members: [] }, 'squad-b': { members: [] } } }));
  fs.mkdirSync(path.join(dir, 'flags'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  spawnSync('git', ['checkout', '-q', '-b', branch], { cwd: dir });
  const r = spawnSync('node', ['scripts/new-flag.js', ...args], { cwd: dir, encoding: 'utf8' });
  const key = args[0];
  const file = path.join(dir, `flags/${key}.json`);
  const flag = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const envPath = path.join(dir, `env/nonprod/${key}.json`);
  const env = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, flag, env };
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
test('branch fora de feature/* é bloqueada, sem criar arquivo', () => {
  const r = newFlag([...ok, '--team', 'squad-b'], 'chore/algo');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /branch "chore\/algo" não é feature\/\*/);
  assert.strictEqual(r.flag, null);
});
test('branch update/* também é bloqueada (só feature/* cria FF)', () => {
  const r = newFlag([...ok, '--team', 'squad-b'], 'update/algo');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /branch "update\/algo" não é feature\/\*/);
  assert.strictEqual(r.flag, null);
});

test('--ios true grava o bloco ios além do default', () => {
  const r = newFlag([...ok, '--team', 'squad-b', '--ios', 'true']);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(r.env, { nonprod: { default: 'false', ios: { value: 'true' } } });
});

test('--ios true --android false grava os dois blocos', () => {
  const r = newFlag([...ok, '--team', 'squad-b', '--ios', 'true', '--android', 'false']);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(r.env, { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'false' } } });
});

test('--ios numa chave rc_ é erro', () => {
  const rc = ['rc_novo', '--criticality', 'baixa', '--description', 'Teste', '--platforms', 'ambas', '--min-version', '2.61.0', '--value', 'x'];
  const r = newFlag([...rc, '--team', 'squad-b', '--ios', 'true']);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /--ios\/--android só valem para chaves ft_ \(toggle\)/);
  assert.strictEqual(r.flag, null);
});

test('--android informado com --platforms ios (fora da lista) é erro', () => {
  const iosOnly = ['ft_novo', '--criticality', 'baixa', '--description', 'Teste', '--platforms', 'ios', '--min-version', '2.61.0'];
  const r = newFlag([...iosOnly, '--team', 'squad-b', '--android', 'true']);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /--android informado, mas platforms é "ios"/);
  assert.strictEqual(r.flag, null);
});

test('--ios com valor inválido é erro', () => {
  const r = newFlag([...ok, '--team', 'squad-b', '--ios', 'talvez']);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /--ios "talvez" inválido: use "true" ou "false"/);
  assert.strictEqual(r.flag, null);
});
