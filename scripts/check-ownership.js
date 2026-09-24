#!/usr/bin/env node
// Permissão por equipe: só a equipe dona altera as FFs dela; a plataforma altera qualquer FF e é a única que transfere
// FF entre equipes. Vale para feature/*, update/*, remove/* e release/*.
// Uso: node scripts/check-ownership.js <branch-de-origem> [<base-ref>=origin/main]
// A equipe de cada FF e a config/teams.json são lidas no ponto de partida do PR (merge-base), nunca do PR: assim o PR
// não se autoriza mudando a própria lista de membros. Autores = e-mails dos commits do PR (git log --no-merges base..HEAD).
const { execFileSync } = require('child_process');
const { loadTeamsConfig } = require('./lib/common');
const { parseNameStatus } = require('./lib/new-flags');
const { changedKeys, checkOwnership } = require('./lib/ownership');
const { branchKind } = require('./lib/preflight');

const [branch, base = 'origin/main'] = process.argv.slice(2);
if (!branch) { console.error('Uso: node scripts/check-ownership.js <branch> [base-ref]'); process.exit(1); }
if (!branchKind(branch)) { console.log(`Branch ${branch}: a regra de equipe dona não se aplica (só feature/, update/, remove/, release/).`); process.exit(0); }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

const mb = git('merge-base', base, 'HEAD').trim();
const nameStatus = parseNameStatus(git('diff', '--name-status', '--no-renames', `${base}...HEAD`));
const showJson = (ref, file) => json(tryGit('show', `${ref}:${file}`) || 'null');
// `owner` é o nome antigo de `team`: a migração não conta como troca de equipe.
const teamAt = (ref, key) => { const f = showJson(ref, `flags/${key}.json`); return f ? (f.team || f.owner || null) : null; };
const rmFlagsOf = (file) => [...new Set([mb, 'HEAD'].flatMap((ref) => (showJson(ref, file) || {}).flags || []))];

const problems = [];
if (nameStatus.some((c) => c.file === 'config/teams.json')) {
  problems.push('config/teams.json: equipes e membros só mudam por uma chore/* (só admin mescla), não numa branch de FF');
}
const config = showJson(mb, 'config/teams.json') || loadTeamsConfig();
let authors = [...new Set(git('log', '--no-merges', '--format=%ae', `${base}..HEAD`).split('\n').map((s) => s.trim()).filter(Boolean))];
if (!authors.length) authors = [git('log', '-1', '--format=%ae', 'HEAD').trim()].filter(Boolean);

const keys = changedKeys(nameStatus, rmFlagsOf);
const r = checkOwnership({ authors, changes: keys.map((key) => ({ key, before: teamAt(mb, key), after: teamAt('HEAD', key) })), config });
problems.push(...r.problems);
if (problems.length) {
  console.error(`✗ ${branch}: permissão por equipe:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ ${branch}: ${keys.length} FF(s) tocada(s), autor(es) autorizado(s) (${authors.join(', ')})`);
