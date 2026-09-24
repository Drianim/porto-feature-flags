// Lógica compartilhada entre deploy.js e verify-sync.js: monta o que deve existir no Remote Config,
// aplica no template e compara com o que existe de fato no Firebase.
const { currentStage } = require('./rollout');
const { kindOf, rules, isActive, valueTypeOf, platformsOf, minVersionFor, targetingErrors } = require('./flags');

// flags + RMs -> { items, conditions, skipped } (o "estado desejado" do ambiente)
function build(flags, rms, env, cfgEnv, now = new Date()) {
  const items = [];
  const conditions = [];
  const skipped = [];
  for (const flag of flags) {
    if (!flag.environments[env]) { skipped.push(`${flag.key} (sem env/${env === 'prod' ? 'prod' : 'nonprod'})`); continue; }
    const toggle = kindOf(flag.key) === 'toggle';
    const { defaultValue, overrides } = rules(flag, env);
    let stagePercent;
    if (cfgEnv.timeGated && isActive(flag, env)) {
      const rm = rms.find((r) => (r.flags || []).includes(flag.key) && (r.targetEnvironments || []).includes(env));
      const stage = rm && currentStage(rm, now);
      if (!stage) { skipped.push(flag.key); continue; }
      stagePercent = stage.percent;
    }
    const bad = targetingErrors(flag);
    if (!flag.team) bad.push('team obrigatório (equipe dona da FF)');
    if (bad.length) throw new Error(`${flag.key}: ${bad.join('; ')}`);
    // Toggle: padrão explícito "false" (o override "true" só vale nas plataformas/versões da FF).
    // Config (rc_): sem valor padrão (usa o do app); o valor só é servido nas plataformas da FF a partir da versão mínima.
    const param = {
      // A equipe vai no prefixo da descrição: o Remote Config não tem rótulo por parâmetro e assim ela aparece no console.
      description: `[${flag.team}] ${flag.description}`,
      valueType: valueTypeOf(flag),
      defaultValue: toggle ? { value: defaultValue } : { useInAppDefault: true },
      conditionalValues: {},
    };
    for (const platform of platformsOf(flag)) {
      const o = overrides[platform];
      // Toda condição da FF exige plataforma E versão mínima: abaixo dela o código não existe e a FF não liga.
      const target = `device.os == '${platform}' && app.version >= '${minVersionFor(flag, platform)}'`;
      let coversAll = false;
      if (o) {
        let pct = o.rolloutPercent ?? 100;
        if (toggle && stagePercent !== undefined) pct = Math.min(pct, stagePercent);
        if (pct > 0) {
          const name = `${flag.key}_${platform}`;
          // Semente = nome da FF: cada FF sorteia o seu próprio grupo de usuários (sem semente, todas as FFs em % pegariam os mesmos)
          // e quem entra em 5% continua dentro quando o rollout sobe para 25%.
          conditions.push({ name, expression: `${target}${pct < 100 ? ` && percent('${flag.key}') <= ${pct}` : ''}` });
          param.conditionalValues[name] = { value: o.value };
          coversAll = pct >= 100;
        }
      }
      // Config: quem está na plataforma e na versão mas fora do override recebe o valor padrão (condição depois do override).
      if (!toggle && !coversAll) {
        const name = `${flag.key}_${platform}_base`;
        conditions.push({ name, expression: target });
        param.conditionalValues[name] = { value: defaultValue };
      }
    }
    items.push({ key: flag.key, group: flag.group, param });
  }
  return { items, conditions, skipped };
}

const OWNED_SUFFIXES = ['_ios', '_android', '_ios_base', '_android_base', '_rollout'];
const isOwnedCondition = (name, keys) => [...keys].some((k) => OWNED_SUFFIXES.some((suffix) => name === `${k}${suffix}`));

// Aplica o estado desejado no template (mexe só nas chaves do repositório).
function apply(template, { items, conditions }) {
  const owned = new Set(items.map((i) => i.key));
  template.conditions = [...(template.conditions || []).filter((c) => !isOwnedCondition(c.name, owned)), ...conditions];
  template.parameters = template.parameters || {};
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

// Remove chaves do template: parâmetros, entradas em grupos e condições próprias (<key>_ios/_android/_*_base/_rollout).
// Grupos que ficam vazios por causa da remoção também saem.
function removeKeys(template, keys) {
  const ks = new Set(keys);
  const touched = new Set();
  for (const k of ks) {
    if (template.parameters) delete template.parameters[k];
    for (const [g, v] of Object.entries(template.parameterGroups || {})) {
      if (v.parameters && k in v.parameters) { delete v.parameters[k]; touched.add(g); }
    }
  }
  for (const g of touched) {
    if (!Object.keys(template.parameterGroups[g].parameters || {}).length) delete template.parameterGroups[g];
  }
  template.conditions = (template.conditions || []).filter((c) => !isOwnedCondition(c.name, ks));
  return template;
}

function findRemote(template, key) {
  if ((template.parameters || {})[key]) return { param: template.parameters[key], group: null };
  for (const [g, v] of Object.entries(template.parameterGroups || {})) {
    if ((v.parameters || {})[key]) return { param: v.parameters[key], group: g };
  }
  return null;
}

// Compara o template real com o estado desejado.
// problems = divergências (repo != Firebase). extras = chaves no Firebase que não vêm do repositório.
function diff(template, plan) {
  const problems = [];
  const expectedKeys = new Set(plan.items.map((i) => i.key));
  const waiting = new Set(plan.skipped.map((s) => s.split(' ')[0]));
  const remoteConds = new Map((template.conditions || []).map((c) => [c.name, c.expression]));

  for (const { key, group, param: e } of plan.items) {
    const r = findRemote(template, key);
    if (!r) { problems.push(`${key}: ausente no Firebase`); continue; }
    const a = r.param;
    if ((group || null) !== r.group) problems.push(`${key}: grupo esperado "${group || '(nenhum)'}", atual "${r.group || '(nenhum)'}"`);
    if ((a.valueType || 'STRING') !== e.valueType) problems.push(`${key}: tipo esperado ${e.valueType}, atual ${a.valueType}`);
    if ((a.description || '') !== e.description) problems.push(`${key}: descrição diferente`);
    const describeDefault = (d) => (d && d.useInAppDefault ? 'padrão do app' : `"${d && d.value}"`);
    const sameDefault = e.defaultValue.useInAppDefault ? Boolean(a.defaultValue && a.defaultValue.useInAppDefault) : (a.defaultValue && a.defaultValue.value) === e.defaultValue.value;
    if (!sameDefault) problems.push(`${key}: valor padrão esperado ${describeDefault(e.defaultValue)}, atual ${describeDefault(a.defaultValue)}`);
    const ev = e.conditionalValues || {};
    const av = a.conditionalValues || {};
    for (const name of new Set([...Object.keys(ev), ...Object.keys(av)])) {
      if (!(name in av)) problems.push(`${key}: falta valor condicional "${name}"`);
      else if (!(name in ev)) problems.push(`${key}: valor condicional sobrando "${name}"`);
      else if (av[name].value !== ev[name].value) problems.push(`${key}: "${name}" esperado "${ev[name].value}", atual "${av[name].value}"`);
    }
  }
  for (const c of plan.conditions) {
    if (!remoteConds.has(c.name)) problems.push(`condição "${c.name}" ausente no Firebase`);
    else if (remoteConds.get(c.name) !== c.expression) problems.push(`condição "${c.name}": esperado [${c.expression}], atual [${remoteConds.get(c.name)}]`);
  }
  const planConds = new Set(plan.conditions.map((c) => c.name));
  for (const name of remoteConds.keys()) {
    if (isOwnedCondition(name, expectedKeys) && !planConds.has(name)) problems.push(`condição "${name}" sobrando no Firebase`);
  }

  const remoteKeys = [...Object.keys(template.parameters || {}), ...Object.values(template.parameterGroups || {}).flatMap((g) => Object.keys(g.parameters || {}))];
  const extras = remoteKeys.filter((k) => !expectedKeys.has(k) && !waiting.has(k));
  return { problems, extras };
}

// Conecta ao projeto do ambiente com a chave do service account (base64) vinda de variável de ambiente.
async function connect(cfgEnv) {
  const projectId = process.env[cfgEnv.projectVar] || cfgEnv.projectId;
  if (!projectId) throw new Error(`${cfgEnv.projectVar} não definido`);
  const keyB64 = process.env[cfgEnv.keyVar];
  if (!keyB64) {
    throw new Error(`${cfgEnv.keyVar} não definido. Crie-a no Bitbucket como variável SECURED (Repository settings > Pipelines > Repository variables) com o JSON do service account em base64: base64 -i chave.json | pbcopy`);
  }
  const admin = require('firebase-admin');
  const credential = admin.credential.cert(JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')));
  admin.initializeApp({ credential, projectId });
  return { rc: admin.remoteConfig(), projectId };
}

module.exports = { build, apply, diff, connect, findRemote, removeKeys };
