#!/usr/bin/env node
// Publica as flags no Firebase Remote Config de um ambiente.
// Uso: node scripts/deploy.js <nonprod|prod> [--dry-run | --validate] [--now <ISO>]
//   --dry-run   só monta e imprime o plano (não fala com o Firebase)
//   --validate  monta o plano e o valida NO Firebase (validateTemplate), sem publicar; usado no PR (spec 0008)
// Env (ver config/environments.json): FIREBASE_SA_KEY_<ENV> (JSON do service account em base64, obrigatório)
// e FIREBASE_PROJECT_<ENV> (opcional: sobrescreve o projectId padrão do config).
// PROD é "time-gated": flags que liberam algo só sobem quando prodSchedule do RM chegou, seguindo o rolloutPlan.
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const { build, apply, connect } = require('./lib/remote-config');
const { validateRemote } = require('./lib/validate-remote');

// deps é injetável para teste: { loadFlags, loadRms, environments, connect, now, stdout, stderr }
async function run(argv, deps = {}) {
  const d = { loadFlags, loadRms, environments, connect, now: () => new Date(), stdout: console.log, stderr: console.error, ...deps };
  const args = parseArgs(argv);
  const env = args._[0];
  const envs = d.environments();
  if (!envs[env]) {
    d.stderr(`Uso: node scripts/deploy.js <${Object.keys(envs).join('|')}> [--dry-run | --validate] [--now <ISO>]`);
    return 1;
  }
  const cfgEnv = envs[env];
  const now = args.now ? new Date(args.now) : d.now();
  try {
    const plan = build(d.loadFlags(), d.loadRms(), env, cfgEnv, now);
    if (args['dry-run']) {
      const projectId = process.env[cfgEnv.projectVar] || cfgEnv.projectId;
      d.stdout(JSON.stringify({ env, projectId: projectId || `(${cfgEnv.projectVar} não definido)`, now: now.toISOString(), ...plan }, null, 2));
      return 0;
    }
    const { rc, projectId } = await d.connect(cfgEnv);
    if (args.validate) {
      const r = await validateRemote(rc, plan);
      if (r.ok) {
        d.stdout(`✓ template aceito pelo Firebase (${projectId}): ${plan.items.length} chave(s), ${plan.conditions.length} condição(ões); nada foi publicado`);
        return 0;
      }
      d.stderr(`✗ o Firebase (${projectId}) recusou o template: ${r.message}`);
      for (const c of r.culprits) d.stderr(`  - condição "${c.name}": ${c.expression}\n    ${c.message}`);
      return 1;
    }
    const template = apply(await rc.getTemplate(), plan);
    await rc.validateTemplate(template);
    const published = await rc.publishTemplate(template);
    d.stdout(`✓ ${plan.items.length} chave(s) publicadas em ${env} (versão ${published.version.versionNumber})${plan.skipped.length ? `; aguardando horário: ${plan.skipped.join(', ')}` : ''}`);
    return 0;
  } catch (e) {
    d.stderr(`✗ ${e.message}`);
    return 1;
  }
}

if (require.main === module) run(process.argv.slice(2)).then((code) => process.exit(code));
module.exports = { run };
