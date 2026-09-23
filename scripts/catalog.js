#!/usr/bin/env node
// Gera catalog/keys.json: todas as chaves de Remote Config e o estado em cada ambiente/plataforma.
// Uso: node scripts/catalog.js [--check]   (--check falha se o arquivo estiver desatualizado)
const fs = require('fs');
const path = require('path');
const { root, loadFlags, parseArgs } = require('./lib/common');
const { kindOf } = require('./lib/flags');

const flags = loadFlags().sort((a, b) => a.key.localeCompare(b.key));
const catalog = {
  _comment: 'Gerado por scripts/catalog.js. Não editar à mão: altere flags/*.json e rode npm run catalog.',
  total: flags.length,
  keys: flags.map((f) => ({
    key: f.key,
    kind: kindOf(f.key),
    group: f.group || null,
    valueType: f.valueType || 'STRING',
    criticality: f.criticality,
    owner: f.owner,
    description: f.description,
    environments: f.environments,
  })),
};
const out = JSON.stringify(catalog, null, 2) + '\n';
const file = path.join(root, 'catalog', 'keys.json');

if (parseArgs(process.argv.slice(2)).check) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current !== out) { console.error('✗ catalog/keys.json desatualizado. Rode: npm run catalog'); process.exit(1); }
  console.log(`✓ catalog/keys.json em dia (${flags.length} chave(s))`);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`✓ catalog/keys.json gerado (${flags.length} chave(s))`);
}
