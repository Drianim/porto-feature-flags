const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { KEY_RE } = require('./lib/flags');

// docs/templates/codigo-app/: como o APP usa a FF (Kotlin e Swift), uma seção por situação da FF.
// Este teste não compila Kotlin nem Swift: garante estrutura, paridade entre as plataformas e consistência com as regras do repositório.
const root = path.join(__dirname, '..');
const dir = path.join(root, 'docs', 'templates', 'codigo-app');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const PLATFORMS = { 'android.md': 'kotlin', 'ios.md': 'swift' };
const SITUACOES = [
  'Nova FF (feature/*)',
  'Ligar e subir o rollout (update/*)',
  'Valor de configuração (rc_*)',
  'Plataforma e versão mínima',
  'Remover a FF e limpar o código (remove/*)',
  'Testar os dois estados',
];
const codeBlocks = (text, lang) => [...text.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);
const keysIn = (text) => [...new Set([...text.matchAll(/\b((?:ft|rc)_[A-Za-z0-9_]*)/g)].map((m) => m[1]))];

for (const [file, lang] of Object.entries(PLATFORMS)) {
  const text = read('docs', 'templates', 'codigo-app', file);
  const code = codeBlocks(text, lang);

  test(`${file}: as seis situações, na ordem e com os títulos do modelo`, () => {
    const titles = [...text.matchAll(/^### (\d)\. (.+)$/gm)].map((m) => `${m[1]}|${m[2].trim()}`);
    assert.deepStrictEqual(titles, SITUACOES.map((t, i) => `${i + 1}|${t}`));
  });

  test(`${file}: cada situação tem código completo (${lang})`, () => {
    const sections = text.split(/\n### \d\. /).slice(1);
    assert.strictEqual(sections.length, 6);
    sections.forEach((s, i) => assert.ok(codeBlocks(s, lang).length >= 1 || i === 1, `situação ${i + 1} sem bloco ${lang}`));
  });

  test(`${file}: contrato FeatureFlags com FeatureToggle (Boolean) e FeatureConfig (String) e chaves tipadas`, () => {
    const all = code.join('\n');
    assert.match(all, /\bFeatureFlags\b/);
    assert.match(all, /\bFeatureToggle\b/);
    assert.match(all, /\bFeatureConfig\b/);
    assert.match(all, /RemoteFeatureFlags/);
    assert.ok(keysIn(all).length >= 2, 'chaves de exemplo ausentes');
  });

  test(`${file}: toda chave dos blocos de código segue o padrão do repositório e a API do seu tipo`, () => {
    const all = code.join('\n');
    for (const k of keysIn(all)) assert.match(k, KEY_RE, `chave fora do padrão: ${k}`);
    for (const line of all.split('\n')) {
      const ks = keysIn(line);
      if (ks.some((k) => k.startsWith('ft_'))) assert.doesNotMatch(line, /getString|stringValue|value\(FeatureConfig/, `toggle lido como texto: ${line.trim()}`);
      if (ks.some((k) => k.startsWith('rc_'))) assert.doesNotMatch(line, /getBoolean|boolValue|isEnabled\(/, `config lida como booleano: ${line.trim()}`);
    }
  });

  test(`${file}: padrão embutido no app é o comportamento antigo (toggle false; config com valor)`, () => {
    const all = code.join('\n');
    const defaults = [...all.matchAll(/"((?:ft|rc)_[A-Za-z0-9_]+)"\s*(?:to|:)\s*("?[^,\n]+?"?)(?:\s+as NSObject)?,?\s*$/gm)].filter((m) => !/\(/.test(m[2]));
    const toggles = defaults.filter((m) => m[1].startsWith('ft_'));
    const configs = defaults.filter((m) => m[1].startsWith('rc_'));
    assert.ok(toggles.length >= 1 && configs.length >= 1, 'a inicialização precisa declarar os padrões de toggle e de config');
    for (const [, k, v] of toggles) assert.strictEqual(v.trim(), 'false', `${k} deve ter padrão false`);
    for (const [, k, v] of configs) assert.ok(v.replace(/"/g, '').trim().length > 0, `${k} sem padrão`);
  });

  test(`${file}: sem marcador de pendência`, () => {
    assert.doesNotMatch(text, /\b(TBD|TODO|FIXME)\b|\ba definir\b/);
  });
}

test('as duas plataformas usam as mesmas chaves de exemplo', () => {
  const [a, i] = Object.keys(PLATFORMS).map((f) => keysIn(codeBlocks(read('docs', 'templates', 'codigo-app', f), PLATFORMS[f]).join('\n')).sort());
  assert.deepStrictEqual(a, i);
});

test('README dos templates: linha do tempo por situação, tipos de branch, rollback e a regra de remoção', () => {
  const t = read('docs', 'templates', 'codigo-app', 'README.md');
  for (const s of SITUACOES) assert.ok(t.includes(s), `situação ausente na linha do tempo: ${s}`);
  for (const b of ['feature/*', 'update/*', 'remove/*', 'release/*']) assert.ok(t.includes(b), b);
  assert.match(t, /rollback/i);
  assert.match(t, /padrão do app/);
  assert.match(t, /android\.md/);
  assert.match(t, /ios\.md/);
});

test('o repositório aponta para os templates de código e explica como nomear a branch', () => {
  for (const f of ['README.md', 'CLAUDE.md', path.join('.claude', 'skills', 'feature-flag', 'SKILL.md'), path.join('.github', 'pull_request_template.md')]) {
    assert.ok(read(f).includes('docs/templates/codigo-app'), `${f} não aponta para os templates de código`);
  }
  assert.match(read('.github', 'pull_request_template.md'), /PR do app/);
  const readme = read('README.md');
  for (const w of ['nome completo com o prefixo', 'hotfix/', 'feature/', 'update/', 'remove/', 'release/', 'chore/']) assert.ok(readme.includes(w), `README sem "${w}" (como nomear a branch)`);
});
