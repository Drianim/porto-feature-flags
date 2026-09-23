#!/usr/bin/env node
// Publica as flags no Firebase Remote Config de um ambiente.
// Uso: node scripts/deploy.js <dev|hml|prod> [--dry-run] [--now <ISO>]
// Env (ver config/environments.json): FIREBASE_PROJECT_<ENV> e FIREBASE_SA_KEY_<ENV> (JSON do service account em base64).
// PROD é "time-gated": flags que liberam algo só sobem quando prodSchedule do RM chegou, seguindo o rolloutPlan.
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const { currentStage } = require('./lib/rollout');
const { kindOf, rules, isActive } = require('./lib/flags');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const envs = environments();
if (!envs[env]) {
  console.error(`Uso: node scripts/deploy.js <${Object.keys(envs).join('|')}> [--dry-run] [--now <ISO>]`);
  process.exit(1);
}
const cfgEnv = envs[env];
const now = args.now ? new Date(args.now) : new Date();

function build(flags, rms) {
  const items = [];
  const conditions = [];
  const skipped = [];
  for (const flag of flags) {
    const toggle = kindOf(flag.key) === 'toggle';
    const { defaultValue, overrides } = rules(flag, env);
    let stagePercent;
    if (cfgEnv.timeGated && isActive(flag, env)) {
      const rm = rms.find((r) => (r.flags || []).includes(flag.key) && (r.targetEnvironments || []).includes(env));
      const stage = rm && currentStage(rm, now);
      if (!stage) { skipped.push(flag.key); continue; }
      stagePercent = stage.percent;
    }
    const param = {
      description: flag.description,
      valueType: flag.valueType || 'STRING',
      defaultValue: { value: defaultValue },
      conditionalValues: {},
    };
    for (const [platform, o] of Object.entries(overrides)) {
      let pct = o.rolloutPercent ?? 100;
      if (toggle && stagePercent !== undefined) pct = Math.min(pct, stagePercent);
      if (pct <= 0) continue;
      const name = `${flag.key}_${platform}`;
      conditions.push({ name, expression: `device.os == '${platform}'${pct < 100 ? ` && percent <= ${pct}` : ''}` });
      param.conditionalValues[name] = { value: o.value };
    }
    items.push({ key: flag.key, group: flag.group, param });
  }
  return { items, conditions, skipped };
}

function apply(template, { items, conditions }) {
  const owned = new Set(items.map((i) => i.key));
  const isOwnedCond = (n) => [...owned].some((k) => n === `${k}_ios` || n === `${k}_android` || n === `${k}_rollout`);
  template.conditions = [...template.conditions.filter((c) => !isOwnedCond(c.name)), ...conditions];
  template.parameterGroups = template.parameterGroups || {};
  for (const key of owned) {
    delete template.parameters[key];
    for (const g of Object.values(template.parameterGroups)) delete (g.parameters || {})[key];
  }
  for (const { key, group, param } of items) {
    if (group) {
      template.parameterGroups[group] = template.parameterGroups[group] || { description: '', parameters: {} };
      template.parameterGroups[group].parameters = { ...template.parameterGroups[group].parameters, [key]: param };
    } else {
      template.parameters[key] = param;
    }
  }
  return template;
}

async function main() {
  const plan = build(loadFlags(), loadRms());
  const projectId = process.env[cfgEnv.projectVar];
  if (args['dry-run']) {
    console.log(JSON.stringify({ env, projectId: projectId || `(${cfgEnv.projectVar} não definido)`, now: now.toISOString(), ...plan }, null, 2));
    return;
  }
  if (!projectId) throw new Error(`${cfgEnv.projectVar} não definido`);
  const keyB64 = process.env[cfgEnv.keyVar];
  if (!keyB64) throw new Error(`${cfgEnv.keyVar} não definido`);

  const admin = require('firebase-admin');
  const credential = admin.credential.cert(JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')));
  admin.initializeApp({ credential, projectId });
  const rc = admin.remoteConfig();
  const template = apply(await rc.getTemplate(), plan);
  await rc.validateTemplate(template);
  const published = await rc.publishTemplate(template);
  console.log(`✓ ${plan.items.length} chave(s) publicadas em ${env} (versão ${published.version.versionNumber})${plan.skipped.length ? `; aguardando horário: ${plan.skipped.join(', ')}` : ''}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
