const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'merge-source.sh');
const sourceOf = (message) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-'));
  const git = (c) => execSync(`git -c user.name=t -c user.email=t@t ${c}`, { cwd: dir, stdio: 'pipe' });
  git('init -q');
  git(`commit -q --allow-empty -m ${JSON.stringify(message)}`);
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
