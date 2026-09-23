#!/usr/bin/env node
// Publica as flags no Firebase Remote Config de um ambiente.
// Uso: node scripts/deploy.js <dev|hml|prod> [--dry-run] [--now <ISO>]
// Env (ver config/environments.json): FIREBASE_PROJECT_<ENV> e FIREBASE_SA_KEY_<ENV> (JSON do service account em base64).
// PROD é "time-gated": só aplica a flag quando prodSchedule do RM chegou e segue o rolloutPlan.
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const { effectivePercent } = require('./lib/rollout');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const envs = environments();
if (!envs[env]) {
  console.error(`Uso: node scripts/deploy.js <${Object.keys(envs).join('|')}> [--dry-run] [--now <ISO>]`);
  process.exit(1);
}
const cfgEnv = envs[env];
const now = args.now ? new Date(args.now) : new Date();

function buildParameters(flags, rms) {
  const parameters = {};
  const conditions = [];
  const skipped = [];
  for (const flag of flags) {
    const cfg = flag.environments[env];
    let percent;
    if (cfgEnv.timeGated) {
      const rm = rms.find((r) => (r.flags || []).includes(flag.key) && (r.targetEnvironments || []).includes(env));
      percent = effectivePercent(cfg, rm, now);
      if (percent === null) { skipped.push(flag.key); continue; }
    } else {
      percent = cfg.enabled ? (cfg.rolloutPercent ?? 100) : 0;
    }
    const param = {
      description: `${flag.description} [owner: ${flag.owner}, criticidade: ${flag.criticality}]`,
      valueType: flag.valueType,
      defaultValue: { value: String(percent >= 100) },
    };
    if (percent > 0 && percent < 100) {
      const name = `${flag.key}_rollout`;
      conditions.push({ name, expression: `percent <= ${percent}` });
      param.conditionalValues = { [name]: { value: 'true' } };
    }
    parameters[flag.key] = param;
  }
  return { parameters, conditions, skipped };
}

async function main() {
  const { parameters, conditions, skipped } = buildParameters(loadFlags(), loadRms());
  const projectId = process.env[cfgEnv.projectVar];
  if (args['dry-run']) {
    console.log(JSON.stringify({ env, projectId: projectId || `(${cfgEnv.projectVar} não definido)`, now: now.toISOString(), parameters, conditions, skipped }, null, 2));
    return;
  }
  if (!projectId) throw new Error(`${cfgEnv.projectVar} não definido`);
  const keyB64 = process.env[cfgEnv.keyVar];
  if (!keyB64) throw new Error(`${cfgEnv.keyVar} não definido`);

  const admin = require('firebase-admin');
  const credential = admin.credential.cert(JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')));
  admin.initializeApp({ credential, projectId });
  const rc = admin.remoteConfig();
  const template = await rc.getTemplate();
  const owned = new Set(Object.keys(parameters));
  template.parameters = { ...template.parameters, ...parameters };
  template.conditions = [
    ...template.conditions.filter((c) => !(c.name.endsWith('_rollout') && owned.has(c.name.replace(/_rollout$/, '')))),
    ...conditions,
  ];
  await rc.validateTemplate(template);
  const published = await rc.publishTemplate(template);
  console.log(`✓ ${owned.size} flag(s) publicadas em ${env} (versão ${published.version.versionNumber})${skipped.length ? `; aguardando horário: ${skipped.join(', ')}` : ''}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
