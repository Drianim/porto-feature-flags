const test = require('node:test');
const assert = require('node:assert');
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'pr-kind.js');
// Repo com main (admins = adrianoo-del) e uma branch que tenta se autorizar mudando o config/approvers.json.
function run(branch, author) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-'));
  const git = (c) => execSync(`git -c user.name=t -c user.email=t@t ${c}`, { cwd: dir, stdio: 'pipe' });
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config/approvers.json'), JSON.stringify({ adminLogins: ['adrianoo-del'] }));
  git('init -q -b main'); git('add -A'); git('commit -q -m base');
  git(`checkout -q -b ${branch}`);
  fs.writeFileSync(path.join(dir, 'config/approvers.json'), JSON.stringify({ adminLogins: ['adrianoo-del', author] }));
  git('commit -q -am autoriza');
  const out = path.join(dir, 'out.txt');
  const r = spawnSync('node', [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, HEAD_REF: branch, PR_AUTHOR: author, BASE_REF: 'main', GITHUB_OUTPUT: out } });
  const output = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, output };
}

test('admin da main abre chore/*; o tipo vai para a saída do Actions', () => {
  const r = run('chore/x', 'adrianoo-del');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.output, /kind=chore\nff=false/);
});
test('quem se colocou como admin só no próprio PR continua sem permissão', () => {
  const r = run('chore/x', 'intruso');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /só admin abre chore\/\*; o autor do PR é intruso/);
});
test('branch de FF passa para qualquer autor e marca ff=true', () => {
  const r = run('feature/x', 'qualquer');
  assert.strictEqual(r.code, 0);
  assert.match(r.output, /kind=feature\nff=true/);
});
