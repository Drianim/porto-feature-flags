const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8'));
const exists = (...p) => fs.existsSync(path.join(root, ...p));

const listJson = (dir, filter = () => true) =>
  (exists(dir) ? fs.readdirSync(path.join(root, dir)) : [])
    .filter((f) => f.endsWith('.json') && filter(f))
    .map((f) => ({ file: `${dir}/${f}`, data: readJson(dir, f) }));

// Estrutura por ambiente:
//   flags/<key>.json          definição (descrição, dono, criticidade, grupo)   -> feature/*
//   env/nonprod/<key>.json    { nonprod: {...} }                                  -> feature/*
//   env/prod/<key>.json       { prod: {...} }                                   -> release/*
// Sem env/prod: toggle fica desligado em PROD; rc_ não é publicado em PROD.
function mergeFlag(meta) {
  const np = exists('env', 'nonprod', `${meta.key}.json`) ? readJson('env', 'nonprod', `${meta.key}.json`) : {};
  const pr = exists('env', 'prod', `${meta.key}.json`) ? readJson('env', 'prod', `${meta.key}.json`) : {};
  const environments = { ...np, ...pr };
  if (!environments.prod && meta.key.startsWith('ft_')) environments.prod = { default: 'false' };
  return { ...meta, environments };
}

const loadFlags = () => listJson('flags').map((x) => mergeFlag(x.data));
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

module.exports = { root, readJson, exists, listJson, loadFlags, mergeFlag, loadRms, environments, parseArgs };
