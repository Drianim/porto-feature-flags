const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mantém a visibilidade dos processos: cada processo criado neste repositório tem de estar no README, no "Mapa dos processos"
// do CLAUDE.md (sempre carregado) e na skill dona; e nenhum texto pode citar um comando que não existe mais.
// PROCESSO NOVO? Coloque-o nesta lista (o passo "Documentar" do SDD manda) e escreva-o nos três lugares.
const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const README = read('README.md');
const CLAUDE = read('CLAUDE.md');
const SKILLS = Object.fromEntries(['feature-flag', 'ff-status', 'sdd-scripts'].map((s) => [s, read('.claude', 'skills', s, 'SKILL.md')]));

// [nome (igual ao do mapa), skill dona, pistas no README, pistas na skill dona]
const PROCESSOS = [
  ['Criar FF nova', 'feature-flag', ['feature/*', 'new:flag'], ['new:flag', 'feature/*']],
  ['Menu interativo para criar/alterar/remover FF', 'feature-flag', ['npm run flags'], ['npm run flags']],
  ['Alterar FF existente', 'feature-flag', ['update/*'], ['update/*']],
  ['Remover FF', 'feature-flag', ['remove/*', 'remove-flags'], ['remove/*', 'remove-flags']],
  ['Levar para PROD (RM)', 'feature-flag', ['release/*', 'new:rm'], ['new:rm', 'release/*']],
  ['Aprovação do deploy (ambiente nonprod)', 'feature-flag', ['ambiente `nonprod`'], ['ambiente `nonprod`']],
  ['Preflight e npm run pr', 'feature-flag', ['npm run preflight', 'npm run pr'], ['npm run preflight', 'npm run pr']],
  ['Hook pre-push', 'feature-flag', ['npm run hooks'], ['npm run hooks']],
  ['Template de PR', 'feature-flag', ['pull_request_template'], ['pull_request_template']],
  ['Criar a branch com o prefixo certo', 'feature-flag', ['nome completo com o prefixo'], ['nome completo com o prefixo']],
  ['Plataforma e versão mínima', 'feature-flag', ['minVersion'], ['minVersion']],
  ['Equipe e permissão', 'feature-flag', ['check-ownership', 'teams.json'], ['check-ownership', 'teams.json']],
  ['Reconferência e reversão automática', 'feature-flag', ['revert/'], ['revert/']],
  ['Sincronia main = Firebase', 'feature-flag', ['sync-nonprod', 'verify-sync'], ['sync-nonprod', 'verify-sync']],
  ['Teste real de plataforma', 'feature-flag', ['test-platforms'], ['test-platforms']],
  ['chore/* e revert/* (só admin)', 'feature-flag', ['só admin'], ['só admin']],
  ['Merge bloqueado até tudo verde', 'feature-flag', ['Tudo verde', 'pr.yml'], ['Tudo verde']],
  ['SDD nos scripts', 'sdd-scripts', ['docs/specs'], ['docs/specs', 'chore/*']],
  ['Consultar o status', 'ff-status', ['ff-status'], ['scripts/ff-status.js']],
  ['Código do app (templates)', 'feature-flag', ['codigo-app'], ['codigo-app']],
  ['Catálogo de chaves', 'feature-flag', ['npm run catalog'], ['npm run catalog']],
  ['Escopo da PoC e credenciais', 'feature-flag', ['FIREBASE_SA_KEY_NONPROD'], ['FIREBASE_SA_KEY_NONPROD', 'NÃO PROD']],
  ['Rollback', 'feature-flag', ['rollback'], ['rollback']],
  ['Criticidade e rollout por estágio', 'feature-flag', ['rolloutPlan'], ['rolloutPlan']],
  ['Validar template no Firebase (sem publicar)', 'feature-flag', ['--validate'], ['--validate']],
  ['Campanha de teste do processo', 'feature-flag', ['testes-do-processo'], ['testes-do-processo']],
  ['PR vermelho (nunca mesclar)', 'feature-flag', ['PR vermelho'], ['PR vermelho']],
];
const has = (text, pista) => text.toLowerCase().includes(pista.toLowerCase());
const mapa = (() => { const m = /^## Mapa dos processos\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(CLAUDE); return m ? m[1] : ''; })();

test('o CLAUDE.md tem o Mapa dos processos com todos os processos', () => {
  assert.ok(mapa.length > 0, 'CLAUDE.md sem a seção "## Mapa dos processos"');
  const faltam = PROCESSOS.filter(([nome]) => !has(mapa, nome)).map(([nome]) => nome);
  assert.deepStrictEqual(faltam, [], `processos fora do mapa do CLAUDE.md: ${faltam.join('; ')}`);
});

test('o README cobre todos os processos', () => {
  const faltam = PROCESSOS.flatMap(([nome, , pistas]) => pistas.filter((p) => !has(README, p)).map((p) => `${nome} (${p})`));
  assert.deepStrictEqual(faltam, [], `README sem: ${faltam.join('; ')}`);
});

test('a skill dona cobre cada processo', () => {
  const faltam = PROCESSOS.flatMap(([nome, dona, , pistas]) => pistas.filter((p) => !has(SKILLS[dona], p)).map((p) => `${nome} → ${dona} (${p})`));
  assert.deepStrictEqual(faltam, [], `skills sem: ${faltam.join('; ')}`);
});

test('todo comando citado nas skills, no CLAUDE.md e no README existe', () => {
  const pkg = JSON.parse(read('package.json')).scripts;
  const textos = { 'README.md': README, 'CLAUDE.md': CLAUDE, ...Object.fromEntries(Object.entries(SKILLS).map(([s, t]) => [`skill ${s}`, t])) };
  const problemas = [];
  for (const [onde, texto] of Object.entries(textos)) {
    for (const m of texto.matchAll(/npm run ([a-z][a-z:-]*)/g)) if (!(m[1] in pkg)) problemas.push(`${onde}: npm run ${m[1]} não existe`);
    for (const m of texto.matchAll(/\bscripts\/([A-Za-z0-9_./-]+\.(?:js|sh))/g)) {
      if (m[1].includes('*') || m[1].includes('<')) continue;
      if (!fs.existsSync(path.join(root, 'scripts', m[1]))) problemas.push(`${onde}: scripts/${m[1]} não existe`);
    }
  }
  assert.deepStrictEqual([...new Set(problemas)], []);
});

test('a description de cada skill traz as palavras que a acionam', () => {
  const desc = (s) => /^description:\s*(.+)$/m.exec(SKILLS[s])[1];
  const need = {
    'feature-flag': ['criar', 'alterar', 'remover', 'PROD', 'equipe', 'permissão', 'versão mínima', 'código do app', 'rollback', 'pipeline', 'PR', 'branch'],
    'ff-status': ['status', 'sincronia', 'histórico', 'somente leitura'],
    'sdd-scripts': ['spec', 'scripts', 'pipeline', 'documentação'],
  };
  for (const [s, palavras] of Object.entries(need)) {
    const falta = palavras.filter((p) => !has(desc(s), p));
    assert.deepStrictEqual(falta, [], `description de ${s} sem: ${falta.join(', ')}`);
  }
});

test('as três skills se referenciam e apontam para o Mapa dos processos', () => {
  const irmas = { 'feature-flag': ['ff-status', 'sdd-scripts'], 'ff-status': ['feature-flag'], 'sdd-scripts': ['feature-flag', 'ff-status'] };
  for (const [s, lista] of Object.entries(irmas)) {
    for (const outra of lista) assert.ok(has(SKILLS[s], outra), `skill ${s} não cita ${outra}`);
    assert.ok(has(SKILLS[s], 'Mapa dos processos'), `skill ${s} não aponta para o Mapa dos processos`);
  }
});

test('o SDD manda colocar processo novo no mapa e no teste de cobertura', () => {
  for (const [onde, texto] of [['docs/sdd/README.md', read('docs', 'sdd', 'README.md')], ['skill sdd-scripts', SKILLS['sdd-scripts']]]) {
    assert.ok(has(texto, 'Mapa dos processos'), `${onde} não cita o Mapa dos processos`);
    assert.ok(has(texto, 'processos.test.js'), `${onde} não cita processos.test.js`);
  }
});
