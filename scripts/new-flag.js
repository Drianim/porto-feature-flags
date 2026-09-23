#!/usr/bin/env node
// Cria flags/<key>.json.
// Toggle: node scripts/new-flag.js ft_minha_flag --owner <squad> --criticality <nivel> --description "..." [--group "Vitrine Hub"]
// Config: node scripts/new-flag.js rc_url_x --owner <squad> --criticality <nivel> --description "..." --value "https://..."
const fs = require('fs');
const path = require('path');
const { root, parseArgs } = require('./lib/common');
const { KEY_RE, kindOf } = require('./lib/flags');

const a = parseArgs(process.argv.slice(2));
const key = a._[0];
if (!key || !KEY_RE.test(key) || !a.owner || !a.criticality || !a.description) {
  console.error('Uso: node scripts/new-flag.js <ft_|rc_chave> --owner <squad> --criticality <baixa|media|alta|critica> --description "..." [--group "Nome"] [--value "..." (rc_)]');
  process.exit(1);
}
const toggle = kindOf(key) === 'toggle';
if (!toggle && !a.value) { console.error('✗ chaves rc_ exigem --value'); process.exit(1); }
const file = path.join(root, 'flags', `${key}.json`);
if (fs.existsSync(file)) { console.error(`✗ flags/${key}.json já existe`); process.exit(1); }

const def = { default: toggle ? 'false' : a.value };
const flag = {
  key,
  description: a.description,
  ...(a.group ? { group: a.group } : {}),
  owner: a.owner,
  criticality: a.criticality,
  valueType: 'STRING',
  environments: { dev: { ...def }, hml: { ...def }, prod: { ...def } },
};
fs.writeFileSync(file, JSON.stringify(flag, null, 2) + '\n');
console.log(`✓ flags/${key}.json criado${toggle ? ' (desligada em todos os ambientes)' : ''}. Rode: npm run catalog && npm run validate`);
