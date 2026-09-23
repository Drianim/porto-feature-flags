#!/usr/bin/env node
// Valida flags/*.json e rm/RM-*.json. Uso: node scripts/validate.js [--prod]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const prod = process.argv.includes('--prod');
const CRIT = ['baixa', 'media', 'alta', 'critica'];
const TYPES = ['BOOLEAN', 'STRING', 'NUMBER', 'JSON'];
const ENVS = ['dev', 'hml', 'prod'];
const errors = [];
const err = (f, m) => errors.push(`${f}: ${m}`);

const readJson = (dir, filter) =>
  fs.readdirSync(path.join(root, dir)).filter(filter).map((f) => {
    try {
      return { file: `${dir}/${f}`, data: JSON.parse(fs.readFileSync(path.join(root, dir, f), 'utf8')) };
    } catch (e) {
      err(`${dir}/${f}`, `JSON inválido (${e.message})`);
      return null;
    }
  }).filter(Boolean);

const flags = readJson('flags', (f) => f.endsWith('.json'));
const rms = readJson('rm', (f) => /^RM-.*\.json$/.test(f));

for (const { file, data: d } of flags) {
  if (!/^[a-z][a-z0-9_]*$/.test(d.key || '')) err(file, 'key deve ser snake_case');
  if (file !== `flags/${d.key}.json`) err(file, 'nome do arquivo deve ser <key>.json');
  if (!d.owner) err(file, 'owner obrigatório');
  if (!CRIT.includes(d.criticality)) err(file, `criticality deve ser ${CRIT.join('|')}`);
  if (!TYPES.includes(d.valueType)) err(file, `valueType deve ser ${TYPES.join('|')}`);
  for (const env of ENVS) {
    const e = (d.environments || {})[env];
    if (!e) { err(file, `environments.${env} ausente`); continue; }
    if (typeof e.enabled !== 'boolean') err(file, `${env}.enabled deve ser boolean`);
    if (e.rolloutPercent !== undefined && !(e.rolloutPercent >= 0 && e.rolloutPercent <= 100)) {
      err(file, `${env}.rolloutPercent deve estar entre 0 e 100`);
    }
  }
}

if (prod) {
  const flagKeys = flags.map((f) => f.data.key);
  for (const key of flagKeys.filter((k) => flags.find((f) => f.data.key === k).data.environments.prod.enabled)) {
    const rm = rms.find((r) => (r.data.flags || []).includes(key) && (r.data.targetEnvironments || []).includes('prod'));
    if (!rm) { err(`flags/${key}.json`, 'PROD exige um arquivo de RM (rm/RM-*.json) cobrindo esta flag'); continue; }
    const d = rm.data;
    if (!d.rollback) err(rm.file, 'rollback obrigatório');
    if (!d.prodSchedule || Number.isNaN(Date.parse(d.prodSchedule))) err(rm.file, 'prodSchedule (ISO 8601) obrigatório');
    if (!Array.isArray(d.rolloutPlan) || !d.rolloutPlan.length) err(rm.file, 'rolloutPlan obrigatório');
    else {
      const p = d.rolloutPlan;
      if (p.some((s, i) => !(s.percent > 0 && s.percent <= 100) || !(s.monitorMinutes >= 0) || (i && s.percent <= p[i - 1].percent))) {
        err(rm.file, 'rolloutPlan deve ter percent crescente (1-100) e monitorMinutes >= 0');
      }
      if (p[p.length - 1].percent !== 100 || p[p.length - 1].monitorMinutes !== 0) err(rm.file, 'último estágio do rolloutPlan deve ser 100% com monitorMinutes 0');
      const flag = flags.find((f) => f.data.key === key).data;
      if (['alta', 'critica'].includes(flag.criticality) && p.length < 2) err(rm.file, `flag ${flag.criticality} exige rollout progressivo (mais de um estágio)`);
    }
    for (const who of ['team', 'platform']) {
      const a = (d.approvals || {})[who];
      if (!a || !a.name || !a.date) err(rm.file, `aprovação "${who}" ausente`);
    }
    if (d.approvals && d.approvals.team && d.approvals.platform && d.approvals.team.name && d.approvals.team.name === d.approvals.platform.name) {
      err(rm.file, 'aprovação da equipe e da plataforma devem ser de pessoas diferentes');
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${flags.length} flag(s) e ${rms.length} RM(s) válidos${prod ? ' (regras de PROD)' : ''}`);
