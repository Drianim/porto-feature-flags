#!/usr/bin/env node
// Valida localmente, ANTES de abrir o PR, o que a pipeline do PR validaria: formato/RM/catálogo, escopo da branch,
// FF nova x update x remove (nome único), permissão por equipe e, em release/*, as regras de PROD.
// Uso: node scripts/preflight.js [--push] [--branch <nome>]
//   --push  se tudo passar, empurra a branch e imprime o link de um clique para abrir o PR (npm run pr)
// A consulta ao Firebase (nome duplicado) usa FIREBASE_SA_KEY_NONPROD; sem ela é pulada e a pipeline do PR confere.
const { spawnSync } = require('child_process');
const { parseArgs, root } = require('./lib/common');
const { branchKind, prLink } = require('./lib/preflight');

const args = parseArgs(process.argv.slice(2));
const sh = (cmd, a) => spawnSync(cmd, a, { cwd: root, encoding: 'utf8' });
const branch = args.branch || sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
const kind = branchKind(branch);
if (!kind) { console.log(`Branch ${branch}: o preflight vale para feature/, update/, remove/ e release/.`); process.exit(0); }

if (sh('git', ['fetch', '-q', 'origin', 'main']).status !== 0) console.log('! não consegui atualizar origin/main; usando a cópia local.');
const base = 'origin/main';
if (sh('git', ['status', '--porcelain']).stdout.trim()) console.log('! há mudanças não commitadas: o PR só leva o que estiver commitado.');

const hasKey = Boolean(process.env.FIREBASE_SA_KEY_NONPROD);
const checks = [
  ['Formato das FFs, RM e catálogo', ['scripts/validate.js']],
  ['Catálogo em dia', ['scripts/catalog.js', '--check']],
  ['Escopo da branch', ['scripts/check-scope.js', branch, base]],
  ['Permissão por equipe (só a equipe dona ou a plataforma altera a FF)', ['scripts/check-ownership.js', branch, base]],
  ['FF nova x update x remove (nome único)', ['scripts/check-new-flags.js', branch, base, ...(hasKey ? [] : ['--skip-remote'])]],
];
if (kind === 'release') checks.push(['Regras de PROD (RM e dupla aprovação)', ['scripts/validate.js', '--prod']]);

console.log(`Preflight de ${branch} (${kind}/*) contra ${base}\n`);
let failed = 0;
for (const [name, a] of checks) {
  const r = sh('node', a);
  if (r.status === 0) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`); (r.stderr || r.stdout).split('\n').filter(Boolean).forEach((l) => console.log(`      ${l}`)); }
}
if (!hasKey) console.log('\n  ! sem FIREBASE_SA_KEY_NONPROD: a consulta ao Firebase (nome já existente lá) foi pulada; a pipeline do PR faz essa checagem.');

if (failed) { console.log(`\n✗ ${failed} checagem(ns) falharam: corrija antes de abrir o PR.`); process.exit(1); }
console.log('\n✓ Tudo certo para abrir o PR.');

if (args.push) {
  const push = spawnSync('git', ['push', '-u', 'origin', branch], { cwd: root, stdio: 'inherit' });
  if (push.status !== 0) { console.log('✗ o push falhou.'); process.exit(1); }
  const link = prLink(sh('git', ['remote', 'get-url', 'origin']).stdout.trim(), branch);
  console.log(link ? `\nAbra o PR com um clique: ${link}` : '\nBranch enviada. Abra o PR no Bitbucket.');
}
