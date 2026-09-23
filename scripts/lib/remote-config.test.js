const test = require('node:test');
const assert = require('node:assert');
const { build, apply, diff, removeKeys, findRemote } = require('./remote-config');

const flags = [
  { key: 'ft_a', description: 'A', owner: 'x', criticality: 'baixa', valueType: 'STRING', group: 'Grupo',
    environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } } },
  { key: 'rc_url', description: 'URL', owner: 'x', criticality: 'baixa', valueType: 'STRING',
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
test('valor padrão diferente é divergência', () => {
  const t = fresh(); t.parameters.rc_url.defaultValue.value = 'https://outro';
  assert.match(diff(t, plan()).problems.join('|'), /valor padrão esperado "https:\/\/x"/);
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
