const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

// Repositório temporário (scripts + config), com git de verdade, para rodar o menu sem sujar o real nem empurrar nada.
function menu(respostas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify({ platform: ['p@x.com'], teams: { 'squad-b': { members: [] } } }));
  fs.mkdirSync(path.join(dir, 'flags'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  const r = spawnSync('node', ['scripts/flags-menu.js'], { cwd: dir, encoding: 'utf8', input: respostas.join('\n') + '\n' });
  const file = path.join(dir, 'flags/ft_menu_teste.json');
  const flag = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const branchCriada = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'feature/ft-menu-teste'], { cwd: dir }).status === 0;
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, flag, branchCriada };
}

test('opção 1: cria a FF, cria a branch feature/*, e sem "s" não empurra', () => {
  const r = menu(['1', 'ft_menu_teste', 'squad-b', 'baixa', 'Teste do menu', 'ambas', '2.61.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.branchCriada, 'branch feature/ft-menu-teste não foi criada');
  assert.ok(r.flag, 'flags/ft_menu_teste.json não foi criado');
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.match(r.out, /Branch pronta localmente/);
  assert.doesNotMatch(r.out, /Abra o PR/);
});

test('opção 1: equipe inválida faz new-flag.js recusar; menu não pergunta sobre push', () => {
  const r = menu(['1', 'ft_menu_teste', 'squad-fora', 'baixa', 'Teste', 'ambas', '2.61.0', '']);
  assert.strictEqual(r.flag, null);
  assert.match(r.out, /não está em config\/teams\.json/);
  assert.doesNotMatch(r.out, /Enviar \(git push\)/);
});

test('opção 2: mostra que update:flag ainda não está implementado', () => {
  const r = menu(['2']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /update:flag — ainda não implementado/);
  assert.strictEqual(r.flag, null);
});

test('opção 3: mostra que remove:flag ainda não está implementado', () => {
  const r = menu(['3']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /remove:flag — ainda não implementado/);
  assert.strictEqual(r.flag, null);
});
