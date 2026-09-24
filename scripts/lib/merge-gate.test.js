const test = require('node:test');
const assert = require('node:assert');
const { decide, kindOfBranch } = require('./merge-gate');

const FULL = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const ADMIN = '{11111111-2222-3333-4444-555555555555}';
const OUTRO = '{99999999-8888-7777-6666-555555555555}';
const AUTOR = '{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}';
// PR como a API do Bitbucket devolve (hash do commit abreviado em 12 caracteres)
const pr = (over = {}) => ({
  state: 'OPEN', source: { branch: { name: 'feature/x' }, commit: { hash: FULL.slice(0, 12) } },
  destination: { branch: { name: 'main' } }, author: { uuid: AUTOR }, participants: [], ...over,
});
const config = { adminUuids: [ADMIN], minApprovals: 0 };
const ok = (over = {}) => decide({ pr: pr(), validatedCommit: FULL, destination: 'main', kind: 'feature', triggererUuid: OUTRO, config, ...over });

test('tipo da branch pelo prefixo', () => {
  assert.strictEqual(kindOfBranch('feature/x'), 'feature');
  assert.strictEqual(kindOfBranch('revert/pr-9-feature-x'), 'revert');
  assert.strictEqual(kindOfBranch('chore/y'), 'chore');
  assert.strictEqual(kindOfBranch('hotfix/z'), null);
});
test('PR de FF validado, aberto, para a main, com o commit validado: pode mesclar (qualquer pessoa clica)', () => {
  assert.deepStrictEqual(ok(), { ok: true, problems: [] });
});
test('destino diferente de main é recusado (pela variável e pelo PR)', () => {
  assert.match(ok({ destination: 'develop' }).problems[0], /só mescla na main/);
  assert.match(decide({ pr: pr({ destination: { branch: { name: 'develop' } } }), validatedCommit: FULL, destination: 'main', kind: 'feature', triggererUuid: OUTRO, config }).problems.join('|'), /só mescla na main/);
});
test('PR que não está aberto é recusado', () => {
  for (const state of ['MERGED', 'DECLINED', 'SUPERSEDED']) {
    assert.match(ok({ pr: pr({ state }) }).problems[0], new RegExp(`está ${state}`), state);
  }
});
test('commit novo depois da validação é recusado: só mescla o que foi validado', () => {
  const r = ok({ pr: pr({ source: { branch: { name: 'feature/x' }, commit: { hash: 'ffffffffffff' } } }) });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /commit ffffffffffff.*validou a1b2c3d4e5f6/);
  assert.match(ok({ validatedCommit: '' }).problems[0], /commit validado/);
});
test('aprovações mínimas contam só outras pessoas', () => {
  const cfg = { ...config, minApprovals: 1 };
  assert.match(ok({ config: cfg }).problems[0], /1 aprovação.*tem 0/);
  const soDoAutor = pr({ participants: [{ user: { uuid: AUTOR }, approved: true }] });
  assert.strictEqual(ok({ config: cfg, pr: soDoAutor }).ok, false);
  const deOutro = pr({ participants: [{ user: { uuid: OUTRO }, approved: true }, { user: { uuid: ADMIN }, approved: false }] });
  assert.strictEqual(ok({ config: cfg, pr: deOutro }).ok, true);
});
test('chore/* e revert/* só são mesclados quando um admin clica em Run (UUID, ignora chaves e maiúsculas)', () => {
  for (const kind of ['chore', 'revert']) {
    const recusado = ok({ kind, triggererUuid: OUTRO });
    assert.strictEqual(recusado.ok, false, kind);
    assert.match(recusado.problems[0], /só admin mescla/);
    assert.strictEqual(ok({ kind, triggererUuid: ADMIN }).ok, true, kind);
    assert.strictEqual(ok({ kind, triggererUuid: ADMIN.toUpperCase().replace(/[{}]/g, '') }).ok, true, `${kind} sem chaves`);
  }
  assert.match(ok({ kind: 'chore', triggererUuid: '' }).problems[0], /quem clicou em Run/);
  assert.match(ok({ kind: 'chore', config: { ...config, adminUuids: [] } }).problems[0], /adminUuids vazio/);
});
test('prefixo fora do processo não é mesclado', () => {
  assert.match(ok({ kind: null }).problems[0], /fora do processo/);
});
test('vários motivos aparecem juntos', () => {
  const r = ok({ destination: 'develop', pr: pr({ state: 'MERGED' }), kind: 'chore' });
  assert.ok(r.problems.length >= 3);
});

// ---- chamada à API ----
const { getPr, mergePr } = require('./merge-gate');
const TOKEN = 'tok-SEGREDO-123';
// fetch falso: registra as chamadas e responde por rota
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined, auth: (opts.headers || {}).Authorization });
    const r = routes(url, opts, calls.length);
    return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: (h) => (r.headers || {})[h.toLowerCase()] || null }, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  f.calls = calls;
  return f;
}
const base = { workspace: 'ws', repo: 'repo', prId: '47', user: 'bot@x.com', token: TOKEN };
const BASE_URL = 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/47';

test('getPr lê o PR com autenticação básica da conta-bot', async () => {
  const f = fakeFetch(() => ({ status: 200, body: pr() }));
  const r = await getPr({ fetch: f, ...base });
  assert.strictEqual(r.state, 'OPEN');
  assert.strictEqual(f.calls[0].url, BASE_URL);
  assert.strictEqual(f.calls[0].auth, `Basic ${Buffer.from(`bot@x.com:${TOKEN}`).toString('base64')}`);
});

test('mergePr faz POST /merge com merge_commit, fecha a branch e NÃO manda mensagem (mantém "Merged in ...")', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { state: 'MERGED', merge_commit: { hash: 'abc123' } } }));
  const r = await mergePr({ fetch: f, ...base });
  assert.deepStrictEqual(r, { ok: true, message: 'PR #47 mesclado (commit abc123)', mergeCommit: 'abc123' });
  assert.strictEqual(f.calls[0].url, `${BASE_URL}/merge`);
  assert.strictEqual(f.calls[0].method, 'POST');
  assert.deepStrictEqual(f.calls[0].body, { type: 'pullrequest', merge_strategy: 'merge_commit', close_source_branch: true });
  assert.ok(!('message' in f.calls[0].body));
});

test('merge assíncrono (202): acompanha a tarefa até concluir', async () => {
  const f = fakeFetch((url, opts, n) => {
    if (n === 1) return { status: 202, headers: { location: `${BASE_URL}/merge/task-status/t1` }, body: {} };
    if (n === 2) return { status: 200, body: { task_status: 'PENDING' } };
    return { status: 200, body: { task_status: 'SUCCESS', merge_result: { state: 'MERGED', merge_commit: { hash: 'def456' } } } };
  });
  const r = await mergePr({ fetch: f, ...base, sleep: async () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mergeCommit, 'def456');
  assert.strictEqual(f.calls.length, 3);
});

test('erro da API vira mensagem clara, sem o token', async () => {
  const f = fakeFetch(() => ({ status: 400, body: { type: 'error', error: { message: `You can't merge a pull request that has already been merged (${TOKEN})` } } }));
  const r = await mergePr({ fetch: f, ...base });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /HTTP 400.*already been merged/);
  assert.doesNotMatch(r.message, /SEGREDO/);
});

test('sem permissão (403) ou credencial errada (401) explicam o que conferir', async () => {
  for (const status of [401, 403]) {
    const r = await mergePr({ fetch: fakeFetch(() => ({ status, body: { type: 'error', error: { message: 'Forbidden' } } })), ...base });
    assert.match(r.message, /conta-bot/, String(status));
  }
});
