#!/usr/bin/env node
// Só admin pode mesclar chore/*. Uso: node scripts/check-merger.js <branch-de-origem> [commit-de-merge]
// Lê o e-mail de quem fez o merge no commit (padrão HEAD) e "admins"/"mergeBot" de config/approvers.json.
const { spawnSync } = require('child_process');
const { root, readJson } = require('./lib/common');
const { evaluate } = require('./lib/merger');

const [source, commit = 'HEAD'] = process.argv.slice(2);
if (!source) { console.error('Uso: node scripts/check-merger.js <branch-de-origem> [commit]'); process.exit(1); }
const mergerEmail = spawnSync('git', ['log', '-1', '--format=%ce', commit], { cwd: root, encoding: 'utf8' }).stdout.trim();
const approvers = readJson('config', 'approvers.json');
const r = evaluate({ source, mergerEmail, admins: approvers.admins, mergeBot: approvers.mergeBot });
if (!r.ok) { r.problems.forEach((p) => console.error(`  ✗ ${p}`)); console.error('✗ merge de chore/* por quem não é admin'); process.exit(1); }
console.log(source.startsWith('chore/') ? `✓ merge de ${source} feito por admin (${mergerEmail})` : `${source}: regra de admin só vale para chore/*`);
