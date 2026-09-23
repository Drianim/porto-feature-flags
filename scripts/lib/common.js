const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8'));

const listJson = (dir, filter = () => true) =>
  fs.readdirSync(path.join(root, dir))
    .filter((f) => f.endsWith('.json') && filter(f))
    .map((f) => ({ file: `${dir}/${f}`, data: readJson(dir, f) }));

const loadFlags = () => listJson('flags').map((x) => x.data);
const loadRms = () => listJson('rm', (f) => /^RM-.*\.json$/.test(f)).map((x) => x.data);
const environments = () => readJson('config', 'environments.json');

const parseArgs = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else { out[k] = next; i++; }
    } else out._.push(argv[i]);
  }
  return out;
};

module.exports = { root, readJson, listJson, loadFlags, loadRms, environments, parseArgs };
