const test = require('node:test');
const assert = require('node:assert');
const { execSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'merge-source.sh');
const sourceOf = (message) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-'));
  const git = (c) => execSync(`git -c user.name=t -c user.email=t@t ${c}`, { cwd: dir, stdio: 'pipe' });
  git('init -q');
  // sem shell: a mensagem chega ao Git com quebras de linha reais, como num merge de verdade
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', message], { cwd: dir, stdio: 'pipe' });
  const out = execSync(`sh ${script}`, { cwd: dir, encoding: 'utf8' }).trim();
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
};

test('merge por PR', () => {
  assert.strictEqual(sourceOf('Merged in feature/ft-x (pull request #3)\n\nApproved-by: y'), 'feature/ft-x');
});
test('merge de branch', () => {
  assert.strictEqual(sourceOf('Merged release/1.0 into main'), 'release/1.0');
});
test('commit comum não tem origem', () => {
  assert.strictEqual(sourceOf('feat: algo'), '');
});
test('merge de PR do GitHub (dono/branch, branch com barra)', () => {
  assert.strictEqual(sourceOf('Merge pull request #12 from drianimadriano/feature/ft-x\n\nfeat: algo'), 'feature/ft-x');
  assert.strictEqual(sourceOf('Merge pull request #7 from outra-pessoa/chore/ajuste-y'), 'chore/ajuste-y');
});
