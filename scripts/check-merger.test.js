const test = require('node:test');
const assert = require('node:assert');
const { run } = require('./check-merger');

const cfg = { adminLogins: ['adrianoo-del'], platformLogins: [] };
function exec(argv, { env = {}, message = 'Merge pull request #12 from Drianim/chore/x', mergedBy = 'adrianoo-del', status = 200 } = {}) {
  const out = []; const err = []; const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, auth: opts.headers.Authorization }); return { ok: status < 300, status, json: async () => ({ merged_by: mergedBy ? { login: mergedBy } : null }) }; };
  const deps = { fetch, config: cfg, commitMessage: () => message, stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
  const e = { GITHUB_REPOSITORY: 'Drianim/porto-feature-flags', GITHUB_TOKEN: 'tok', GITHUB_API_URL: 'https://api.github.com', ...env };
  return run(argv, e, deps).then((code) => ({ code, out: out.join('\n'), err: err.join('\n'), calls }));
}

test('lê quem mesclou pela API (merged_by do PR do commit de merge) e aprova o admin', async () => {
  const r = await exec(['chore/x']);
  assert.strictEqual(r.code, 0, r.err);
  assert.strictEqual(r.calls[0].url, 'https://api.github.com/repos/Drianim/porto-feature-flags/pulls/12');
  assert.strictEqual(r.calls[0].auth, 'Bearer tok');
  assert.match(r.out, /feito por admin \(adrianoo-del\)/);
});
test('quem não é admin: sai com 1', async () => {
  const r = await exec(['chore/x'], { mergedBy: 'outra-pessoa' });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /só admin pode mesclar chore/);
});
test('MERGED_BY (fora do Actions) dispensa a API', async () => {
  const r = await exec(['revert/pr-1-x'], { env: { MERGED_BY: 'adrianoo-del' } });
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.calls, []);
});
test('sem número de PR na mensagem ou com erro da API: sai com 1 e explica', async () => {
  assert.match((await exec(['chore/x'], { message: 'commit direto' })).err, /número do PR/);
  assert.match((await exec(['chore/x'], { status: 404 })).err, /HTTP 404/);
});
test('outras origens não precisam de admin', async () => {
  const r = await exec(['feature/x']);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.calls, []);
});
