#!/usr/bin/env node
// Cria flags/<key>.json. Uso: node scripts/new-flag.js <key> --owner <squad> --criticality <baixa|media|alta|critica> [--type BOOLEAN] [--description "..."]
const fs = require('fs');
const path = require('path');
const { root, parseArgs } = require('./lib/common');

const a = parseArgs(process.argv.slice(2));
const key = a._[0];
if (!key || !a.owner || !a.criticality) {
  console.error('Uso: node scripts/new-flag.js <key> --owner <squad> --criticality <baixa|media|alta|critica> [--type BOOLEAN] [--description "..."]');
  process.exit(1);
}
const file = path.join(root, 'flags', `${key}.json`);
if (fs.existsSync(file)) { console.error(`✗ flags/${key}.json já existe`); process.exit(1); }

const flag = {
  key,
  description: a.description || key,
  owner: a.owner,
  criticality: a.criticality,
  valueType: a.type || 'BOOLEAN',
  environments: {
    dev: { enabled: false },
    hml: { enabled: false },
    prod: { enabled: false, rolloutPercent: 0 },
  },
};
fs.writeFileSync(file, JSON.stringify(flag, null, 2) + '\n');
console.log(`✓ flags/${key}.json criado (tudo desligado). Rode: npm run validate`);
