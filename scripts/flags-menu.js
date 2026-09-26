#!/usr/bin/env node
// Menu interativo: escolhe criar/alterar/remover FF, coleta os dados, cria a branch, roda o comando e (se
// pedido) empurra e dá o link do PR com o corpo já preenchido. Só a opção 1 (criar) está implementada.
// `readline/promises`'s rl.question() só resolve a 1ª chamada quando o stdin inteiro chega de uma vez (pipe/teste);
// as perguntas seguintes ficam penduradas. Por isso lemos linha a linha pelo async iterator de `readline` "clássico".
const readline = require('readline');
const { spawnSync } = require('child_process');
const { root, loadTeams } = require('./lib/common');
const { KEY_RE, kindOf, PLATFORM_CHOICES, platformsOf, VERSION_RE } = require('./lib/flags');
const { prLink } = require('./lib/preflight');

const NAO_IMPLEMENTADO = 'ainda não implementado';
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });

async function pergunta(rl, texto) {
  process.stdout.write(texto);
  const r = await rl.linhas.next();
  return r.done ? '' : r.value.trim();
}

async function perguntaObrigatoria(rl, texto) {
  let r = '';
  while (!r) r = await pergunta(rl, texto);
  return r;
}

// Mostra as equipes numeradas e só aceita um número da lista; número inválido repete a lista.
async function perguntaEquipe(rl, equipes) {
  for (;;) {
    equipes.forEach((e, i) => console.log(`${i + 1} - ${e}`));
    const r = await pergunta(rl, 'Escolha o número da equipe: ');
    const n = Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= equipes.length) return equipes[n - 1];
    console.log(`✗ "${r}" não é um número válido (1 a ${equipes.length})`);
  }
}

// Só aceita android|ios|ambas; qualquer outra resposta repete a pergunta.
async function perguntaPlataformas(rl) {
  for (;;) {
    const r = await pergunta(rl, 'Plataformas (android|ios|ambas): ');
    if (PLATFORM_CHOICES.includes(r)) return r;
    console.log(`✗ "${r}" não é uma plataforma válida (use android, ios ou ambas)`);
  }
}

// Só para ft_: pergunta "Ativar em <plataforma>? (s/N)" para cada plataforma da lista escolhida.
async function perguntaValoresPorPlataforma(rl, platforms) {
  const valores = {};
  for (const p of platformsOf({ platforms })) {
    const r = await pergunta(rl, `Ativar em ${p}? (s/N) `);
    valores[p] = /^s(im)?$/i.test(r) ? 'true' : 'false';
  }
  return valores;
}

// Uma plataforma só: pergunta única (sem mudar o texto de hoje). "ambas": pergunta a versão de cada
// plataforma, validando x.y.z e repetindo até um valor válido.
async function perguntaVersaoMinima(rl, platforms) {
  const wanted = platformsOf({ platforms });
  const versoes = {};
  for (const p of wanted) {
    const texto = wanted.length > 1 ? `Versão mínima do app para ${p} (x.y.z): ` : 'Versão do app para ativar (x.y.z): ';
    for (;;) {
      const r = await pergunta(rl, texto);
      if (VERSION_RE.test(r)) { versoes[p] = r; break; }
      console.log(`✗ "${r}" não é uma versão válida (use x.y.z, ex.: 2.61.0)`);
    }
  }
  return versoes;
}

function corpoTemplateFeature({ key, team, criticality, platforms, minVersion, group, value }) {
  const linhas = [
    '## Tipo do PR',
    '- [x] feature/* — criar FF nova (NÃO PROD)',
    '',
    '## feature/* — FF nova',
    `- **Chave(s):** \`${key}\``,
    `- **Equipe dona:** ${team}`,
    `- **Criticidade:** ${criticality}`,
    `- **Plataformas:** ${platforms}`,
    `- **Versão mínima do app:** \`${typeof minVersion === 'string' ? minVersion : JSON.stringify(minVersion)}\``,
    `- **Valores por plataforma:** default \`${kindOf(key) === 'toggle' ? 'false' : value}\``,
    ...(group ? [`- **Grupo:** ${group}`] : []),
  ];
  return linhas.join('\n');
}

async function criarFF(rl) {
  const equipes = loadTeams();
  const key = await perguntaObrigatoria(rl, 'Chave da FF (ft_ toggle ou rc_ config): ');
  if (!KEY_RE.test(key)) { console.log(`✗ chave "${key}" inválida: precisa começar com ft_ ou rc_`); return; }
  const team = await perguntaEquipe(rl, equipes);
  const criticality = await perguntaObrigatoria(rl, 'Criticidade (baixa|media|critica): ');
  const description = await perguntaObrigatoria(rl, 'Descrição: ');
  const platforms = await perguntaPlataformas(rl);
  const valoresPorPlataforma = kindOf(key) === 'toggle' ? await perguntaValoresPorPlataforma(rl, platforms) : {};
  const versoesPorPlataforma = await perguntaVersaoMinima(rl, platforms);
  const group = await pergunta(rl, 'Grupo (opcional, Enter para pular): ');
  const value = kindOf(key) === 'config' ? await perguntaObrigatoria(rl, 'Valor padrão (rc_*): ') : undefined;

  const branch = `feature/${key.replace(/_/g, '-')}`;
  const existe = sh('git', ['rev-parse', '--verify', '--quiet', branch]);
  if (existe.status === 0) { console.log(`✗ a branch ${branch} já existe: escolha outra chave ou apague a branch antiga`); return; }

  const checkout = sh('git', ['checkout', '-b', branch]);
  if (checkout.status !== 0) { console.log(checkout.stderr || checkout.stdout); return; }
  console.log(`✓ branch ${branch} criada`);

  const minVersionArgs = versoesPorPlataforma.ios !== undefined && versoesPorPlataforma.android !== undefined
    ? ['--min-version-ios', versoesPorPlataforma.ios, '--min-version-android', versoesPorPlataforma.android]
    : ['--min-version', versoesPorPlataforma.ios ?? versoesPorPlataforma.android];
  const args = [
    'scripts/new-flag.js', key,
    '--team', team, '--criticality', criticality, '--description', description,
    '--platforms', platforms, ...minVersionArgs,
    ...(group ? ['--group', group] : []),
    ...(value !== undefined ? ['--value', value] : []),
    ...(valoresPorPlataforma.ios !== undefined ? ['--ios', valoresPorPlataforma.ios] : []),
    ...(valoresPorPlataforma.android !== undefined ? ['--android', valoresPorPlataforma.android] : []),
  ];
  const criado = sh('node', args, { stdio: 'inherit' });
  if (criado.status !== 0) { console.log('\n✗ new-flag.js recusou os dados acima; corrija e rode "npm run flags" de novo.'); return; }

  const catalogo = sh('node', ['scripts/catalog.js']);
  if (catalogo.status !== 0) { console.log(catalogo.stderr || catalogo.stdout); return; }
  console.log(catalogo.stdout.trim());
  const catalogFile = `catalog/${team}/keys.json`;
  const add = sh('git', ['add', `flags/${key}.json`, `env/nonprod/${key}.json`, catalogFile]);
  if (add.status !== 0) { console.log(add.stderr || add.stdout); return; }
  const commit = sh('git', ['commit', '-q', '-m', `feat: cria FF ${key}`]);
  if (commit.status !== 0) { console.log(commit.stderr || commit.stdout); return; }
  console.log(`✓ commit criado (feat: cria FF ${key})`);

  const enviar = await pergunta(rl, '\nEnviar (git push) e abrir o PR agora? (s/N) ');
  if (!/^s(im)?$/i.test(enviar)) {
    console.log(`Branch pronta localmente. Para enviar depois: git push -u origin ${branch}`);
    return;
  }
  const push = sh('git', ['push', '-u', 'origin', branch], { stdio: 'inherit' });
  if (push.status !== 0) { console.log('✗ o push falhou.'); return; }
  const remote = sh('git', ['remote', 'get-url', 'origin']).stdout.trim();
  const link = prLink(remote, branch);
  const minVersion = versoesPorPlataforma.ios !== undefined && versoesPorPlataforma.android !== undefined
    ? versoesPorPlataforma
    : (versoesPorPlataforma.ios ?? versoesPorPlataforma.android);
  const corpo = corpoTemplateFeature({ key, team, criticality, platforms, minVersion, group, value });
  if (link) console.log(`\nAbra o PR com o corpo já preenchido:\n${link}&body=${encodeURIComponent(corpo)}`);
  else console.log('\nBranch enviada. Abra o PR no GitHub.');
}

async function main() {
  const raw = readline.createInterface({ input: process.stdin });
  const rl = { linhas: raw[Symbol.asyncIterator]() };
  try {
    console.log('O que você quer fazer?');
    console.log('  1 - Criar FF nova');
    console.log('  2 - Alterar FF existente');
    console.log('  3 - Remover FF');
    const escolha = await pergunta(rl, 'Escolha (1/2/3): ');
    console.log('');
    if (escolha === '1') await criarFF(rl);
    else if (escolha === '2') console.log(`npm run update:flag — ${NAO_IMPLEMENTADO}`);
    else if (escolha === '3') console.log(`npm run remove:flag — ${NAO_IMPLEMENTADO}`);
    else console.log(`✗ opção "${escolha}" inválida`);
  } finally {
    raw.close();
  }
}

main();
