const test = require('node:test');
const assert = require('node:assert');
const { run } = require('./merge-pr');

const FULL = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const ADMIN = '{11111111-2222-3333-4444-555555555555}';
const env = (over = {}) => ({
  BITBUCKET_PR_ID: '47', BITBUCKET_PR_DESTINATION_BRANCH: 'main', BITBUCKET_BRANCH: 'feature/x', BITBUCKET_COMMIT: FULL,
  BITBUCKET_STEP_TRIGGERER_UUID: ADMIN, BITBUCKET_WORKSPACE: 'ws', BITBUCKET_REPO_SLUG: 'repo',
  BB_MERGE_BOT_USER: 'bot@x.com', BB_MERGE_BOT_TOKEN: 'tok-SEGREDO-123', ...over,
});
const openPr = { state: 'OPEN', source: { commit: { hash: FULL.slice(0, 12) } }, destination: { branch: { name: 'main' } }, author: { uuid: '{a}' }, participants: [] };

function exec(e, { prBody = openPr, mergeStatus = 200 } = {}) {
  const out = []; const err = []; const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push(`${opts.method || 'GET'} ${url.replace('https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/47', '')}`);
    const merge = url.endsWith('/merge');
    const status = merge ? mergeStatus : 200;
    const body = merge ? (status === 200 ? { state: 'MERGED', merge_commit: { hash: 'abc123' } } : { error: { message: 'boom' } }) : prBody;
    return { status, ok: status < 300, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return run(e, { fetch, config: { adminUuids: [ADMIN], minApprovals: 0 }, stdout: (s) => out.push(s), stderr: (s) => err.push(s) })
    .then((code) => ({ code, out: out.join('\n'), err: err.join('\n'), calls }));
}

test('PR de FF validado: lê o PR e mescla', async () => {
  const r = await exec(env());
  assert.strictEqual(r.code, 0, r.err);
  assert.deepStrictEqual(r.calls, ['GET ', 'POST /merge']);
  assert.match(r.out, /PR #47 mesclado \(commit abc123\)/);
});
test('recusa não chama o merge e lista os motivos', async () => {
  const r = await exec(env(), { prBody: { ...openPr, source: { commit: { hash: 'ffffffffffff' } } } });
  assert.strictEqual(r.code, 1);
  assert.deepStrictEqual(r.calls, ['GET ']);
  assert.match(r.err, /não mesclado/);
  assert.match(r.err, /um push chegou depois da validação/);
});
test('chore/* por quem não é admin: recusado', async () => {
  const r = await exec(env({ BITBUCKET_BRANCH: 'chore/y', BITBUCKET_STEP_TRIGGERER_UUID: '{outro}' }));
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /só admin mescla chore/);
});
test('sem credencial da conta-bot: falha dizendo como configurar e não chama a API', async () => {
  const r = await exec(env({ BB_MERGE_BOT_TOKEN: '' }));
  assert.strictEqual(r.code, 1);
  assert.deepStrictEqual(r.calls, []);
  assert.match(r.err, /BB_MERGE_BOT_TOKEN/);
  assert.match(r.err, /secured/);
});
test('fora de uma pipeline de PR (sem BITBUCKET_PR_ID): falha', async () => {
  const r = await exec(env({ BITBUCKET_PR_ID: '' }));
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /pipeline de PR/);
});
test('erro no merge sai com 1 e o token nunca aparece', async () => {
  const r = await exec(env(), { mergeStatus: 500 });
  assert.strictEqual(r.code, 1);
  assert.doesNotMatch(r.out + r.err, /SEGREDO/);
});
