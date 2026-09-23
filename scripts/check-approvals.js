#!/usr/bin/env node
// Gate de PROD na pipeline de main: confere no Bitbucket se o PR mergeado tem aprovação
// de plataforma + equipe. Env: BB_ACCESS_TOKEN (repository access token, escopo pullrequest:read),
// BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG, BITBUCKET_COMMIT (fornecidas pelo Bitbucket).
const { readJson } = require('./lib/common');
const { evaluate } = require('./lib/approvals');

const { BB_ACCESS_TOKEN, BITBUCKET_WORKSPACE: ws, BITBUCKET_REPO_SLUG: slug, BITBUCKET_COMMIT: commit } = process.env;
if (!BB_ACCESS_TOKEN || !ws || !slug || !commit) {
  console.error('✗ Defina BB_ACCESS_TOKEN (e rode dentro do Bitbucket Pipelines)');
  process.exit(1);
}
const api = async (p) => {
  const r = await fetch(`https://api.bitbucket.org/2.0/repositories/${ws}/${slug}/${p}`, {
    headers: { Authorization: `Bearer ${BB_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Bitbucket API ${r.status} em ${p}`);
  return r.json();
};

(async () => {
  const prs = await api(`commit/${commit}/pullrequests`);
  const merged = (prs.values || []).find((p) => p.state === 'MERGED') || (prs.values || [])[0];
  if (!merged) throw new Error('nenhum PR associado ao commit; push direto em main não é permitido');
  const pr = await api(`pullrequests/${merged.id}`);
  const result = evaluate(pr, readJson('config', 'approvers.json'));
  if (!result.ok) {
    console.error(`✗ PR #${merged.id} não cumpre a dupla aprovação:\n${result.problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`✓ PR #${merged.id}: ${result.platform.length} aprovação(ões) da plataforma e ${result.team.length} da equipe`);
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
