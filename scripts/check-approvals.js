#!/usr/bin/env node
// Gate de PROD na pipeline da main: confere no GitHub se o PR mesclado tem aprovação da plataforma + da equipe.
// Env do GitHub Actions: GITHUB_TOKEN (permissão pull-requests: read), GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_API_URL.
const { readJson } = require('./lib/common');
const { evaluate } = require('./lib/approvals');

async function run(env = process.env, deps = {}) {
  const d = { fetch: globalThis.fetch, config: null, stdout: console.log, stderr: console.error, ...deps };
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_SHA: sha } = env;
  if (!token || !repo || !sha) { d.stderr('✗ Defina GITHUB_TOKEN, GITHUB_REPOSITORY e GITHUB_SHA (rode dentro do GitHub Actions)'); return 1; }
  const base = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}`;
  const api = async (p) => {
    const r = await d.fetch(`${base}/${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub API ${r.status} em ${p}`);
    return r.json();
  };
  try {
    const prs = await api(`commits/${sha}/pulls`);
    const pr = prs.find((p) => p.merged_at) || prs[0];
    if (!pr) throw new Error('nenhum PR associado ao commit; push direto na main não é permitido');
    const reviews = await api(`pulls/${pr.number}/reviews?per_page=100`);
    const result = evaluate(reviews, pr.user && pr.user.login, d.config || readJson('config', 'approvers.json'));
    if (!result.ok) {
      d.stderr(`✗ PR #${pr.number} não cumpre a dupla aprovação:\n${result.problems.map((p) => `  - ${p}`).join('\n')}`);
      return 1;
    }
    d.stdout(`✓ PR #${pr.number}: ${result.platform.length} aprovação(ões) da plataforma e ${result.team.length} da equipe`);
    return 0;
  } catch (e) {
    d.stderr(`✗ ${e.message}`);
    return 1;
  }
}

if (require.main === module) run().then((code) => process.exit(code));
module.exports = { run };
