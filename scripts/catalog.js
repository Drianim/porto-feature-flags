#!/usr/bin/env node
// Gera catalog/<equipe>/keys.json: as chaves de Remote Config da equipe e o estado em cada ambiente/plataforma.
// Um arquivo por equipe (nunca um único agregado) para que PRs de equipes diferentes nunca disputem o mesmo
// arquivo. Uso:
//   node scripts/catalog.js            grava catalog/<equipe>/keys.json para toda equipe de config/teams.json
//   node scripts/catalog.js --check    falha se algum catalog/<equipe>/keys.json estiver desatualizado
//   node scripts/catalog.js --all      imprime no stdout o agregado de todas as equipes; não grava nada
const fs = require('fs');
const path = require('path');
const { root, loadFlags, loadTeams, parseArgs } = require('./lib/common');
const { kindOf, valueTypeOf } = require('./lib/flags');

const toEntry = (f) => ({
  key: f.key,
  kind: kindOf(f.key),
  group: f.group || null,
  valueType: valueTypeOf(f),
  criticality: f.criticality,
  platforms: f.platforms,
  minVersion: f.minVersion,
  team: f.team,
  description: f.description,
  environments: f.environments,
});

const catalogFor = (flags) => {
  const sorted = flags.sort((a, b) => a.key.localeCompare(b.key));
  return {
    _comment: 'Gerado por scripts/catalog.js. Não editar à mão: altere flags/*.json e rode npm run catalog.',
    total: sorted.length,
    keys: sorted.map(toEntry),
  };
};

const serialize = (catalog) => JSON.stringify(catalog, null, 2) + '\n';
const fileFor = (team) => path.join(root, 'catalog', team, 'keys.json');

const flags = loadFlags();
const teams = loadTeams();
const args = parseArgs(process.argv.slice(2));

if (args.all) {
  console.log(serialize(catalogFor(flags)));
} else if (args.check) {
  const problems = [];
  for (const team of teams) {
    const out = serialize(catalogFor(flags.filter((f) => f.team === team)));
    const file = fileFor(team);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== out) problems.push(`catalog/${team}/keys.json desatualizado`);
  }
  if (problems.length) {
    console.error(`✗ ${problems.join('; ')}. Rode: npm run catalog`);
    process.exit(1);
  }
  console.log(`✓ catálogo em dia para ${teams.length} equipe(s)`);
} else {
  for (const team of teams) {
    const out = serialize(catalogFor(flags.filter((f) => f.team === team)));
    const file = fileFor(team);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out);
  }
  console.log(`✓ catálogo gerado para ${teams.length} equipe(s) (${flags.length} chave(s) no total)`);
}
