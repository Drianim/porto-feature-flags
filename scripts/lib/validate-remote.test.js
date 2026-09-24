const test = require('node:test');
const assert = require('node:assert');
const { build } = require('./remote-config');
const { validateRemote } = require('./validate-remote');

const F = (over) => ({ key: 'ft_v', description: 'd', team: 'squad-poc', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0',
  environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } }, ...over });
const plan = () => build([F({}), F({ key: 'ft_w', platforms: 'ios' })], [], 'nonprod', { timeGated: false });

// Firebase falso: recusa a sintaxe antiga (app.version >= '...') com a mesma mensagem do Firebase real e aceita o resto.
// Qualquer chamada de escrita explode: a validação nunca publica.
function fakeRc({ template = { parameters: {}, parameterGroups: {}, conditions: [] }, rejectWith } = {}) {
  const calls = [];
  const base = {
    getTemplate: async () => { calls.push('getTemplate'); return JSON.parse(JSON.stringify(template)); },
    validateTemplate: async (t) => {
      calls.push('validateTemplate');
      if (rejectWith) throw new Error(rejectWith);
      for (const c of t.conditions) {
        const i = c.expression.search(/app\.version >=/);
        if (i >= 0) throw new Error(`[VALIDATION_ERROR]: at line 1, column ${i + 12}. Was expecting: '.'`);
      }
      return t;
    },
  };
  const rc = new Proxy(base, { get: (t, p) => t[p] ?? (() => { throw new Error(`ESCRITA PROIBIDA: ${String(p)}`); }) });
  return { rc, calls };
}

test('template aceito pelo Firebase: ok, sem publicar', async () => {
  const { rc, calls } = fakeRc();
  const r = await validateRemote(rc, plan());
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.culprits, []);
  assert.deepStrictEqual(calls, ['getTemplate', 'validateTemplate']);
});

test('expressão recusada: aponta a condição culpada com nome, expressão e a mensagem do Firebase', async () => {
  const p = plan();
  p.conditions.find((c) => c.name === 'ft_w_ios').expression = "device.os == 'ios' && app.version >= '2.61.0'";
  const { rc } = fakeRc();
  const r = await validateRemote(rc, p);
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /Was expecting: '\.'/);
  assert.deepStrictEqual(r.culprits.map((c) => c.name), ['ft_w_ios']);
  assert.strictEqual(r.culprits[0].expression, "device.os == 'ios' && app.version >= '2.61.0'");
  assert.match(r.culprits[0].message, /column/);
});

test('várias condições ruins: todas aparecem; as boas não', async () => {
  const p = plan();
  for (const c of p.conditions.filter((c) => c.name.endsWith('_ios'))) c.expression = c.expression.replace(/app\.version\.>=\(\['([\d.]+)'\]\)/, "app.version >= '$1'");
  const { rc } = fakeRc();
  const r = await validateRemote(rc, p);
  assert.deepStrictEqual(r.culprits.map((c) => c.name).sort(), ['ft_v_ios', 'ft_w_ios']);
});

test('erro do Firebase sem posição (ex.: limite de parâmetros): ok false, sem culpado inventado', async () => {
  const { rc } = fakeRc({ rejectWith: 'Param count too large' });
  const r = await validateRemote(rc, plan());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.message, 'Param count too large');
  assert.deepStrictEqual(r.culprits, []);
});

test('não escreve nada no Firebase, nem quando recusa', async () => {
  const p = plan();
  p.conditions[0].expression = "device.os == 'ios' && app.version >= '2.61.0'";
  const { rc, calls } = fakeRc();
  await validateRemote(rc, p);
  assert.ok(calls.every((c) => ['getTemplate', 'validateTemplate'].includes(c)), calls.join(','));
});
