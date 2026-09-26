const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

const TEAMS_UMA = { platform: ['p@x.com'], teams: { 'squad-b': { members: [] } } };

// Repositório temporário (scripts + config), com git de verdade, para rodar o menu sem sujar o real nem empurrar nada.
function menu(respostas, teams = TEAMS_UMA) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify(teams));
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

test('opção 1: pergunta a equipe como lista numerada e cria a FF, a branch feature/*, e sem "s" não empurra', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste do menu', 'ambas', '2.61.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.branchCriada, 'branch feature/ft-menu-teste não foi criada');
  assert.ok(r.flag, 'flags/ft_menu_teste.json não foi criado');
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.match(r.out, /1 - squad-b/);
  assert.match(r.out, /Branch pronta localmente/);
  assert.doesNotMatch(r.out, /Abra o PR/);
});

test('opção 1: com mais de uma equipe cadastrada, o número escolhe a equipe certa', () => {
  const teams = { platform: ['p@x.com'], teams: { 'squad-a': { members: [] }, 'squad-b': { members: [] } } };
  const r = menu(['1', 'ft_menu_teste', '2', 'baixa', 'Teste', 'ambas', '2.61.0', '', 'N'], teams);
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.match(r.out, /1 - squad-a/);
  assert.match(r.out, /2 - squad-b/);
});

test('opção 1: número de equipe inválido (fora do intervalo) repete a lista até um número válido', () => {
  const r = menu(['1', 'ft_menu_teste', '9', '1', 'baixa', 'Teste', 'ambas', '2.61.0', '', 'N']);
  assert.strictEqual(r.flag.team, 'squad-b');
  const ocorrencias = (r.out.match(/Escolha o número da equipe/g) || []).length;
  assert.strictEqual(ocorrencias, 2, r.out);
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
