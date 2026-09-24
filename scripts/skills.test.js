const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { COMMANDS } = require('./lib/status');

const dir = path.join(__dirname, '..', '.claude', 'skills');
const skills = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'SKILL.md')));
const read = (name) => fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
const front = (text) => Object.fromEntries((/^---\n([\s\S]*?)\n---/.exec(text)[1].match(/^[a-z-]+:.*$/gm) || []).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));

test('toda skill do projeto tem name igual à pasta e description', () => {
  assert.ok(skills.length >= 3);
  for (const s of skills) {
    const f = front(read(s));
    assert.strictEqual(f.name, s, s);
    assert.ok(f.description && f.description.length > 40, `${s}: description`);
  }
});
test('ff-status: só executa o comando de status, é somente leitura e cobre todos os subcomandos', () => {
  const text = read('ff-status');
  const f = front(text);
  assert.strictEqual(f['allowed-tools'], 'Bash(node scripts/ff-status.js:*)');
  assert.strictEqual(f.model, 'sonnet');
  for (const c of COMMANDS) assert.match(text, new RegExp(`\`${c}\\b`), `subcomando ${c} ausente na skill`);
  assert.match(text, /somente leitura/i);
  assert.match(text, /Nunca procure a chave/);
  assert.match(text, /\^\(ft\\\|rc\)_\[A-Za-z0-9_\]\+\$/);
  const bodyWithoutRules = text.split('## Regras')[0];
  assert.doesNotMatch(bodyWithoutRules.replace(/`(firebase|curl|git push|npm run deploy)`/g, ''), /\bnode scripts\/(deploy|remove-flags|new-flag)\b/);
});
