#!/usr/bin/env node
// Só admin mescla chore/* e revert/*. Uso: node scripts/check-merger.js <branch-de-origem> [commit-de-merge=HEAD]
// Quem mesclou vem da API do GitHub (merged_by do PR cujo número está na mensagem "Merge pull request #N from ...").
// Env do GitHub Actions: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL. MERGED_BY (login) dispensa a API fora do Actions.
const { spawnSync } = require('child_process');
const { root, readJson } = require('./lib/common');
const { evaluate } = require('./lib/merger');

async function run(argv, env = process.env, deps = {}) {
  const d = {
    fetch: globalThis.fetch,
    config: null,
    commitMessage: (c) => spawnSync('git', ['log', '-1', '--format=%B', c], { cwd: root, encoding: 'utf8' }).stdout,
    stdout: console.log, stderr: console.error, ...deps,
  };
  const [source, commit = 'HEAD'] = argv;
  if (!source) { d.stderr('Uso: node scripts/check-merger.js <branch-de-origem> [commit]'); return 1; }
  if (!/^(chore|revert)\//.test(source)) { d.stdout(`${source}: a regra de admin só vale para chore/* e revert/*`); return 0; }
  const config = d.config || readJson('config', 'approvers.json');
  let mergedBy = env.MERGED_BY;
  if (!mergedBy) {
    const n = (/^Merge pull request #(\d+)/.exec(d.commitMessage(commit) || '') || [])[1];
    if (!n) { d.stderr(`✗ ${source}: não achei o número do PR na mensagem do commit de merge`); return 1; }
    const api = env.GITHUB_API_URL || 'https://api.github.com';
    const res = await d.fetch(`${api}/repos/${env.GITHUB_REPOSITORY}/pulls/${n}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
    if (!res.ok) { d.stderr(`✗ ${source}: não consegui ler o PR #${n} (HTTP ${res.status})`); return 1; }
    mergedBy = ((await res.json()).merged_by || {}).login;
  }
  const r = evaluate({ source, mergedBy, adminLogins: config.adminLogins });
  if (!r.ok) { r.problems.forEach((p) => d.stderr(`  ✗ ${p}`)); d.stderr(`✗ merge de ${source.split('/')[0]}/* por quem não é admin`); return 1; }
  d.stdout(`✓ merge de ${source} feito por admin (${mergedBy})`);
  return 0;
}

if (require.main === module) run(process.argv.slice(2)).then((code) => process.exit(code));
module.exports = { run };
