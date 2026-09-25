#!/usr/bin/env node
// Menu interativo: escolhe criar/alterar/remover FF, coleta os dados, cria a branch, roda o comando e (se
// pedido) empurra e dá o link do PR com o corpo já preenchido. Só a opção 1 (criar) está implementada.
// `readline/promises`'s rl.question() só resolve a 1ª chamada quando o stdin inteiro chega de uma vez (pipe/teste);
// as perguntas seguintes ficam penduradas. Por isso lemos linha a linha pelo async iterator de `readline` "clássico".
const readline = require('readline');
const { spawnSync } = require('child_process');
const { root, loadTeams } = require('./lib/common');
const { KEY_RE, kindOf } = require('./lib/flags');
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
    `- **Versão mínima do app:** \`${minVersion}\``,
    `- **Valores por plataforma:** default \`${kindOf(key) === 'toggle' ? 'false' : value}\``,
    ...(group ? [`- **Grupo:** ${group}`] : []),
  ];
  return linhas.join('\n');
}

async function criarFF(rl) {
  const equipes = loadTeams();
  const key = await perguntaObrigatoria(rl, 'Chave da FF (ft_ toggle ou rc_ config): ');
  if (!KEY_RE.test(key)) { console.log(`✗ chave "${key}" inválida: precisa começar com ft_ ou rc_`); return; }
  const team = await perguntaObrigatoria(rl, `Equipe dona (${equipes.join(', ')}): `);
  const criticality = await perguntaObrigatoria(rl, 'Criticidade (baixa|media|alta|critica): ');
  const description = await perguntaObrigatoria(rl, 'Descrição: ');
  const platforms = await perguntaObrigatoria(rl, 'Plataformas (android|ios|ambas): ');
  const minVersion = await perguntaObrigatoria(rl, 'Versão do app para ativar (x.y.z): ');
  const group = await pergunta(rl, 'Grupo (opcional, Enter para pular): ');
  const value = kindOf(key) === 'config' ? await perguntaObrigatoria(rl, 'Valor padrão (rc_*): ') : undefined;

  const branch = `feature/${key.replace(/_/g, '-')}`;
  const existe = sh('git', ['rev-parse', '--verify', '--quiet', branch]);
  if (existe.status === 0) { console.log(`✗ a branch ${branch} já existe: escolha outra chave ou apague a branch antiga`); return; }

  const checkout = sh('git', ['checkout', '-b', branch]);
  if (checkout.status !== 0) { console.log(checkout.stderr || checkout.stdout); return; }
  console.log(`✓ branch ${branch} criada`);

  const args = [
    'scripts/new-flag.js', key,
    '--team', team, '--criticality', criticality, '--description', description,
    '--platforms', platforms, '--min-version', minVersion,
    ...(group ? ['--group', group] : []),
    ...(value !== undefined ? ['--value', value] : []),
  ];
  const criado = sh('node', args, { stdio: 'inherit' });
  if (criado.status !== 0) { console.log('\n✗ new-flag.js recusou os dados acima; corrija e rode "npm run flags" de novo.'); return; }

  const enviar = await pergunta(rl, '\nEnviar (git push) e abrir o PR agora? (s/N) ');
  if (!/^s(im)?$/i.test(enviar)) {
    console.log(`Branch pronta localmente. Para enviar depois: git push -u origin ${branch}`);
    return;
  }
  const push = sh('git', ['push', '-u', 'origin', branch], { stdio: 'inherit' });
  if (push.status !== 0) { console.log('✗ o push falhou.'); return; }
  const remote = sh('git', ['remote', 'get-url', 'origin']).stdout.trim();
  const link = prLink(remote, branch);
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
