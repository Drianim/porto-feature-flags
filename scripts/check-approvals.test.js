const test = require('node:test');
const assert = require('node:assert');
const { run } = require('./check-approvals');

const env = { GITHUB_TOKEN: 'tok', GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc', GITHUB_API_URL: 'https://api.github.com' };
function exec(e, { prs = [{ number: 9, merged_at: '2026-09-24T00:00:00Z', user: { login: 'autor' } }], reviews = [] } = {}) {
  const out = []; const err = []; const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const body = url.includes('/commits/') ? prs : reviews;
    return { ok: true, status: 200, json: async () => body };
  };
  return run(e, { fetch, config: { adminLogins: ['a'], platformLogins: ['plat1'] }, stdout: (s) => out.push(s), stderr: (s) => err.push(s) })
    .then((code) => ({ code, out: out.join('\n'), err: err.join('\n'), urls }));
}

test('acha o PR mesclado do commit e aprova com plataforma + equipe', async () => {
  const r = await exec(env, { reviews: [{ user: { login: 'plat1' }, state: 'APPROVED' }, { user: { login: 'dev2' }, state: 'APPROVED' }] });
  assert.strictEqual(r.code, 0, r.err);
  assert.deepStrictEqual(r.urls, ['https://api.github.com/repos/o/r/commits/abc/pulls', 'https://api.github.com/repos/o/r/pulls/9/reviews?per_page=100']);
  assert.match(r.out, /PR #9: 1 aprovação\(ões\) da plataforma e 1 da equipe/);
});
test('sem a dupla aprovação: sai com 1 e diz o que falta', async () => {
  const r = await exec(env, { reviews: [{ user: { login: 'dev2' }, state: 'APPROVED' }] });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /falta aprovação de uma pessoa da plataforma/);
});
test('commit sem PR (push direto): reprova', async () => {
  const r = await exec(env, { prs: [] });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /nenhum PR/);
});
test('fora do GitHub Actions (sem token): reprova', async () => {
  const r = await exec({ ...env, GITHUB_TOKEN: '' });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /GITHUB_TOKEN/);
});
