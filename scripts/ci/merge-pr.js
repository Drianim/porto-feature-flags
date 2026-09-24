#!/usr/bin/env node
// Último passo (manual) da pipeline de PR: "Mesclar o PR (depois de validar)". Só existe se todos os passos anteriores
// passaram. Confere o PR na API e mescla com a conta-bot, a única com permissão de merge na main (spec 0009).
// Env do Pipelines: BITBUCKET_PR_ID, BITBUCKET_PR_DESTINATION_BRANCH, BITBUCKET_BRANCH, BITBUCKET_COMMIT,
// BITBUCKET_STEP_TRIGGERER_UUID, BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG.
// Env secured: BB_MERGE_BOT_USER (e-mail da conta Atlassian da conta-bot) e BB_MERGE_BOT_TOKEN (API token dela).
const { readJson } = require('../lib/common');
const { decide, kindOfBranch, getPr, mergePr, scrub } = require('../lib/merge-gate');

async function run(env = process.env, deps = {}) {
  const d = { fetch: globalThis.fetch, config: null, stdout: console.log, stderr: console.error, ...deps };
  const token = env.BB_MERGE_BOT_TOKEN;
  const fail = (msg) => { d.stderr(scrub(`✗ ${msg}`, token)); return 1; };
  if (!env.BITBUCKET_PR_ID) return fail('este passo só roda numa pipeline de PR (BITBUCKET_PR_ID ausente)');
  if (!env.BB_MERGE_BOT_USER || !token) {
    return fail('defina BB_MERGE_BOT_USER (e-mail da conta-bot) e BB_MERGE_BOT_TOKEN (API token dela, escopo de leitura e escrita de pull request) como variáveis de repositório secured. Ver README, "Merge só pela pipeline".');
  }
  const api = { fetch: d.fetch, workspace: env.BITBUCKET_WORKSPACE, repo: env.BITBUCKET_REPO_SLUG, prId: env.BITBUCKET_PR_ID, user: env.BB_MERGE_BOT_USER, token };
  try {
    const config = d.config || readJson('config', 'approvers.json');
    const pr = await getPr(api);
    const r = decide({
      pr, validatedCommit: env.BITBUCKET_COMMIT, destination: env.BITBUCKET_PR_DESTINATION_BRANCH,
      kind: kindOfBranch(env.BITBUCKET_BRANCH), triggererUuid: env.BITBUCKET_STEP_TRIGGERER_UUID, config,
    });
    if (!r.ok) return fail(`PR #${env.BITBUCKET_PR_ID} não mesclado:\n${r.problems.map((p) => `  - ${p}`).join('\n')}`);
    const m = await mergePr(api);
    if (!m.ok) return fail(m.message);
    d.stdout(`✓ ${m.message}. A pipeline da main reconfere o merge e, se for FF, pausa no Run.`);
    return 0;
  } catch (e) {
    return fail(e.message);
  }
}

if (require.main === module) run().then((code) => process.exit(code));
module.exports = { run };
