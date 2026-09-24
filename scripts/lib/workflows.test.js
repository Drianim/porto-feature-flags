const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

// Workflows do GitHub Actions (spec 0010): travam o formato que a proteção da main e a segurança dependem.
const dir = path.join(__dirname, '..', '..', '.github', 'workflows');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.yml')) : [];
const wf = Object.fromEntries(files.map((f) => [f, yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
const runs = (job) => (job.steps || []).map((s) => s.run || '').join('\n');
const on = (w) => w.on || w[true]; // js-yaml lê a chave "on" como true

test('os seis workflows existem e o bitbucket-pipelines.yml saiu', () => {
  assert.deepStrictEqual(files.sort(), ['main.yml', 'plan-prod.yml', 'pr.yml', 'prod-scheduler.yml', 'sync-nonprod.yml', 'verify-nonprod.yml']);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', '..', 'bitbucket-pipelines.yml')));
});

test('segurança: nenhum pull_request_target, permissões mínimas no topo, nada do PR interpolado em run', () => {
  for (const [f, w] of Object.entries(wf)) {
    assert.doesNotMatch(text[f], /pull_request_target/, f);
    assert.deepStrictEqual(w.permissions, { contents: 'read' }, `${f}: permissões do topo`);
    for (const [name, job] of Object.entries(w.jobs)) {
      // entrada controlada por quem abre o PR só entra por env, nunca direto no script (injeção)
      assert.doesNotMatch(runs(job), /\$\{\{\s*github\.(head_ref|event\.pull_request)/, `${f}/${name}`);
    }
  }
});

test('PR: roda em pull_request para main, com "Tudo verde" consolidando todos os jobs', () => {
  const w = wf['pr.yml'];
  assert.deepStrictEqual(on(w).pull_request.branches, ['main']);
  const final = w.jobs['tudo-verde'];
  assert.strictEqual(final.name, 'Tudo verde');
  assert.strictEqual(final.if, 'always()');
  const others = Object.keys(w.jobs).filter((k) => k !== 'tudo-verde');
  assert.deepStrictEqual([...final.needs].sort(), others.sort(), 'Tudo verde precisa depender de todos os outros jobs');
  assert.match(runs(final), /node scripts\/ci\/all-green\.js/);
});

test('PR: todas as checagens de FF, de chore e de revert estão lá, cada uma no tipo certo', () => {
  const jobs = wf['pr.yml'].jobs;
  const find = (re) => Object.entries(jobs).find(([, j]) => re.test(runs(j)));
  const expect = [
    [/node scripts\/ci\/pr-kind\.js/, null],
    [/npm test[\s\S]*npm run validate/, null],
    [/node scripts\/check-scope\.js "\$HEAD_REF" origin\/main/, 'ff'],
    [/node scripts\/check-ownership\.js "\$HEAD_REF" origin\/main/, 'ff'],
    [/node scripts\/check-new-flags\.js "\$HEAD_REF" origin\/main/, 'ff'],
    [/node scripts\/deploy\.js nonprod --dry-run/, 'ff'],
    [/node scripts\/deploy\.js nonprod --validate/, 'ff'],
    [/node scripts\/ci\/check-revert\.js origin\/main/, 'revert'],
  ];
  for (const [re, when] of expect) {
    const hit = find(re);
    assert.ok(hit, `falta um job com ${re}`);
    if (when === 'ff') assert.match(String(hit[1].if), /needs\.tipo\.outputs\.ff == 'true'/, `${hit[0]} só para FF`);
    if (when === 'revert') assert.match(String(hit[1].if), /needs\.tipo\.outputs\.kind == 'revert'/, `${hit[0]} só para revert`);
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (/HEAD_REF/.test(runs(job))) assert.ok(job.env && job.env.HEAD_REF, `${name}: HEAD_REF vem por env`);
  }
});

test('PR: só os jobs que consultam o Firebase recebem o secret, e nenhum job de PR publica', () => {
  for (const [name, job] of Object.entries(wf['pr.yml'].jobs)) {
    const usesSecret = /FIREBASE_SA_KEY_NONPROD/.test(JSON.stringify(job.env || {}));
    const needsSecret = /check-new-flags|--validate/.test(runs(job));
    assert.strictEqual(usesSecret, needsSecret, name);
    assert.doesNotMatch(runs(job), /deploy\.js nonprod\s*$|deploy\.js nonprod\n|remove-flags|verify-sync.*--fix/m, `${name} não pode publicar`);
    assert.ok(!job.environment, `${name}: ambiente de deploy não roda em PR`);
  }
});

test('main: reconfere, reverte se falhar (única com escrita) e publica NÃO PROD só com aprovação no ambiente', () => {
  const w = wf['main.yml'];
  assert.deepStrictEqual(on(w).push.branches, ['main']);
  const writers = Object.entries(w.jobs).filter(([, j]) => j.permissions && j.permissions.contents === 'write').map(([k]) => k);
  assert.deepStrictEqual(writers, ['reconferir']);
  const rec = w.jobs.reconferir;
  assert.match(runs(rec), /sh scripts\/ci\/merge-source\.sh/);
  assert.match(runs(rec), /sh scripts\/ci\/recheck-merge\.sh/);
  const revert = rec.steps.find((s) => /revert-merge\.sh/.test(s.run || ''));
  assert.match(String(revert.if), /failure\(\)/);
  const deploy = w.jobs['publicar-nonprod'];
  assert.strictEqual(deploy.environment, 'nonprod');
  assert.deepStrictEqual(deploy.needs, 'reconferir');
  assert.match(runs(deploy), /run-if-source\.sh "feature\/\|update\/" node scripts\/deploy\.js nonprod/);
  assert.match(runs(deploy), /remove-flags\.js nonprod --base HEAD\^1/);
  assert.match(runs(deploy), /verify-sync\.js nonprod/);
  const prod = w.jobs['publicar-prod'];
  assert.strictEqual(prod.environment, 'production');
  assert.ok(w.jobs['gate-prod'], 'gate de aprovação de PROD');
  assert.match(runs(w.jobs['gate-prod']), /node scripts\/check-approvals\.js/);
});

test('checkouts com histórico completo (escopo, equipe e nome único comparam com a main)', () => {
  for (const [f, w] of Object.entries(wf)) {
    for (const [name, job] of Object.entries(w.jobs)) {
      for (const s of job.steps || []) {
        if (/actions\/checkout@/.test(s.uses || '')) assert.strictEqual(s.with && s.with['fetch-depth'], 0, `${f}/${name}`);
      }
    }
  }
});

test('workflows manuais: sync e verify NÃO PROD, plano e scheduler de PROD; sync só na main e com aprovação', () => {
  for (const f of ['sync-nonprod.yml', 'verify-nonprod.yml', 'plan-prod.yml', 'prod-scheduler.yml']) assert.ok('workflow_dispatch' in on(wf[f]), f);
  const sync = Object.values(wf['sync-nonprod.yml'].jobs)[0];
  assert.strictEqual(sync.environment, 'nonprod');
  assert.match(String(sync.if), /github\.ref == 'refs\/heads\/main'/);
  assert.match(runs(sync), /verify-sync\.js nonprod --fix/);
  assert.match(runs(Object.values(wf['verify-nonprod.yml'].jobs)[0]), /verify-sync\.js nonprod --strict/);
});
