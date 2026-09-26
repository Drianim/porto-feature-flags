const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

// Repo mínimo em pasta temporária: duas equipes (uma sem FF), uma FF em cada equipe com FF.
function makeRepo({ teams = { platform: ['p@x.com'], teams: { home: { members: [] }, servicos: { members: [] }, plataforma: { members: [] } } }, flags = [{ key: 'ft_a', team: 'home' }, { key: 'ft_b', team: 'servicos' }] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  for (const d of ['flags', 'env/nonprod', 'env/prod']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify(teams));
  for (const f of flags) {
    const base = { key: f.key, description: 'd', team: f.team, criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0' };
    fs.writeFileSync(path.join(dir, `flags/${f.key}.json`), JSON.stringify(base));
    fs.writeFileSync(path.join(dir, `env/nonprod/${f.key}.json`), JSON.stringify({ nonprod: { default: 'false' } }));
  }
  return dir;
}

function run(dir, args = []) {
  const r = spawnSync('node', ['scripts/catalog.js', ...args], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

function readCatalog(dir, team) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'catalog', team, 'keys.json'), 'utf8'));
}

test('gera um catalog/<equipe>/keys.json por equipe, só com as FFs da própria equipe', () => {
  const dir = makeRepo();
  try {
    const r = run(dir);
    assert.strictEqual(r.ok, true);
    const home = readCatalog(dir, 'home');
    assert.strictEqual(home.total, 1);
    assert.strictEqual(home.keys[0].key, 'ft_a');
    const servicos = readCatalog(dir, 'servicos');
    assert.strictEqual(servicos.total, 1);
    assert.strictEqual(servicos.keys[0].key, 'ft_b');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('equipe sem FF ganha catalog/<equipe>/keys.json vazio', () => {
  const dir = makeRepo();
  try {
    run(dir);
    const plataforma = readCatalog(dir, 'plataforma');
    assert.strictEqual(plataforma.total, 0);
    assert.deepStrictEqual(plataforma.keys, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('catalog/keys.json único antigo não é gerado', () => {
  const dir = makeRepo();
  try {
    run(dir);
    assert.strictEqual(fs.existsSync(path.join(dir, 'catalog', 'keys.json')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--check passa quando todos os catálogos por equipe estão em dia', () => {
  const dir = makeRepo();
  try {
    run(dir);
    const r = run(dir, ['--check']);
    assert.strictEqual(r.ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--check falha nomeando a equipe quando o catálogo dela está desatualizado', () => {
  const dir = makeRepo();
  try {
    run(dir);
    fs.writeFileSync(path.join(dir, 'flags/ft_a.json'), JSON.stringify({ key: 'ft_a', description: 'mudou', team: 'home', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0' }));
    const r = run(dir, ['--check']);
    assert.strictEqual(r.ok, false);
    assert.match(r.out, /catalog\/home\/keys\.json desatualizado/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--check falha quando falta o catálogo de uma equipe', () => {
  const dir = makeRepo();
  try {
    run(dir);
    fs.rmSync(path.join(dir, 'catalog', 'servicos'), { recursive: true, force: true });
    const r = run(dir, ['--check']);
    assert.strictEqual(r.ok, false);
    assert.match(r.out, /catalog\/servicos\/keys\.json desatualizado/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--all imprime o agregado de todas as equipes e não grava nada em disco', () => {
  const dir = makeRepo();
  try {
    const before = fs.existsSync(path.join(dir, 'catalog'));
    assert.strictEqual(before, false);
    const r = run(dir, ['--all']);
    assert.strictEqual(r.ok, true);
    const parsed = JSON.parse(r.out);
    assert.strictEqual(parsed.total, 2);
    assert.deepStrictEqual(parsed.keys.map((k) => k.key).sort(), ['ft_a', 'ft_b']);
    assert.strictEqual(fs.existsSync(path.join(dir, 'catalog')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FF de uma equipe não altera o catálogo de outra equipe', () => {
  const dir = makeRepo();
  try {
    run(dir);
    const servicosBefore = fs.readFileSync(path.join(dir, 'catalog/servicos/keys.json'), 'utf8');
    fs.writeFileSync(path.join(dir, 'flags/ft_a.json'), JSON.stringify({ key: 'ft_a', description: 'nova descrição', team: 'home', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0' }));
    run(dir);
    const servicosAfter = fs.readFileSync(path.join(dir, 'catalog/servicos/keys.json'), 'utf8');
    assert.strictEqual(servicosAfter, servicosBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
