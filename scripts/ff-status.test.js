const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, apply } = require('./lib/remote-config');
const { run } = require('./ff-status');

const base = { description: 'd', owner: 'squad-a', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0' };
const flags = [
  { ...base, key: 'ft_ambos', environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } } },
  { ...base, key: 'ft_ios50', platforms: 'ios', owner: 'squad-b', environments: { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 50 } } } },
  { ...base, key: 'rc_url', platforms: 'android', environments: { nonprod: { default: 'https://x' } } },
];
const envs = { nonprod: { keyVar: 'K', projectId: 'p', timeGated: false }, prod: { keyVar: 'KP', timeGated: true } };
const freshTemplate = () => apply({ parameters: {}, parameterGroups: {}, conditions: [], version: { versionNumber: '24', updateTime: '2026-09-24T12:00:00Z', updateUser: { email: 'a@b.com' } } }, build(flags, [], 'nonprod', envs.nonprod));

// Roda o comando com dependências falsas. `calls` registra o que foi chamado no "Firebase".
function exec(argv, { hasKey = true, template = freshTemplate(), versions = [{ versionNumber: '24', updateTime: 't', updateUser: { email: 'a@b.com' }, description: 'deploy' }], connectError } = {}) {
  const out = []; const err = []; const calls = [];
  const rc = new Proxy({
    getTemplate: async () => { calls.push('getTemplate'); return template; },
    listVersions: async (o) => { calls.push('listVersions'); return { versions: versions.slice(0, o.pageSize) }; },
  }, { get: (t, p) => t[p] ?? (() => { throw new Error(`ESCRITA PROIBIDA: ${String(p)}`); }) });
  const deps = {
    loadFlags: () => flags, loadRms: () => [], environments: () => envs, now: () => new Date('2026-09-24T12:00:00Z'), hasKey: () => hasKey,
    connect: async () => { calls.push('connect'); if (connectError) throw new Error(connectError); return { rc, projectId: 'p' }; },
    stdout: (s) => out.push(s), stderr: (s) => err.push(s),
  };
  return run(argv, deps).then((code) => ({ code, out: out.join('\n'), err: err.join('\n'), calls }));
}

test('list offline: só o repositório, avisa que não consultou o Firebase e não conecta', async () => {
  const r = await exec(['list', '--offline']);
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /\| `ft_ambos` \| toggle \(Boolean\) \| ambas \| 2\.61\.0 \| ligada 100% \| ligada 100% \|/);
  assert.match(r.out, /Firebase não consultado/);
  assert.deepStrictEqual(r.calls, []);
});
test('sem credencial também responde com o repositório', async () => {
  const r = await exec(['summary'], { hasKey: false });
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /Total: 3/);
  assert.match(r.out, /Firebase não consultado/);
});
test('list com Firebase mostra a sincronia por FF', async () => {
  const t = freshTemplate(); delete t.parameters.ft_ios50;
  const r = await exec(['list'], { template: t });
  assert.match(r.out, /ft_ambos.*✓ ok/);
  assert.match(r.out, /ft_ios50.*✗ ausente/);
});
test('filtros e --json', async () => {
  const r = await exec(['list', '--offline', '--platform', 'android', '--json']);
  const j = JSON.parse(r.out);
  assert.deepStrictEqual([j.command, j.env, j.firebase, j.count], ['list', 'nonprod', false, 2]);
  assert.deepStrictEqual(j.flags.map((f) => f.key), ['ft_ambos', 'rc_url']);
});
test('detail e rollout de uma FF; chave inexistente sai com 1', async () => {
  const d = await exec(['detail', 'ft_ios50']);
  assert.strictEqual(d.code, 0);
  for (const re of [/## `ft_ios50`/, /~50% recebem true, demais false/, /### No Firebase/, /Sincronia: ✓ ok/]) assert.match(d.out, re);
  const ro = await exec(['rollout', 'ft_ios50', '--offline']);
  assert.match(ro.out, /## Rollout: `ft_ios50`/);
  const nf = await exec(['detail', 'ft_nao_existe']);
  assert.strictEqual(nf.code, 1);
  assert.match(nf.err, /não existe no repositório/);
});
test('summary com a última publicação; history respeita --limit', async () => {
  const s = await exec(['summary']);
  assert.match(s.out, /Última publicação: versão 24 em 2026-09-24T12:00:00Z por a@b\.com/);
  const versions = [1, 2, 3].map((n) => ({ versionNumber: String(n), updateTime: 't', updateUser: { email: 'x@y.z' }, description: `v${n}` }));
  const h = await exec(['history', '--limit', '2'], { versions });
  assert.match(h.out, /Últimas 2 versões/);
  assert.doesNotMatch(h.out, /\| 3 \|/);
});
test('sync aponta divergência e chave só no Firebase; stale lista candidatas', async () => {
  const t = freshTemplate();
  t.conditions.find((c) => c.name === 'ft_ambos_ios').expression = "device.os == 'ios'";
  t.parameters.legado = { defaultValue: { value: '1' } };
  const sy = await exec(['sync'], { template: t });
  assert.strictEqual(sy.code, 0);
  assert.match(sy.out, /`ft_ambos` ✗ diverge/);
  assert.match(sy.out, /`legado`: existe no Firebase e não está no repositório/);
  const st = await exec(['stale'], { template: t });
  assert.match(st.out, /- `ft_ambos`/);
  assert.match(st.out, /- `legado`/);
});
test('sync e history sem Firebase saem com 1 e dizem o que falta', async () => {
  for (const argv of [['sync', '--offline'], ['history']]) {
    const r = await exec(argv, { hasKey: argv[1] !== '--offline' ? false : true });
    assert.strictEqual(r.code, 1, argv.join(' '));
    assert.match(r.err, /consulta o Firebase NÃO PROD/);
  }
});
test('falha ao falar com o Firebase sai com 1 e mensagem clara (sem cair para o repositório)', async () => {
  const r = await exec(['list'], { connectError: 'getaddrinfo ENOTFOUND firebaseremoteconfig.googleapis.com' });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /ENOTFOUND/);
});
test('somente leitura: só getTemplate e listVersions são chamados em todos os subcomandos', async () => {
  for (const argv of [['list'], ['detail', 'ft_ambos'], ['summary'], ['sync'], ['history'], ['stale'], ['rollout', 'ft_ambos']]) {
    const r = await exec(argv);
    assert.strictEqual(r.code, 0, `${argv.join(' ')}: ${r.err}`);
    assert.ok(r.calls.every((c) => ['connect', 'getTemplate', 'listVersions'].includes(c)), `${argv.join(' ')}: ${r.calls}`);
  }
});
test('argumento inválido sai com 1 antes de qualquer consulta', async () => {
  for (const argv of [['detail', 'ft_x;rm -rf'], ['list', '--platform', 'web'], ['apagar']]) {
    const r = await exec(argv);
    assert.strictEqual(r.code, 1);
    assert.deepStrictEqual(r.calls, []);
  }
});
test('sem argumentos mostra a ajuda', async () => {
  const r = await exec([]);
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /Uso: node scripts\/ff-status\.js/);
});
test('o código do comando não referencia nenhuma chamada de escrita do Admin SDK', () => {
  for (const f of ['ff-status.js', 'lib/status.js']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(src, /publishTemplate|validateTemplate|createTemplateFromJSON|rollback\(|\bapply\(|removeKeys|fetch\(/, f);
  }
});
test('o comando real roda offline sobre o repositório e cobre todas as FFs', () => {
  const root = path.join(__dirname, '..');
  const r = spawnSync('node', ['scripts/ff-status.js', 'list', '--offline', '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, FIREBASE_SA_KEY_NONPROD: '' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).count, fs.readdirSync(path.join(root, 'flags')).filter((f) => f.endsWith('.json')).length);
});
