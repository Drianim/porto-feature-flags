const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

const TEAMS_UMA = { platform: ['p@x.com'], teams: { 'squad-b': { members: [] } } };

// Repositório temporário (scripts + config), com git de verdade, para rodar o menu sem sujar o real nem empurrar nada.
function menu(respostas, { teams = TEAMS_UMA, key = 'ft_menu_teste' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify(teams));
  fs.mkdirSync(path.join(dir, 'flags'), { recursive: true });
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-remote-'));
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: dir });
  spawnSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  spawnSync('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: dir });
  const r = spawnSync('node', ['scripts/flags-menu.js'], { cwd: dir, encoding: 'utf8', input: respostas.join('\n') + '\n' });
  const file = path.join(dir, `flags/${key}.json`);
  const flag = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const envPath = path.join(dir, `env/nonprod/${key}.json`);
  const env = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : null;
  const branchName = `feature/${key.replace(/_/g, '-')}`;
  const branchCriada = spawnSync('git', ['rev-parse', '--verify', '--quiet', branchName], { cwd: dir }).status === 0;
  const commitFiles = spawnSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const catalogDir = path.join(dir, 'catalog');
  const catalogs = {};
  if (fs.existsSync(catalogDir)) {
    for (const t of fs.readdirSync(catalogDir)) catalogs[t] = JSON.parse(fs.readFileSync(path.join(catalogDir, t, 'keys.json'), 'utf8'));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(remoteDir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, flag, env, branchCriada, commitFiles, catalogs };
}

// Repositório sem identidade de git configurada (local ou global) para provar que o menu para e mostra o erro
// quando o commit automático falha, em vez de seguir perguntando sobre enviar.
function menuSemIdentidade(respostas, { teams = TEAMS_UMA } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-noid-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-home-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/teams.json'), JSON.stringify(teams));
  fs.mkdirSync(path.join(dir, 'flags'), { recursive: true });
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
  delete env.GIT_AUTHOR_NAME; delete env.GIT_AUTHOR_EMAIL; delete env.GIT_COMMITTER_NAME; delete env.GIT_COMMITTER_EMAIL;
  spawnSync('git', ['init', '-q'], { cwd: dir, env });
  spawnSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir, env });
  spawnSync('git', ['config', 'user.useConfigOnly', 'true'], { cwd: dir, env });
  const r = spawnSync('node', ['scripts/flags-menu.js'], { cwd: dir, encoding: 'utf8', input: respostas.join('\n') + '\n', env });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('opção 1: pergunta a equipe como lista numerada e cria a FF, a branch feature/*, e sem "s" não empurra', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste do menu', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.branchCriada, 'branch feature/ft-menu-teste não foi criada');
  assert.ok(r.flag, 'flags/ft_menu_teste.json não foi criado');
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.match(r.out, /1 - squad-b/);
  assert.match(r.out, /Branch pronta localmente/);
  assert.doesNotMatch(r.out, /Abra o PR/);
});

test('CA-4: mesmo respondendo "N" ao final, o catálogo já foi gerado e committado (só o push é que não roda)', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste do menu', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(r.commitFiles.sort(), ['catalog/squad-b/keys.json', 'env/nonprod/ft_menu_teste.json', 'flags/ft_menu_teste.json']);
  assert.strictEqual(r.catalogs['squad-b'].keys[0].key, 'ft_menu_teste');
});

test('CA-1/CA-2: com resposta "s", o commit levado já existe antes do push e o catálogo bate com o gerado', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste do menu', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 's']);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(r.commitFiles.sort(), ['catalog/squad-b/keys.json', 'env/nonprod/ft_menu_teste.json', 'flags/ft_menu_teste.json']);
  assert.strictEqual(r.catalogs['squad-b'].total, 1);
});

test('CA-5: sem identidade de git configurada, o commit falha, o menu mostra o erro e não pergunta sobre enviar', () => {
  const r = menuSemIdentidade(['1', 'ft_menu_teste', '1', 'baixa', 'Teste do menu', 'ambas', 's', 'N', '2.61.0', '2.63.0', '']);
  assert.match(r.out, /Please tell me who you are|no email was given/);
  assert.doesNotMatch(r.out, /Enviar \(git push\)/);
});

test('opção 1: com mais de uma equipe cadastrada, o número escolhe a equipe certa', () => {
  const teams = { platform: ['p@x.com'], teams: { 'squad-a': { members: [] }, 'squad-b': { members: [] } } };
  const r = menu(['1', 'ft_menu_teste', '2', 'baixa', 'Teste', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 'N'], { teams });
  assert.strictEqual(r.flag.team, 'squad-b');
  assert.match(r.out, /1 - squad-a/);
  assert.match(r.out, /2 - squad-b/);
});

test('opção 1: número de equipe inválido (fora do intervalo) repete a lista até um número válido', () => {
  const r = menu(['1', 'ft_menu_teste', '9', '1', 'baixa', 'Teste', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.flag.team, 'squad-b');
  const ocorrencias = (r.out.match(/Escolha o número da equipe/g) || []).length;
  assert.strictEqual(ocorrencias, 2, r.out);
});

test('opção 1: plataforma inválida repete a pergunta até um valor válido', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste', 'qualquer', 'ambas', 's', 's', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.flag, 'flags/ft_menu_teste.json não foi criado');
  assert.match(r.out, /"qualquer" não é uma plataforma válida/);
});

test('opção 1: chave ft_ com plataforma "ambas" pergunta ativar em ios e depois android', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste', 'ambas', 's', 'N', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Ativar em ios\?/);
  assert.match(r.out, /Ativar em android\?/);
  assert.strictEqual(r.env.nonprod.ios.value, 'true');
  assert.strictEqual(r.env.nonprod.android.value, 'false');
});

test('opção 1: chave ft_ com plataforma única só pergunta ativar naquela plataforma', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste', 'ios', 'N', '2.61.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Ativar em ios\?/);
  assert.doesNotMatch(r.out, /Ativar em android\?/);
  assert.strictEqual(r.env.nonprod.ios.value, 'false');
  assert.strictEqual(r.env.nonprod.android, undefined);
});

test('opção 1: chave rc_ não pergunta ativar por plataforma', () => {
  const r = menu(['1', 'rc_menu_teste', '1', 'baixa', 'Teste', 'ambas', '2.61.0', '2.63.0', '', 'valor-x', 'N'], { key: 'rc_menu_teste' });
  assert.strictEqual(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Ativar em/);
});

test('opção 1: plataforma "ambas" pergunta a versão mínima de ios e depois android, repetindo em formato inválido', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste', 'ambas', 's', 'N', 'x.y.z', '2.61.0', '2.63.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Versão mínima do app para ios \(x\.y\.z\): /);
  assert.match(r.out, /Versão mínima do app para android \(x\.y\.z\): /);
  assert.match(r.out, /"x\.y\.z" não é uma versão válida/);
  assert.deepStrictEqual(r.flag.minVersion, { ios: '2.61.0', android: '2.63.0' });
});

test('opção 1: plataforma única continua com uma única pergunta de versão mínima', () => {
  const r = menu(['1', 'ft_menu_teste', '1', 'baixa', 'Teste', 'android', 'N', '2.61.0', '', 'N']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Versão do app para ativar \(x\.y\.z\): /);
  assert.doesNotMatch(r.out, /Versão mínima do app para/);
  assert.strictEqual(r.flag.minVersion, '2.61.0');
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
