#!/usr/bin/env node
// Publica as flags no Firebase Remote Config de um ambiente.
// Uso: node scripts/deploy.js <nonprod|prod> [--dry-run] [--now <ISO>]
// Env (ver config/environments.json): FIREBASE_SA_KEY_<ENV> (JSON do service account em base64, obrigatório)
// e FIREBASE_PROJECT_<ENV> (opcional: sobrescreve o projectId padrão do config).
// PROD é "time-gated": flags que liberam algo só sobem quando prodSchedule do RM chegou, seguindo o rolloutPlan.
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const { build, apply, connect } = require('./lib/remote-config');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const envs = environments();
if (!envs[env]) {
  console.error(`Uso: node scripts/deploy.js <${Object.keys(envs).join('|')}> [--dry-run] [--now <ISO>]`);
  process.exit(1);
}
const cfgEnv = envs[env];
const now = args.now ? new Date(args.now) : new Date();

async function main() {
  const plan = build(loadFlags(), loadRms(), env, cfgEnv, now);
  if (args['dry-run']) {
    const projectId = process.env[cfgEnv.projectVar] || cfgEnv.projectId;
    console.log(JSON.stringify({ env, projectId: projectId || `(${cfgEnv.projectVar} não definido)`, now: now.toISOString(), ...plan }, null, 2));
    return;
  }
  const { rc } = await connect(cfgEnv);
  const template = apply(await rc.getTemplate(), plan);
  await rc.validateTemplate(template);
  const published = await rc.publishTemplate(template);
  console.log(`✓ ${plan.items.length} chave(s) publicadas em ${env} (versão ${published.version.versionNumber})${plan.skipped.length ? `; aguardando horário: ${plan.skipped.join(', ')}` : ''}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
