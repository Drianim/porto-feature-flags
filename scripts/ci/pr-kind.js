#!/usr/bin/env node
// Job "Tipo da branch" do PR: descobre o tipo e, em chore/* e revert/*, exige que o autor do PR seja admin.
// Os admins são lidos da MAIN (BASE_REF, padrão origin/main), nunca do PR: um PR não se autoriza.
// Env: HEAD_REF (branch do PR), PR_AUTHOR (login do autor), BASE_REF, GITHUB_OUTPUT (arquivo de saída do Actions).
const fs = require('fs');
const { execFileSync } = require('child_process');
const { prKind } = require('../lib/pr-gate');

const base = process.env.BASE_REF || 'origin/main';
let adminLogins = [];
try {
  adminLogins = JSON.parse(execFileSync('git', ['show', `${base}:config/approvers.json`], { encoding: 'utf8' })).adminLogins;
} catch (e) {
  console.error(`✗ não consegui ler config/approvers.json em ${base} (${e.message.split('\n')[0]})`);
  process.exit(1);
}
const r = prKind({ branch: process.env.HEAD_REF, author: process.env.PR_AUTHOR, adminLogins });
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `kind=${r.kind || ''}\nff=${r.ff}\n`);
if (!r.ok) { r.problems.forEach((p) => console.error(`✗ ${p}`)); process.exit(1); }
console.log(`✓ ${process.env.HEAD_REF}: tipo ${r.kind}${r.ff ? ' (FF)' : ''}`);
