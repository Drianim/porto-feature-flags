const test = require('node:test');
const assert = require('node:assert');
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'revert-merge.sh');

// Repo com main, uma branch com mudança e o merge --no-ff no formato do GitHub; remoto = repositório bare local.
function scenario(branch, { message } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-'));
  const dir = path.join(root, 'work'); const bare = path.join(root, 'remote.git');
  fs.mkdirSync(dir); execSync(`git init -q --bare ${bare}`);
  const git = (c) => execSync(`git -c user.name=t -c user.email=t@t ${c}`, { cwd: dir, stdio: 'pipe' });
  git('init -q -b main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'original\n'); git('add -A'); git('commit -q -m base');
  const baseTree = execSync('git rev-parse HEAD^{tree}', { cwd: dir, encoding: 'utf8' }).trim();
  git(`checkout -q -b ${branch}`); fs.writeFileSync(path.join(dir, 'a.txt'), 'alterado\n'); git('add -A'); git('commit -q -m change');
  git('checkout -q main'); git(`merge -q --no-ff ${branch} -m ${JSON.stringify(message || `Merge pull request #9 from drianimadriano/${branch}`)}`);
  fs.writeFileSync(path.join(dir, 'merge-source.txt'), branch);
  const run = (exitCode, remote = bare) => {
    const r = spawnSync('sh', [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, RECHECK_EXIT_CODE: exitCode, GITHUB_REPOSITORY: 'drianimadriano/porto-feature-flags', REVERT_REMOTE_URL: remote } });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  // o Actions faz um checkout novo no commit do merge a cada execução
  const freshClone = () => { git('checkout -q -f main'); fs.writeFileSync(path.join(dir, 'merge-source.txt'), branch); };
  const remoteBranches = () => execSync(`git -C ${bare} branch --list`, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  const treeOf = (b) => execSync(`git -C ${bare} rev-parse ${b}^{tree}`, { encoding: 'utf8' }).trim();
  return { run, freshClone, remoteBranches, treeOf, baseTree, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('reconferência falhou: empurra revert/pr-9-... com a árvore de antes do merge e imprime o link', () => {
  const s = scenario('feature/x');
  const r = s.run('1');
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(s.remoteBranches(), ['revert/pr-9-feature-x']);
  assert.strictEqual(s.treeOf('revert/pr-9-feature-x'), s.baseTree, 'a reversão devolve exatamente o estado anterior');
  assert.match(r.out, /https:\/\/github\.com\/drianimadriano\/porto-feature-flags\/compare\/main\.\.\.revert\/pr-9-feature-x\?expand=1/);
  s.cleanup();
});
test('reconferência passou (exit 0): não faz nada', () => {
  const s = scenario('feature/x');
  const r = s.run('0');
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(s.remoteBranches(), []);
  s.cleanup();
});
test('origem que não publica (hotfix/*): não reverte', () => {
  const s = scenario('hotfix/x');
  const r = s.run('1');
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(s.remoteBranches(), []);
  assert.match(r.out, /nada a reverter/);
  s.cleanup();
});
test('chore/* mesclado por quem não é admin: prepara a reversão', () => {
  const s = scenario('chore/x');
  const r = s.run('1');
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(s.remoteBranches(), ['revert/pr-9-chore-x']);
  s.cleanup();
});
test('reexecução: não duplica a branch de reversão', () => {
  const s = scenario('update/x');
  s.run('1');
  s.freshClone();
  const again = s.run('1');
  assert.strictEqual(again.code, 0);
  assert.match(again.out, /já existe/);
  assert.deepStrictEqual(s.remoteBranches(), ['revert/pr-9-update-x']);
  s.cleanup();
});
test('nunca falha o step: remoto inacessível imprime a reversão manual e sai com 0', () => {
  const s = scenario('remove/x');
  const r = s.run('1', '/caminho/que/nao/existe.git');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /Reversão manual/);
  assert.deepStrictEqual(s.remoteBranches(), []);
  s.cleanup();
});

test('histórico do Bitbucket: também acha o número do PR ("Merged in ... (pull request #N)")', () => {
  const s = scenario('update/y', { message: 'Merged in update/y (pull request #31)' });
  s.run('1');
  assert.deepStrictEqual(s.remoteBranches(), ['revert/pr-31-update-y']);
  s.cleanup();
});
test('revert/* nunca é revertida automaticamente', () => {
  const s = scenario('revert/pr-1-feature-x');
  const r = s.run('1');
  assert.deepStrictEqual(s.remoteBranches(), []);
  assert.match(r.out, /nada a reverter/);
  s.cleanup();
});
