#!/usr/bin/env node
// Confere o formato de todas as specs em docs/specs/ (SDD dos scripts). Uso: node scripts/check-specs.js  (npm run specs)
const fs = require('fs');
const path = require('path');
const { root } = require('./lib/common');
const { checkSpec } = require('./lib/specs');

const dir = path.join(root, 'docs', 'specs');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
let bad = 0;
for (const f of files) {
  const problems = checkSpec(f, fs.readFileSync(path.join(dir, f), 'utf8'));
  problems.forEach((p) => console.error(`✗ docs/specs/${f}: ${p}`));
  bad += problems.length;
}
if (bad) { console.error(`✗ ${bad} problema(s) nas specs`); process.exit(1); }
console.log(`✓ ${files.length} spec(s) no formato`);
