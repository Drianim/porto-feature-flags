#!/usr/bin/env node
// Cria rm/RM-<data>-<flag>.json. Uso: node scripts/new-rm.js --flags a,b --squad <squad> --schedule <ISO> [--envs prod]
// Plano de rollout padrão vem da maior criticidade entre as flags.
const fs = require('fs');
const path = require('path');
const { root, loadFlags, parseArgs } = require('./lib/common');

const a = parseArgs(process.argv.slice(2));
if (!a.flags || !a.squad || !a.schedule) {
  console.error('Uso: node scripts/new-rm.js --flags a,b --squad <squad> --schedule <ISO 8601> [--envs prod]');
  process.exit(1);
}
const keys = a.flags.split(',');
const all = loadFlags();
const order = ['baixa', 'media', 'critica'];
let crit = 'baixa';
for (const k of keys) {
  const f = all.find((x) => x.key === k);
  if (!f) { console.error(`✗ flag "${k}" não encontrada em flags/`); process.exit(1); }
  if (order.indexOf(f.criticality) > order.indexOf(crit)) crit = f.criticality;
}
const plans = {
  baixa: [{ percent: 100, monitorMinutes: 0 }],
  media: [{ percent: 25, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }],
  critica: [{ percent: 5, monitorMinutes: 30 }, { percent: 25, monitorMinutes: 60 }, { percent: 50, monitorMinutes: 120 }, { percent: 100, monitorMinutes: 0 }],
};

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const id = `RM-${date}-${keys[0]}`;
const rm = {
  id,
  flags: keys,
  targetEnvironments: a.envs ? a.envs.split(',') : ['prod'],
  criticality: crit,
  squad: a.squad,
  rollback: 'Voltar o toggle para false e publicar novamente',
  prodSchedule: a.schedule,
  rolloutPlan: plans[crit],
  approvals: { team: { name: '', date: '' }, platform: { name: '', date: '' } },
};
const file = path.join(root, 'rm', `${id}.json`);
if (fs.existsSync(file)) { console.error(`✗ rm/${id}.json já existe`); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(rm, null, 2) + '\n');
console.log(`✓ rm/${id}.json criado (criticidade ${crit}). Preencha as aprovações antes do PR para main.`);
