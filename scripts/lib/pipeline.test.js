const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const doc = yaml.load(fs.readFileSync(path.join(__dirname, '..', '..', 'bitbucket-pipelines.yml'), 'utf8'));

// Nome de cada pipeline -> lista de steps (branches, custom, pull-requests)
function pipelines() {
  const out = [];
  for (const [group, defs] of Object.entries(doc.pipelines)) {
    for (const [name, steps] of Object.entries(defs)) out.push({ id: `${group}/${name}`, steps });
  }
  return out;
}

test('cada ambiente de deployment aparece no máximo uma vez por pipeline (regra do Bitbucket)', () => {
  for (const { id, steps } of pipelines()) {
    const envs = steps.map((s) => s.step && s.step.deployment).filter(Boolean);
    const dup = envs.filter((e, i) => envs.indexOf(e) !== i);
    assert.deepStrictEqual(dup, [], `pipeline ${id} repete deployment: ${dup.join(', ')}`);
  }
});

test('o primeiro step de cada pipeline não é manual', () => {
  for (const { id, steps } of pipelines()) {
    assert.notStrictEqual(steps[0].step.trigger, 'manual', `pipeline ${id} começa com step manual`);
  }
});

test('todo step tem nome e script', () => {
  for (const { id, steps } of pipelines()) {
    for (const { step } of steps) {
      assert.ok(step.name, `step sem nome em ${id}`);
      assert.ok(Array.isArray(step.script) && step.script.length, `step "${step.name}" sem script em ${id}`);
    }
  }
});

test('só ambientes de deployment conhecidos', () => {
  const known = new Set(['test', 'staging', 'production']);
  for (const { steps } of pipelines()) {
    for (const { step } of steps) if (step.deployment) assert.ok(known.has(step.deployment), `deployment desconhecido: ${step.deployment}`);
  }
});

test('só feature/update/remove/release rodam pipeline de PR (chore/* não roda)', () => {
  assert.deepStrictEqual(Object.keys(doc.pipelines['pull-requests']).sort(), ['feature/**', 'release/**', 'remove/**', 'update/**']);
  const feature = doc.pipelines['pull-requests']['feature/**'];
  for (const k of ['update/**', 'remove/**', 'release/**']) assert.deepStrictEqual(doc.pipelines['pull-requests'][k], feature);
});

test('a pipeline de PR confere a permissão por equipe, em todos os tipos de branch de FF', () => {
  for (const [key, steps] of Object.entries(doc.pipelines['pull-requests'])) {
    const cmds = steps.flatMap((s) => s.step.script).join('\n');
    assert.match(cmds, /node scripts\/check-ownership\.js "\$BITBUCKET_BRANCH" origin\/main/, key);
  }
});

test('a pipeline de PR valida o template no Firebase (sem publicar), depois da prévia, em todos os tipos de branch de FF', () => {
  for (const [key, steps] of Object.entries(doc.pipelines['pull-requests'])) {
    const names = steps.map((s) => s.step.name);
    const i = names.findIndex((n) => /Validar o template no Firebase \(sem publicar\)/.test(n));
    assert.ok(i >= 0, `${key}: sem o passo de validação no Firebase`);
    assert.ok(i > names.findIndex((n) => /Prévia do deploy/.test(n)), `${key}: a validação deve vir depois da prévia`);
    const script = steps[i].step.script.join('\n');
    assert.match(script, /node scripts\/deploy\.js nonprod --validate/, key);
    assert.doesNotMatch(script, /--dry-run|publishTemplate/, `${key}: o passo não pode publicar`);
  }
});
