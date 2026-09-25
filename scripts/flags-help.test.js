const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

// Repositório temporário (só scripts/) com uma branch de verdade, para testar a saída por tipo de branch.
function help(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  if (branch) spawnSync('git', ['checkout', '-q', '-b', branch], { cwd: dir });
  const r = spawnSync('node', ['scripts/flags-help.js'], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('na main (ou fora de feature/update/remove), mostra os três fluxos com git checkout', () => {
  const r = help(null); // fica na branch padrão (master/main do git init)
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /git checkout -b feature\/<nome>/);
  assert.match(r.out, /npm run new:flag.*cria flags\//);
  assert.match(r.out, /git checkout -b update\/<nome>/);
  assert.match(r.out, /npm run update:flag — ainda não implementado/);
  assert.match(r.out, /git checkout -b remove\/<nome>/);
  assert.match(r.out, /npm run remove:flag — ainda não implementado/);
});

test('numa branch chore/*, também mostra os três fluxos completos', () => {
  const r = help('chore/algo');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /git checkout -b feature\/<nome>/);
  assert.match(r.out, /git checkout -b update\/<nome>/);
  assert.match(r.out, /git checkout -b remove\/<nome>/);
});

test('numa branch release/*, também mostra os três fluxos completos (release não cria FF)', () => {
  const r = help('release/2026-10');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /git checkout -b feature\/<nome>/);
  assert.match(r.out, /git checkout -b update\/<nome>/);
  assert.match(r.out, /git checkout -b remove\/<nome>/);
});

test('numa branch feature/*, mostra só new:flag, sem git checkout, e os outros como referência', () => {
  const r = help('feature/minha-ff');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /npm run new:flag.*cria flags\//);
  assert.doesNotMatch(r.out, /git checkout -b/);
  assert.match(r.out, /npm run update:flag — ainda não implementado/);
  assert.match(r.out, /npm run remove:flag — ainda não implementado/);
});

test('numa branch update/*, mostra só update:flag em destaque, sem git checkout', () => {
  const r = help('update/minha-ff');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /^Branch update\/\*: npm run update:flag — ainda não implementado/m);
  assert.doesNotMatch(r.out, /git checkout -b/);
  assert.match(r.out, /npm run new:flag.*cria flags\//);
  assert.match(r.out, /npm run remove:flag — ainda não implementado/);
});

test('numa branch remove/*, mostra só remove:flag em destaque, sem git checkout', () => {
  const r = help('remove/minha-ff');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /^Branch remove\/\*: npm run remove:flag — ainda não implementado/m);
  assert.doesNotMatch(r.out, /git checkout -b/);
  assert.match(r.out, /npm run new:flag.*cria flags\//);
  assert.match(r.out, /npm run update:flag — ainda não implementado/);
});
