#!/usr/bin/env node
// PR de revert/*: confere que a branch só tem reverts de merges da main. Uso: node scripts/ci/check-revert.js [base=origin/main]
const { execFileSync } = require('child_process');
const { revertOnlyProblems } = require('../lib/revert-only');

const base = process.argv[2] || 'origin/main';
const subjects = execFileSync('git', ['log', '--no-merges', '--format=%s', `${base}..HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = revertOnlyProblems(subjects);
if (problems.length) { console.error(`✗ revert/* inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`); process.exit(1); }
console.log(`✓ revert/*: ${subjects.length} revert(s) de merge da main`);
