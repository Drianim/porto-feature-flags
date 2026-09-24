const test = require('node:test');
const assert = require('node:assert');
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const meta = (key) => JSON.stringify({ key, description: 'd', owner: 'o', criticality: 'baixa', valueType: 'STRING' });
const np = (v) => JSON.stringify({ nonprod: { default: v } });

// Monta um repo com main, aplica `change` numa branch e faz o merge --no-ff como o Bitbucket ("Merged in <branch> (pull request #N)").
function mergeAndRecheck(branch, change, mergerEmail = 't@t') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  const git = (c) => sh(`git -c user.name=t -c user.email=t@t ${c}`);
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'));
  for (const d of ['flags', 'env/nonprod', 'env/prod', 'rm']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'flags/ft_a.json'), meta('ft_a'));
  fs.writeFileSync(path.join(dir, 'env/nonprod/ft_a.json'), np('false'));
  fs.writeFileSync(path.join(dir, 'env/prod/.keep'), '');
  fs.writeFileSync(path.join(dir, 'rm/.keep'), '');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\nmerge-source.txt\n');
  git('init -q -b main'); git('add -A'); git('commit -q -m base');
  git(`checkout -q -b ${branch}`);
  change(
    (rel, content) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content); },
    (rel) => fs.rmSync(path.join(dir, rel)),
  );
  git('add -A'); git('commit -q -m change');
  git('checkout -q main');
  sh(`git -c user.name=t -c user.email=${mergerEmail} merge -q --no-ff ${branch} -m "Merged in ${branch} (pull request #9)"`);
  sh('sh scripts/ci/merge-source.sh > merge-source.txt');
  const r = spawnSync('sh', ['scripts/ci/recheck-merge.sh'], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

test('feature alterando FF existente é reprovada no merge', () => {
  const r = mergeAndRecheck('feature/x', (w) => w('env/nonprod/ft_a.json', np('true')));
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /já existe/);
});
test('feature criando FF nova passa', () => {
  const r = mergeAndRecheck('feature/x', (w) => { w('flags/ft_b.json', meta('ft_b')); w('env/nonprod/ft_b.json', np('false')); });
  assert.strictEqual(r.ok, true, r.out);
});
test('update alterando FF existente passa', () => {
  assert.strictEqual(mergeAndRecheck('update/x', (w) => w('env/nonprod/ft_a.json', np('true'))).ok, true);
});
test('update criando FF nova é reprovada', () => {
  const r = mergeAndRecheck('update/x', (w) => { w('flags/ft_b.json', meta('ft_b')); w('env/nonprod/ft_b.json', np('false')); });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /feature\/\*/);
});
test('feature mexendo em PROD é reprovada pelo escopo', () => {
  const r = mergeAndRecheck('feature/x', (w) => w('env/prod/ft_a.json', JSON.stringify({ prod: { default: 'false' } })));
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /não pode alterar PROD/);
});
test('release mexendo fora de PROD é reprovada pelo escopo', () => {
  const r = mergeAndRecheck('release/1.0', (w) => w('env/nonprod/ft_a.json', np('true')));
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /release\/\* só pode alterar/);
});
test('origem sem publicação (hotfix) não é reconferida', () => {
  const r = mergeAndRecheck('hotfix/x', (w) => w('env/prod/ft_a.json', JSON.stringify({ prod: { default: 'false' } })));
  assert.strictEqual(r.ok, true, r.out);
  assert.match(r.out, /nada a reconferir/);
});
test('chore/* mesclado por admin passa', () => {
  const r = mergeAndRecheck('chore/x', (w) => w('README.md', 'ajuste\n'), 'drianim.oliveira@gmail.com');
  assert.strictEqual(r.ok, true, r.out);
  assert.match(r.out, /feito por admin/);
});
test('chore/* mesclado por quem não é admin é reprovado', () => {
  const r = mergeAndRecheck('chore/x', (w) => w('README.md', 'ajuste\n'), 'outra.pessoa@x.com');
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /só admin pode mesclar chore/);
});

test('remove apagando FF passa', () => {
  const r = mergeAndRecheck('remove/x', (w, rm) => { rm('flags/ft_a.json'); rm('env/nonprod/ft_a.json'); });
  assert.strictEqual(r.ok, true, r.out);
});
test('remove alterando FF existente é reprovada', () => {
  const r = mergeAndRecheck('remove/x', (w) => w('env/nonprod/ft_a.json', np('true')));
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /remove\/\* só apaga/);
});
test('feature apagando FF é reprovada e manda usar remove/*', () => {
  const r = mergeAndRecheck('feature/x', (w, rm) => { rm('flags/ft_a.json'); rm('env/nonprod/ft_a.json'); });
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /remove\/\*/);
});
