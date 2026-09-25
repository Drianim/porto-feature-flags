#!/usr/bin/env node
// Cria flags/<key>.json.
// Cria a definição (flags/) e os ambientes não produtivos (env/nonprod/). PROD fica para a release/*.
// Toda FF exige --platforms (android | ios | ambas) e --min-version (x.y.z: versão mínima do app com o código da FF).
// Toggle: node scripts/new-flag.js ft_minha_flag --team <equipe> --criticality <nivel> --description "..." --platforms ambas --min-version 2.61.0 [--group "Vitrine Hub"]
// Config: node scripts/new-flag.js rc_url_x --team <equipe> --criticality <nivel> --description "..." --platforms ios --min-version 2.61.0 --value "https://..."
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { root, parseArgs, loadTeams } = require('./lib/common');
const { KEY_RE, kindOf, targetingErrors, teamErrors } = require('./lib/flags');
const { branchKind } = require('./lib/preflight');

const a = parseArgs(process.argv.slice(2));
const key = a._[0];
if (a.owner !== undefined) { console.error('✗ --owner foi renomeado para --team (equipe dona da FF, da lista de config/teams.json)'); process.exit(1); }
if (!key || !KEY_RE.test(key) || !a.team || !a.criticality || !a.description || !a.platforms || !a['min-version']) {
  console.error('Uso: node scripts/new-flag.js <ft_|rc_chave> --team <equipe> --criticality <baixa|media|alta|critica> --description "..." --platforms <android|ios|ambas> --min-version <x.y.z> [--group "Nome"] [--value "..." (rc_)]');
  process.exit(1);
}
const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim();
if (branchKind(branch) !== 'feature') {
  console.error(`✗ branch "${branch}" não é feature/*: criar FF nova exige uma branch feature/* (troque com "git checkout -b feature/<nome>"; update/* altera FF existente, remove/* só apaga, chore/* não mexe em FF)`);
  process.exit(1);
}
const teamProblems = teamErrors({ team: a.team }, loadTeams());
if (teamProblems.length) { teamProblems.forEach((m) => console.error(`✗ ${m}`)); process.exit(1); }
const targetingProblems = targetingErrors({ platforms: a.platforms, minVersion: a['min-version'] });
if (targetingProblems.length) { targetingProblems.forEach((m) => console.error(`✗ ${m}`)); process.exit(1); }
const toggle = kindOf(key) === 'toggle';
if (!toggle && !a.value) { console.error('✗ chaves rc_ exigem --value'); process.exit(1); }
const file = path.join(root, 'flags', `${key}.json`);
if (fs.existsSync(file)) { console.error(`✗ flags/${key}.json já existe`); process.exit(1); }

const def = { default: toggle ? 'false' : a.value };
const flag = {
  key,
  description: a.description,
  ...(a.group ? { group: a.group } : {}),
  team: a.team,
  criticality: a.criticality,
  platforms: a.platforms,
  minVersion: a['min-version'],
};
const envFile = path.join(root, 'env', 'nonprod', `${key}.json`);
fs.mkdirSync(path.dirname(envFile), { recursive: true });
fs.writeFileSync(file, JSON.stringify(flag, null, 2) + '\n');
fs.writeFileSync(envFile, JSON.stringify({ nonprod: { ...def } }, null, 2) + '\n');
console.log(`✓ flags/${key}.json e env/nonprod/${key}.json criados. PROD é configurado depois, numa release/* (env/prod/${key}.json + RM).`);
console.log('  Rode: npm run catalog && npm run validate');
