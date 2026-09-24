const test = require('node:test');
const assert = require('node:assert');
const { run } = require('./deploy');

const F = (key, over = {}) => ({ key, description: 'd', team: 'squad-poc', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0',
  environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } }, ...over });
const envs = { nonprod: { keyVar: 'K', projectVar: 'P', projectId: 'proj', timeGated: false }, prod: { keyVar: 'KP', projectVar: 'PP', timeGated: true } };

// Firebase falso. `rejectOld` recusa a sintaxe antiga de versão como o Firebase real. Registra o que foi chamado.
function exec(argv, { flags = [F('ft_a')], rejectOld = true, template = { parameters: {}, parameterGroups: {}, conditions: [] } } = {}) {
  const out = []; const err = []; const calls = [];
  const rc = {
    getTemplate: async () => { calls.push('getTemplate'); return JSON.parse(JSON.stringify(template)); },
    validateTemplate: async (t) => {
      calls.push('validateTemplate');
      if (rejectOld) for (const c of t.conditions) { const i = c.expression.search(/app\.version >=/); if (i >= 0) throw new Error(`[VALIDATION_ERROR]: at line 1, column ${i + 12}. Was expecting: '.'`); }
    },
    publishTemplate: async () => { calls.push('publishTemplate'); return { version: { versionNumber: '7' } }; },
  };
  const deps = { loadFlags: () => flags, loadRms: () => [], environments: () => envs, connect: async () => ({ rc, projectId: 'proj' }), now: () => new Date('2026-09-24T12:00:00Z'), stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
  return run(argv, deps).then((code) => ({ code, out: out.join('\n'), err: err.join('\n'), calls }));
}

test('--validate: template aceito, nada é publicado', async () => {
  const r = await exec(['nonprod', '--validate']);
  assert.strictEqual(r.code, 0, r.err);
  assert.match(r.out, /aceito pelo Firebase \(proj\)/);
  assert.deepStrictEqual(r.calls, ['getTemplate', 'validateTemplate']);
});

test('--validate reprova quando o Firebase recusa o template, e diz a condição e a mensagem', async () => {
  const out = []; const err = []; const calls = [];
  const rc = {
    getTemplate: async () => ({ parameters: {}, parameterGroups: {}, conditions: [] }),
    validateTemplate: async () => { calls.push('validateTemplate'); throw new Error("[VALIDATION_ERROR]: at line 1, column 35. Was expecting: '.'"); },
    publishTemplate: async () => { calls.push('publishTemplate'); return { version: { versionNumber: '1' } }; },
  };
  const code = await run(['nonprod', '--validate'], { loadFlags: () => [F('ft_a')], loadRms: () => [], environments: () => envs, connect: async () => ({ rc, projectId: 'proj' }), now: () => new Date(), stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  assert.strictEqual(code, 1);
  const e = err.join('\n');
  assert.match(e, /o Firebase \(proj\) recusou o template/);
  assert.match(e, /Was expecting: '\.'/);
  assert.match(e, /ft_a_ios/);
  assert.match(e, /app\.version\.>=\(\['2\.61\.0'\]\)/);
  assert.ok(!calls.includes('publishTemplate'), 'não pode publicar');
});

test('sem --validate o deploy continua validando e publicando', async () => {
  const r = await exec(['nonprod']);
  assert.strictEqual(r.code, 0, r.err);
  assert.deepStrictEqual(r.calls, ['getTemplate', 'validateTemplate', 'publishTemplate']);
  assert.match(r.out, /1 chave\(s\) publicadas em nonprod \(versão 7\)/);
});

test('--dry-run continua sem falar com o Firebase', async () => {
  const r = await exec(['nonprod', '--dry-run']);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.calls, []);
  assert.match(r.out, /"key": "ft_a"/);
});

test('ambiente desconhecido e FF inválida saem com 1 e mensagem', async () => {
  assert.strictEqual((await exec(['staging'])).code, 1);
  const r = await exec(['nonprod', '--validate'], { flags: [F('ft_x', { minVersion: undefined })] });
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /minVersion obrigatório/);
});
