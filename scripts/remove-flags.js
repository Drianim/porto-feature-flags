#!/usr/bin/env node
// Remove FFs do Remote Config (só ambientes não time-gated, ou seja, NÃO PROD).
// Uso: node scripts/remove-flags.js <env> (--base <ref> | --keys a,b) [--dry-run]
//   --base <ref>  remove as FFs cujo flags/<key>.json foi APAGADO entre <ref> e HEAD (ex.: HEAD^1 num commit de merge)
//   --keys a,b    lista explícita (a FF não pode mais existir em flags/)
// Segurança: recusa chave que ainda existe em flags/ e só apaga o que foi removido do repositório.
// Env: FIREBASE_SA_KEY_<ENV>.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { root, environments, parseArgs } = require('./lib/common');
const { parseNameStatus, classify } = require('./lib/new-flags');
const { connect, removeKeys, findRemote } = require('./lib/remote-config');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const envs = environments();
if (!envs[env] || (!args.base && !args.keys)) {
  console.error(`Uso: node scripts/remove-flags.js <${Object.keys(envs).join('|')}> (--base <ref> | --keys a,b) [--dry-run]`);
  process.exit(1);
}
if (envs[env].timeGated) {
  console.error(`✗ Remoção em ${env} ainda não é suportada (só ambientes NÃO PROD).`);
  process.exit(1);
}

const keys = args.keys
  ? String(args.keys).split(',').map((k) => k.trim()).filter(Boolean)
  : classify(parseNameStatus(execSync(`git diff --name-status --no-renames ${args.base}...HEAD`, { encoding: 'utf8', cwd: root }))).removedKeys;

const stillDefined = keys.filter((k) => fs.existsSync(path.join(root, 'flags', `${k}.json`)));
if (stillDefined.length) {
  console.error(`✗ Recusado: ainda existe definição em flags/ para ${stillDefined.join(', ')}. Remova a FF do repositório primeiro.`);
  process.exit(1);
}

(async () => {
  if (!keys.length) { console.log('Nenhuma FF removida neste merge: nada a fazer.'); return; }
  const { rc, projectId } = await connect(envs[env]);
  const template = await rc.getTemplate();
  const present = keys.filter((k) => findRemote(template, k));
  const absent = keys.filter((k) => !present.includes(k));
  if (absent.length) console.log(`Já ausentes no Firebase: ${absent.join(', ')}`);
  if (!present.length) { console.log(`✓ ${env} (${projectId}): nada a remover.`); return; }
  if (args['dry-run']) { console.log(`(dry-run) removeria de ${env} (${projectId}): ${present.join(', ')}`); return; }
  removeKeys(template, present);
  await rc.validateTemplate(template);
  const published = await rc.publishTemplate(template);
  const after = await rc.getTemplate();
  const left = present.filter((k) => findRemote(after, k));
  if (left.length) throw new Error(`não foi possível remover: ${left.join(', ')}`);
  console.log(`✓ ${present.length} FF(s) removidas de ${env} (${projectId}), versão ${published.version.versionNumber}: ${present.join(', ')}`);
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
