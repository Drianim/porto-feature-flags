#!/usr/bin/env node
// Bloqueia nome de FF duplicado no PR.
//   feature/*: só FF nova; o nome não pode existir em main nem no Remote Config NÃO PROD (consulta o Firebase)
//   update/* : só FF que já existe
// Uso: node scripts/check-new-flags.js <branch-de-origem> [<base-ref>=origin/main] [--skip-remote]
// Env: FIREBASE_SA_KEY_NONPROD (a consulta ao Firebase só acontece quando há FF nova numa feature/*).
const { execSync } = require('child_process');
const { environments, parseArgs } = require('./lib/common');
const { parseNameStatus, classify, evaluate, keyOf } = require('./lib/new-flags');

const args = parseArgs(process.argv.slice(2));
const branch = args._[0];
const base = args._[1] || 'origin/main';
if (!branch) { console.error('Uso: node scripts/check-new-flags.js <branch> [base-ref] [--skip-remote]'); process.exit(1); }

const mode = branch.startsWith('feature/') ? 'feature' : branch.startsWith('update/') ? 'update' : null;
if (!mode) { console.log(`Branch ${branch}: regra de FF nova/update não se aplica.`); process.exit(0); }

const sh = (c) => execSync(c, { encoding: 'utf8' });

(async () => {
  const { newKeys, changedKeys } = classify(parseNameStatus(sh(`git diff --name-status --no-renames ${base}...HEAD`)));
  const repoKeys = sh(`git ls-tree -r --name-only ${base} -- flags/`).split('\n').filter(Boolean).map(keyOf);

  let remoteKeys = [];
  if (mode === 'feature' && newKeys.length && !args['skip-remote']) {
    const { connect } = require('./lib/remote-config');
    const { rc, projectId } = await connect(environments().nonprod);
    const t = await rc.getTemplate();
    remoteKeys = [...Object.keys(t.parameters || {}), ...Object.values(t.parameterGroups || {}).flatMap((g) => Object.keys(g.parameters || {}))];
    console.log(`Firebase NÃO PROD (${projectId}): ${remoteKeys.length} chave(s) consultadas.`);
  }

  const r = evaluate({ mode, newKeys, changedKeys, repoKeys, remoteKeys });
  if (!r.ok) {
    console.error(`✗ ${branch}: nome de FF duplicado ou branch errada:\n${r.problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`✓ ${branch}: ${mode === 'feature' ? `${newKeys.length} FF nova(s), nenhuma duplicada` : `${changedKeys.length} FF existente(s) alterada(s)`}`);
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
