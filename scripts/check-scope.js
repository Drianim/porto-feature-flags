#!/usr/bin/env node
// Falha se o PR mexer em pastas fora do escopo da sua branch.
// Uso: node scripts/check-scope.js <branch-de-origem> [<base-ref>=origin/main]
const { execSync } = require('child_process');
const { checkScopeChanges } = require('./lib/scope');
const { parseNameStatus } = require('./lib/new-flags');

const branch = process.argv[2];
const base = process.argv[3] || 'origin/main';
if (!branch) { console.error('Uso: node scripts/check-scope.js <branch> [base-ref]'); process.exit(1); }

const changes = parseNameStatus(execSync(`git diff --name-status --no-renames ${base}...HEAD`, { encoding: 'utf8' }));
const r = checkScopeChanges(branch, changes);
if (!r.ok) {
  console.error(`✗ Escopo inválido para ${branch}:\n${r.problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ Escopo ok para ${branch} (${changes.length} arquivo(s) alterado(s))`);
