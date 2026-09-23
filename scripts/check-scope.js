#!/usr/bin/env node
// Falha se o PR mexer em pastas fora do escopo da sua branch.
// Uso: node scripts/check-scope.js <branch-de-origem> [<base-ref>=origin/main]
const { execSync } = require('child_process');
const { checkScope } = require('./lib/scope');

const branch = process.argv[2];
const base = process.argv[3] || 'origin/main';
if (!branch) { console.error('Uso: node scripts/check-scope.js <branch> [base-ref]'); process.exit(1); }

const files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' }).split('\n').filter(Boolean);
const r = checkScope(branch, files);
if (!r.ok) {
  console.error(`✗ Escopo inválido para ${branch}:\n${r.problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ Escopo ok para ${branch} (${files.length} arquivo(s) alterado(s))`);
