#!/usr/bin/env node
// Valida flags/*.json e rm/RM-*.json. Uso: node scripts/validate.js [--prod]
const fs = require('fs');
const path = require('path');
const { PLATFORMS, KEY_RE, kindOf, isActive, valueTypeOf, targetingErrors, platformsOf, teamErrors, teamsErrors } = require('./lib/flags');
const { mergeFlag, loadTeamsConfig } = require('./lib/common');
const { horarioPermitido } = require('./lib/rollout');

const root = path.join(__dirname, '..');
const prod = process.argv.includes('--prod');
const CRIT = ['baixa', 'media', 'critica'];
const ENVS = ['nonprod', 'prod'];
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

const metas = readJson('flags', (f) => f.endsWith('.json'));
const flags = [];
for (const m of metas) {
  const ok = KEY_RE.test(m.data.key || '');
  try { flags.push({ file: m.file, data: ok ? mergeFlag(m.data) : m.data }); } catch (e) { err(m.file, `env inválido (${e.message})`); }
}
// env/*: arquivos órfãos e chaves no lugar errado
const ENV_DIRS = { nonprod: ['nonprod'], prod: ['prod'] };
for (const [dir, allowed] of Object.entries(ENV_DIRS)) {
  if (!fs.existsSync(path.join(root, 'env', dir))) continue;
  for (const f of fs.readdirSync(path.join(root, 'env', dir)).filter((x) => x.endsWith('.json'))) {
    const key = f.replace(/\.json$/, '');
    if (!metas.some((m) => m.data.key === key)) err(`env/${dir}/${f}`, `sem definição em flags/${key}.json`);
    try {
      for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'env', dir, f), 'utf8')))) {
        if (!allowed.includes(k)) err(`env/${dir}/${f}`, `só aceita ${allowed.join('/')} (encontrado "${k}")`);
      }
    } catch (e) { err(`env/${dir}/${f}`, `JSON inválido (${e.message})`); }
  }
}
const rms = readJson('rm', (f) => /^RM-.*\.json$/.test(f));
try { require('./lib/merger').approversErrors(JSON.parse(fs.readFileSync(path.join(root, 'config', 'approvers.json'), 'utf8'))).forEach((m) => errors.push(m)); } catch (e) { err('config/approvers.json', `JSON inválido (${e.message})`); }
let teams = [];
try { const cfg = loadTeamsConfig(); teams = Object.keys((cfg && cfg.teams) || {}); teamsErrors(cfg).forEach((m) => errors.push(m)); } catch (e) { err('config/teams.json', `JSON inválido (${e.message})`); }
const seen = new Set();

for (const { file, data: d } of flags) {
  if (!KEY_RE.test(d.key || '')) { err(file, 'key deve começar com ft_ (toggle) ou rc_ (config) e usar só letras, números e _'); continue; }
  if (seen.has(d.key)) err(file, 'key duplicada');
  seen.add(d.key);
  const toggle = kindOf(d.key) === 'toggle';
  if (file !== `flags/${d.key}.json`) err(file, 'nome do arquivo deve ser <key>.json');
  if (!d.description) err(file, 'description obrigatória');
  teamErrors(d, teams).forEach((m) => err(file, m));
  const targeting = targetingErrors(d);
  targeting.forEach((m) => err(file, m));
  if (d.group !== undefined && (typeof d.group !== 'string' || !d.group)) err(file, 'group deve ser texto');
  if (!CRIT.includes(d.criticality)) err(file, `criticality deve ser ${CRIT.join('|')}`);
  if (d.valueType !== undefined) {
    const derived = valueTypeOf(d);
    if (d.valueType !== derived) console.warn(`! ${file}: valueType "${d.valueType}" é ignorado: o tipo vem dos valores (true/false = BOOLEAN, senão STRING) e aqui seria ${derived}. Pode remover o campo.`);
  }
  const okValue = (v) => (toggle ? v === 'true' || v === 'false' : typeof v === 'string' && v.length > 0);
  for (const env of ENVS) {
    const e = (d.environments || {})[env];
    if (!e) { if (env !== 'prod') err(file, `env/nonprod/${d.key}.json: ${env} ausente`); continue; }
    if (!okValue(e.default)) err(file, `${env}.default ${toggle ? 'deve ser "true" ou "false"' : 'deve ser um texto não vazio'}`);
    for (const p of PLATFORMS) {
      const o = e[p];
      if (o === undefined) continue;
      if (!okValue(o.value)) err(file, `${env}.${p}.value inválido`);
      if (o.rolloutPercent !== undefined && !(o.rolloutPercent >= 0 && o.rolloutPercent <= 100)) err(file, `${env}.${p}.rolloutPercent deve estar entre 0 e 100`);
    }
    for (const k of Object.keys(e)) if (k !== 'default' && !PLATFORMS.includes(k)) err(file, `${env}.${k} desconhecido (use default, ios, android)`);
    if (!targeting.length) {
      for (const p of PLATFORMS) if (e[p] && !platformsOf(d).includes(p)) err(file, `${env}.${p} definido, mas a FF é só para ${d.platforms}: ajuste "platforms" ou remova o bloco`);
    }
  }
}

if (prod) {
  for (const { data: flag } of flags.filter((f) => KEY_RE.test(f.data.key || '') && isActive(f.data, 'prod'))) {
    const key = flag.key;
    const rm = rms.find((r) => (r.data.flags || []).includes(key) && (r.data.targetEnvironments || []).includes('prod'));
    if (!rm) { err(`flags/${key}.json`, 'PROD exige um arquivo de RM (rm/RM-*.json) cobrindo esta flag'); continue; }
    const d = rm.data;
    if (!d.rollback) err(rm.file, 'rollback obrigatório');
    if (!d.prodSchedule || Number.isNaN(Date.parse(d.prodSchedule))) err(rm.file, 'prodSchedule (ISO 8601) obrigatório');
    else {
      const janela = horarioPermitido(d.criticality, d.prodSchedule);
      if (!janela.ok) err(rm.file, janela.motivo);
    }
    if (!Array.isArray(d.rolloutPlan) || !d.rolloutPlan.length) err(rm.file, 'rolloutPlan obrigatório');
    else {
      const p = d.rolloutPlan;
      if (p.some((s, i) => !(s.percent > 0 && s.percent <= 100) || !(s.monitorMinutes >= 0) || (i && s.percent <= p[i - 1].percent))) {
        err(rm.file, 'rolloutPlan deve ter percent crescente (1-100) e monitorMinutes >= 0');
      }
      if (p[p.length - 1].percent !== 100 || p[p.length - 1].monitorMinutes !== 0) err(rm.file, 'último estágio do rolloutPlan deve ser 100% com monitorMinutes 0');
      if (flag.criticality === 'critica' && p.length < 2) err(rm.file, `flag ${flag.criticality} exige rollout progressivo (mais de um estágio)`);
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
