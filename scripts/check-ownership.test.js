const test = require('node:test');
const assert = require('node:assert');
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const teamsCfg = { platform: ['plat@x.com'], teams: { 'squad-a': { members: ['ana@x.com'] }, 'squad-b': { members: ['bia@x.com'] } } };
const flag = (key, team) => JSON.stringify({ key, description: 'd', team, criticality: 'baixa', platforms: 'ambas', minVersion: '1.0.0' });

// Repositório com main (ft_a da squad-a, ft_b da squad-b, um RM com as duas) e uma branch com a mudança feita por `author`.
function scenario(branch, author, change, { merge = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-'));
  const sh = (c) => execSync(c, { cwd: dir, stdio: 'pipe' });
  const write = (rel, content) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content); };
  const rm = (rel) => fs.rmSync(path.join(dir, rel));
  const commit = (email, msg) => sh(`git -c user.name=t -c user.email=${email} commit -q -m ${JSON.stringify(msg)}`);
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'));
  write('config/teams.json', JSON.stringify(teamsCfg));
  write('flags/ft_a.json', flag('ft_a', 'squad-a'));
  write('flags/ft_b.json', flag('ft_b', 'squad-b'));
  write('env/nonprod/ft_a.json', '{"nonprod":{"default":"false"}}');
  write('env/prod/ft_a.json', '{"prod":{"default":"false"}}');
  write('rm/RM-1.json', JSON.stringify({ id: 'RM-1', flags: ['ft_a'], targetEnvironments: ['prod'] }));
  write('.gitignore', 'node_modules\n');
  sh('git init -q -b main'); sh('git add -A'); commit('seed@x.com', 'base');
  sh(`git checkout -q -b ${branch}`);
  change({ write, rm });
  sh('git add -A'); commit(author, 'change');
  let base = 'main';
  if (merge) { sh('git checkout -q main'); sh(`git -c user.name=t -c user.email=plat@x.com merge -q --no-ff ${branch} -m "Merged in ${branch} (pull request #9)"`); base = 'HEAD^1'; }
  const r = spawnSync('node', ['scripts/check-ownership.js', branch, base], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}
const editA = ({ write }) => write('flags/ft_a.json', flag('ft_a', 'squad-a').replace('"d"', '"outra descrição"'));

test('membro da equipe dona altera a própria FF', () => {
  const r = scenario('update/x', 'ana@x.com', editA);
  assert.strictEqual(r.ok, true, r.out);
  assert.match(r.out, /1 FF\(s\) tocada\(s\)/);
});
test('membro de outra equipe não altera a FF: mensagem com FF, equipe e autor', () => {
  const r = scenario('update/x', 'bia@x.com', editA);
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /ft_a: FF da equipe "squad-a"; bia@x\.com não é membro dessa equipe nem da plataforma/);
});
test('a plataforma altera a FF de qualquer equipe', () => {
  assert.strictEqual(scenario('update/x', 'plat@x.com', editA).ok, true);
});
test('criar FF nova: só para a própria equipe (ou pela plataforma)', () => {
  const create = (team) => ({ write }) => { write('flags/ft_n.json', flag('ft_n', team)); write('env/nonprod/ft_n.json', '{"nonprod":{"default":"false"}}'); };
  assert.strictEqual(scenario('feature/x', 'ana@x.com', create('squad-a')).ok, true);
  const r = scenario('feature/x', 'ana@x.com', create('squad-b'));
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /ft_n: FF da equipe "squad-b"/);
  assert.strictEqual(scenario('feature/x', 'plat@x.com', create('squad-b')).ok, true);
});
test('apagar a FF de outra equipe é bloqueado', () => {
  const del = ({ rm }) => { rm('flags/ft_a.json'); rm('env/nonprod/ft_a.json'); rm('env/prod/ft_a.json'); rm('rm/RM-1.json'); };
  assert.strictEqual(scenario('remove/x', 'bia@x.com', del).ok, false);
  assert.strictEqual(scenario('remove/x', 'ana@x.com', del).ok, true);
});
test('transferir FF para outra equipe é só da plataforma', () => {
  const transfer = ({ write }) => write('flags/ft_a.json', flag('ft_a', 'squad-b'));
  for (const who of ['ana@x.com', 'bia@x.com']) {
    const r = scenario('update/x', who, transfer);
    assert.strictEqual(r.ok, false, who);
    assert.match(r.out, /mudar a equipe de "squad-a" para "squad-b" é permitido só à equipe de plataforma/);
  }
  assert.strictEqual(scenario('update/x', 'plat@x.com', transfer).ok, true);
});
test('RM: só quem é da equipe de todas as FFs dele altera', () => {
  const editRm = ({ write }) => write('rm/RM-1.json', JSON.stringify({ id: 'RM-1', flags: ['ft_a'], targetEnvironments: ['prod'], rollback: 'x' }));
  assert.strictEqual(scenario('release/x', 'ana@x.com', editRm).ok, true);
  const r = scenario('release/x', 'bia@x.com', editRm);
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /ft_a: FF da equipe "squad-a"/);
});
test('PR não se autoriza mexendo em config/teams.json', () => {
  const selfAuthorize = ({ write }) => {
    write('config/teams.json', JSON.stringify({ ...teamsCfg, teams: { ...teamsCfg.teams, 'squad-a': { members: ['ana@x.com', 'bia@x.com'] } } }));
    editA({ write });
  };
  const r = scenario('update/x', 'bia@x.com', selfAuthorize);
  assert.strictEqual(r.ok, false);
  assert.match(r.out, /config\/teams\.json: equipes e membros só mudam por uma chore/);
  assert.match(r.out, /ft_a: FF da equipe "squad-a"; bia@x\.com/);
});
test('chore/* não passa por essa regra', () => {
  const r = scenario('chore/x', 'bia@x.com', editA);
  assert.strictEqual(r.ok, true);
  assert.match(r.out, /não se aplica/);
});
test('na main: vale o autor dos commits, não quem fez o merge', () => {
  assert.strictEqual(scenario('update/x', 'bia@x.com', editA, { merge: true }).ok, false);
  assert.strictEqual(scenario('update/x', 'ana@x.com', editA, { merge: true }).ok, true);
});
test('mudança sem FF (catálogo, docs) passa para qualquer autor', () => {
  assert.strictEqual(scenario('update/x', 'bia@x.com', ({ write }) => write('catalog/home/keys.json', '{}')).ok, true);
});
