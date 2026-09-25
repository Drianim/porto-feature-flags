const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

test('lista os três comandos, new:flag pronto e os outros pendentes', () => {
  const r = spawnSync('node', ['scripts/flags-help.js'], { cwd: repoRoot, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /npm run new:flag/);
  assert.match(r.stdout, /npm run update:flag/);
  assert.match(r.stdout, /npm run remove:flag/);
  assert.match(r.stdout, /new:flag.*cria flags\//);
  assert.match(r.stdout, /update:flag.*ainda não implementado/);
  assert.match(r.stdout, /remove:flag.*ainda não implementado/);
});
