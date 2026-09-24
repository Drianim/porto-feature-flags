const test = require('node:test');
const assert = require('node:assert');
const { build, apply, diff, removeKeys, findRemote, versionCondition } = require('./remote-config');
const { expectedAt, justBelow } = require('./flags');

const flags = [
  { key: 'ft_a', description: 'A', team: 'squad-a', criticality: 'baixa', valueType: 'STRING', group: 'Grupo', platforms: 'ambas', minVersion: '2.61.0',
    environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } } },
  { key: 'rc_url', description: 'URL', team: 'squad-a', criticality: 'baixa', valueType: 'STRING', platforms: 'ambas', minVersion: '2.61.0',
    environments: { nonprod: { default: 'https://x' } } },
];
const cfg = { timeGated: false };
const plan = () => build(flags, [], 'nonprod', cfg);
const fresh = () => apply({ parameters: {}, parameterGroups: {}, conditions: [] }, plan());

test('template gerado a partir do plano não tem divergência', () => {
  const r = diff(fresh(), plan());
  assert.deepStrictEqual(r, { problems: [], extras: [] });
});
test('chave ausente é divergência', () => {
  const t = fresh(); delete t.parameters.rc_url;
  assert.match(diff(t, plan()).problems[0], /rc_url: ausente/);
});
test('padrão do toggle diferente é divergência', () => {
  const t = fresh(); t.parameterGroups.Grupo.parameters.ft_a.defaultValue.value = 'true';
  assert.match(diff(t, plan()).problems.join('|'), /valor padrão esperado "false", atual "true"/);
});
test('rc_ publicado com valor padrão fixo (em vez do padrão do app) é divergência', () => {
  const t = fresh(); t.parameters.rc_url.defaultValue = { value: 'https://x' };
  assert.match(diff(t, plan()).problems.join('|'), /valor padrão esperado padrão do app, atual "https:\/\/x"/);
});
test('grupo diferente é divergência', () => {
  const t = fresh(); t.parameters.ft_a = t.parameterGroups.Grupo.parameters.ft_a; delete t.parameterGroups.Grupo.parameters.ft_a;
  assert.match(diff(t, plan()).problems.join('|'), /grupo esperado "Grupo"/);
});
test('condição alterada e valor condicional faltando são divergências', () => {
  const t = fresh();
  t.conditions.find((c) => c.name === 'ft_a_ios').expression = "device.os == 'ios' && percent <= 10";
  delete t.parameterGroups.Grupo.parameters.ft_a.conditionalValues.ft_a_android;
  const p = diff(t, plan()).problems.join('|');
  assert.match(p, /condição "ft_a_ios"/);
  assert.match(p, /falta valor condicional "ft_a_android"/);
});
test('condição sobrando de chave do repositório é divergência', () => {
  const t = fresh(); t.conditions.push({ name: 'rc_url_ios', expression: "device.os == 'ios'" });
  assert.match(diff(t, plan()).problems.join('|'), /sobrando/);
});
test('chave só no Firebase vira extra, não divergência', () => {
  const t = fresh(); t.parameters.legado = { defaultValue: { value: '1' } };
  const r = diff(t, plan());
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(r.extras, ['legado']);
});
test('apply é idempotente e preserva chaves de fora', () => {
  const t = fresh(); t.parameters.legado = { defaultValue: { value: '1' } };
  const again = apply(JSON.parse(JSON.stringify(t)), plan());
  assert.deepStrictEqual(diff(again, plan()), { problems: [], extras: ['legado'] });
  assert.ok(again.parameters.legado);
});

test('removeKeys apaga parâmetro, condições próprias e grupo que ficou vazio', () => {
  const t = fresh(); t.parameters.legado = { defaultValue: { value: '1' } };
  removeKeys(t, ['ft_a', 'rc_url']);
  assert.strictEqual(findRemote(t, 'ft_a'), null);
  assert.strictEqual(findRemote(t, 'rc_url'), null);
  assert.deepStrictEqual(t.parameterGroups, {});
  assert.deepStrictEqual(t.conditions, []);
  assert.ok(t.parameters.legado, 'não mexe em chave de fora');
});
test('removeKeys mantém grupo que ainda tem outras chaves', () => {
  const t = fresh(); t.parameterGroups.Grupo.parameters.outra = { defaultValue: { value: 'x' } };
  removeKeys(t, ['ft_a']);
  assert.deepStrictEqual(Object.keys(t.parameterGroups.Grupo.parameters), ['outra']);
});
test('removeKeys de chave inexistente não falha', () => {
  const t = fresh(); assert.doesNotThrow(() => removeKeys(t, ['nao_existe']));
});

test('tipo vem dos valores: true/false = BOOLEAN; URL/texto = STRING', () => {
  const p = build(flags, [], 'nonprod', cfg);
  assert.strictEqual(p.items.find((i) => i.key === 'ft_a').param.valueType, 'BOOLEAN');
  assert.strictEqual(p.items.find((i) => i.key === 'rc_url').param.valueType, 'STRING');
  const b = build([{ key: 'rc_flag', description: 'd', team: 'squad-a', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0', environments: { nonprod: { default: 'true' } } }], [], 'nonprod', cfg);
  assert.strictEqual(b.items[0].param.valueType, 'BOOLEAN', 'rc_ com true/false também é BOOLEAN');
});
test('diff acusa toggle publicado como STRING (tipo esperado BOOLEAN)', () => {
  const t = fresh(); t.parameterGroups.Grupo.parameters.ft_a.valueType = 'STRING';
  assert.match(diff(t, plan()).problems.join('|'), /ft_a: tipo esperado BOOLEAN, atual STRING/);
});

test('rollout em % usa semente com o nome da FF', () => {
  const f = [{ key: 'ft_z', description: 'd', team: 'squad-a', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0', environments: { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 25 }, android: { value: 'true' } } } }];
  const p = build(f, [], 'nonprod', cfg);
  assert.strictEqual(p.conditions.find((c) => c.name === 'ft_z_ios').expression, "device.os == 'ios' && app.version.>=(['2.61.0']) && percent('ft_z') <= 25");
  assert.strictEqual(p.conditions.find((c) => c.name === 'ft_z_android').expression, "device.os == 'android' && app.version.>=(['2.61.0'])");
});

// ---- plataformas e versão mínima ----
// Avaliador mínimo das expressões que o build gera: device.os == 'x', app.version.>=(['v']) e percent('k') <= N, ligados por " && ".
const cmp = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const matches = (expr, ctx) => expr.split(' && ').every((term) => {
  let m;
  if ((m = /^device\.os == '(\w+)'$/.exec(term))) return ctx.os === m[1];
  if ((m = /^app\.version\.>=\(\['([\d.]+)'\]\)$/.exec(term))) return cmp(ctx.version, m[1]) >= 0;
  if ((m = /^percent\('\w+'\) <= (\d+)$/.exec(term))) return (ctx.percentile ?? 0) <= Number(m[1]);
  throw new Error(`expressão fora do que o teste entende: ${term}`);
});
// Valor que o Remote Config serviria: 1ª condição (na ordem do template) que casa; senão o padrão; padrão do app = undefined.
function serve(flag, ctx) {
  const p = build([flag], [], 'nonprod', cfg);
  const item = p.items[0].param;
  for (const c of p.conditions) if (c.name in item.conditionalValues && matches(c.expression, ctx)) return item.conditionalValues[c.name].value;
  return item.defaultValue.useInAppDefault ? undefined : item.defaultValue.value;
}
const F = (over) => ({ key: 'ft_v', description: 'd', team: 'squad-a', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0', ...over });
const on = { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } };

test('toggle liga a partir da versão mínima e nunca abaixo dela', () => {
  const f = F({ environments: on });
  for (const os of ['ios', 'android']) {
    assert.strictEqual(serve(f, { os, version: '2.61.0' }), 'true', `${os} na mínima`);
    assert.strictEqual(serve(f, { os, version: '3.0.0' }), 'true', `${os} acima`);
    assert.strictEqual(serve(f, { os, version: '2.60.999' }), 'false', `${os} logo abaixo`);
    assert.strictEqual(serve(f, { os, version: '1.0.0' }), 'false', `${os} muito abaixo`);
  }
});
test('toggle com default "true" também respeita a versão mínima', () => {
  const f = F({ environments: { nonprod: { default: 'true' } } });
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0' }), 'true');
  assert.strictEqual(serve(f, { os: 'android', version: '2.60.0' }), 'false');
});
test('FF só de iOS não liga no Android, mesmo em versão nova', () => {
  const f = F({ platforms: 'ios', environments: on });
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0' }), 'true');
  assert.strictEqual(serve(f, { os: 'android', version: '9.9.9' }), 'false');
  assert.deepStrictEqual(build([f], [], 'nonprod', cfg).conditions.map((c) => c.name), ['ft_v_ios']);
});
test('versão mínima por plataforma', () => {
  const f = F({ minVersion: { ios: '2.61.0', android: '2.58.3' }, environments: on });
  assert.strictEqual(serve(f, { os: 'android', version: '2.58.3' }), 'true');
  assert.strictEqual(serve(f, { os: 'android', version: '2.58.2' }), 'false');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.58.3' }), 'false');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0' }), 'true');
});
test('rollout em % só vale a partir da versão mínima', () => {
  const f = F({ environments: { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 25 } } } });
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0', percentile: 10 }), 'true');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0', percentile: 60 }), 'false');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.60.0', percentile: 10 }), 'false');
  assert.strictEqual(serve(f, { os: 'android', version: '2.61.0', percentile: 10 }), 'false');
});
test('rc_ só é servido nas plataformas da FF e a partir da versão mínima (senão, padrão do app)', () => {
  const f = F({ key: 'rc_url', platforms: 'android', environments: { nonprod: { default: 'https://x' } } });
  assert.strictEqual(serve(f, { os: 'android', version: '2.61.0' }), 'https://x');
  assert.strictEqual(serve(f, { os: 'android', version: '2.60.0' }), undefined);
  assert.strictEqual(serve(f, { os: 'ios', version: '9.0.0' }), undefined);
  assert.strictEqual(build([f], [], 'nonprod', cfg).items[0].param.defaultValue.useInAppDefault, true);
});
test('rc_ com override em %: quem fica de fora do % recebe o padrão, ainda dentro da versão mínima', () => {
  const f = F({ key: 'rc_url', environments: { nonprod: { default: 'https://x', ios: { value: 'https://novo', rolloutPercent: 20 } } } });
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0', percentile: 5 }), 'https://novo');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.61.0', percentile: 90 }), 'https://x');
  assert.strictEqual(serve(f, { os: 'ios', version: '2.60.9', percentile: 5 }), undefined);
  assert.strictEqual(serve(f, { os: 'android', version: '2.61.0' }), 'https://x');
});
test('build recusa FF sem plataforma ou sem versão mínima', () => {
  assert.throws(() => build([F({ platforms: undefined, environments: on })], [], 'nonprod', cfg), /platforms obrigatório/);
  assert.throws(() => build([F({ minVersion: undefined, environments: on })], [], 'nonprod', cfg), /minVersion obrigatório/);
});
test('removeKeys apaga também as condições _base de rc_', () => {
  const t = apply({ parameters: {}, parameterGroups: {}, conditions: [] }, plan());
  removeKeys(t, ['rc_url']);
  assert.deepStrictEqual(t.conditions.map((c) => c.name).sort(), ['ft_a_android', 'ft_a_ios']);
});

test('o que test-platforms espera (expectedAt) é exatamente o que as condições publicadas servem', () => {
  const envs = [
    on, { nonprod: { default: 'true' } }, { nonprod: { default: 'false' } },
    { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 30 } } },
    { nonprod: { default: 'false', android: { value: 'true', rolloutPercent: 0 } } },
  ];
  const variants = [
    (environments) => F({ environments }),
    (environments) => F({ platforms: 'ios', environments }),
    (environments) => F({ platforms: 'android', minVersion: '2.58.3', environments }),
    (environments) => F({ minVersion: { ios: '2.61.0', android: '2.50.0' }, environments }),
    (environments) => F({ key: 'rc_v', environments: { nonprod: { ...environments.nonprod, default: 'https://x' } } }),
  ];
  let checked = 0;
  for (const mk of variants) for (const environments of envs) {
    const f = mk(environments);
    if (f.key === 'rc_v') for (const p of ['ios', 'android']) if (f.environments.nonprod[p]) f.environments.nonprod[p].value = 'https://novo';
    for (const os of ['ios', 'android']) {
      const mins = typeof f.minVersion === 'string' ? [f.minVersion] : Object.values(f.minVersion);
      for (const version of ['0.0.1', ...mins, ...mins.map(justBelow).filter(Boolean), '99.0.0']) {
        const exp = expectedAt(f, 'nonprod', os, version);
        if (exp.mode === 'exact') assert.strictEqual(serve(f, { os, version, percentile: 50 }), exp.value, `${f.key} ${os} ${version}`);
        else {
          assert.strictEqual(serve(f, { os, version, percentile: exp.percent }), exp.value, `${f.key} ${os} ${version} dentro`);
          assert.strictEqual(serve(f, { os, version, percentile: exp.percent + 1 }), exp.other, `${f.key} ${os} ${version} fora`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 100);
});

test('a descrição publicada leva a equipe como prefixo e o repositório não muda', () => {
  const p = plan();
  assert.strictEqual(p.items.find((i) => i.key === 'ft_a').param.description, '[squad-a] A');
  assert.strictEqual(flags[0].description, 'A');
});
test('descrição sem a equipe, ou com outra equipe, é divergência', () => {
  const t = fresh();
  t.parameterGroups.Grupo.parameters.ft_a.description = 'A';
  assert.match(diff(t, plan()).problems.join('|'), /ft_a: descrição diferente/);
  t.parameterGroups.Grupo.parameters.ft_a.description = '[squad-b] A';
  assert.match(diff(t, plan()).problems.join('|'), /ft_a: descrição diferente/);
});

// ---- gramática das expressões (guarda contra mudança silenciosa de sintaxe) ----
// Spec 0008: o validateTemplate REAL do Firebase recusou app.version >= '...' ("Was expecting: '.'"). A forma adotada é o método
// app.version.>=(['x.y.z']); quem confirma que o Firebase a aceita é o `deploy --validate` (PR) e a sonda, não este teste local.
const TERM = /^(device\.os == '(?:ios|android)'|app\.version\.>=\(\['\d+\.\d+\.\d+'\]\)|percent\('[A-Za-z0-9_]+'\) <= \d{1,3})$/;
test('a condição de versão usa a sintaxe de método aceita pelo Firebase', () => {
  assert.strictEqual(versionCondition('2.61.0'), "app.version.>=(['2.61.0'])");
  assert.doesNotMatch(versionCondition('2.61.0'), /app\.version >=/);
});
test('toda condição gerada casa com a gramática conhecida e sempre traz plataforma e versão', () => {
  const variants = [
    F({ environments: on }),
    F({ platforms: 'ios', environments: { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 25 } } } }),
    F({ minVersion: { ios: '2.61.0', android: '2.58.3' }, environments: on }),
    F({ key: 'rc_url', environments: { nonprod: { default: 'https://x', ios: { value: 'https://novo', rolloutPercent: 20 } } } }),
    F({ environments: { nonprod: { default: 'true' } } }),
  ];
  let n = 0;
  for (const f of variants) {
    for (const c of build([f], [], 'nonprod', cfg).conditions) {
      const terms = c.expression.split(' && ');
      for (const t of terms) assert.match(t, TERM, `${c.name}: termo fora da gramática: ${t}`);
      assert.ok(terms.some((t) => t.startsWith('device.os')) && terms.some((t) => t.startsWith('app.version')), `${c.name}: sem plataforma ou versão`);
      n++;
    }
  }
  assert.ok(n >= 8, `condições conferidas: ${n}`);
});
