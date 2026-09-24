#!/usr/bin/env node
// Job "Tudo verde" do PR: passa só se todos os outros jobs passaram (ou não se aplicavam ao tipo da branch).
// Env: NEEDS = toJSON(needs) do GitHub Actions.
const { allGreen } = require('../lib/pr-gate');

let needs = {};
try { needs = JSON.parse(process.env.NEEDS || '{}'); } catch { needs = {}; }
const r = allGreen(needs);
if (!r.ok) { console.error(`✗ o PR ainda não pode ser mesclado:\n${r.problems.map((p) => `  - ${p}`).join('\n')}`); process.exit(1); }
console.log(`✓ tudo verde (${Object.keys(needs).length} checagens): o PR pode ser mesclado`);
