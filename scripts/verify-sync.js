#!/usr/bin/env node
// Garante que o que está na branch atual (main na pipeline) está 100% no Remote Config do ambiente.
// Uso: node scripts/verify-sync.js <nonprod|prod> [--fix] [--strict] [--now <ISO>]
//   (sem flags)  só compara; sai com código 1 se houver divergência
//   --fix        se houver divergência, publica o que está no repositório e confere de novo
//   --strict     chaves que existem no Firebase e não estão no repositório também reprovam
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const { build, apply, diff, connect } = require('./lib/remote-config');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const envs = environments();
if (!envs[env]) {
  console.error(`Uso: node scripts/verify-sync.js <${Object.keys(envs).join('|')}> [--fix] [--strict] [--now <ISO>]`);
  process.exit(1);
}
const cfgEnv = envs[env];
const now = args.now ? new Date(args.now) : new Date();

const report = (r, strict) => {
  r.problems.forEach((p) => console.error(`  ✗ ${p}`));
  r.extras.forEach((k) => console[strict ? 'error' : 'warn'](`  ${strict ? '✗' : '!'} ${k}: existe no Firebase e não está no repositório`));
  return r.problems.length + (strict ? r.extras.length : 0);
};

async function main() {
  const plan = build(loadFlags(), loadRms(), env, cfgEnv, now);
  const { rc, projectId } = await connect(cfgEnv);
  let r = diff(await rc.getTemplate(), plan);
  let bad = report(r, args.strict);

  if (bad && args.fix) {
    console.log(`Divergência em ${env}: publicando o que está no repositório...`);
    const template = apply(await rc.getTemplate(), plan);
    await rc.validateTemplate(template);
    const published = await rc.publishTemplate(template);
    console.log(`  publicado (versão ${published.version.versionNumber}). Conferindo de novo...`);
    r = diff(await rc.getTemplate(), plan);
    bad = report(r, args.strict);
  }
  if (bad) {
    console.error(`✗ ${env} (${projectId}) NÃO está sincronizado com o repositório (${bad} divergência(s))`);
    process.exit(1);
  }
  console.log(`✓ ${env} (${projectId}) sincronizado: ${plan.items.length} chave(s) idênticas ao repositório${plan.skipped.length ? `; aguardando horário: ${plan.skipped.join(', ')}` : ''}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
