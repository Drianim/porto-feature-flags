const test = require('node:test');
const assert = require('node:assert');
const { avisarFalha, TITULO } = require('./alertar-falha-scheduler');

function fakeFetch(issues, calls) {
  return async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (opts.method === 'POST' && url.endsWith('/issues')) {
      const body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ number: 99, ...body }) };
    }
    if (opts.method === 'POST' && /\/comments$/.test(url)) return { ok: true, json: async () => ({ id: 1 }) };
    if (!opts.method || opts.method === 'GET') return { ok: true, json: async () => issues };
    return { ok: false, status: 500 };
  };
}

test('sem Issue aberta com o título: cria uma nova', async () => {
  const calls = [];
  const r = await avisarFalha({ fetch: fakeFetch([], calls), token: 't', repo: 'org/repo', runUrl: 'https://x/run/1' });
  assert.deepStrictEqual(r, { action: 'created', number: 99 });
  const post = calls.find((c) => c.method === 'POST');
  assert.strictEqual(post.body.title, TITULO);
  assert.match(post.body.body, /https:\/\/x\/run\/1/);
});

test('já existe Issue aberta com o título: comenta nela em vez de criar outra', async () => {
  const calls = [];
  const abertas = [{ number: 42, title: TITULO }];
  const r = await avisarFalha({ fetch: fakeFetch(abertas, calls), token: 't', repo: 'org/repo', runUrl: 'https://x/run/2' });
  assert.deepStrictEqual(r, { action: 'commented', number: 42 });
  const post = calls.find((c) => c.method === 'POST');
  assert.match(post.url, /\/issues\/42\/comments$/);
  assert.match(post.body.body, /https:\/\/x\/run\/2/);
});

test('Issue aberta com outro título não conta como existente; PRs (que também são "issues") são ignorados', async () => {
  const calls = [];
  const abertas = [{ number: 1, title: 'outra coisa' }, { number: 2, title: TITULO, pull_request: {} }];
  const r = await avisarFalha({ fetch: fakeFetch(abertas, calls), token: 't', repo: 'org/repo', runUrl: 'https://x/run/3' });
  assert.strictEqual(r.action, 'created');
});

test('erro na API do GitHub propaga com mensagem clara', async () => {
  const fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(avisarFalha({ fetch, token: 't', repo: 'org/repo', runUrl: 'https://x' }), /GitHub API 403/);
});
