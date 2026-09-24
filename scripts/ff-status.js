#!/usr/bin/env node
// Status das FFs (SOMENTE LEITURA): o que está ligado, em quais plataformas, a partir de qual versão, em que porcentagem
// e se o Firebase NÃO PROD confere com a main. Sem credencial (ou com --offline) responde só com o repositório.
// Uso: node scripts/ff-status.js <list|detail|rollout|summary|sync|history|stale> [chave]
//        [--env nonprod|prod] [--platform ios|android] [--owner <squad>] [--search <termo>] [--criticality <nível>]
//        [--limit N] [--json] [--offline]
// Env: FIREBASE_SA_KEY_NONPROD (opcional). Usa só getTemplate e listVersions: nenhuma escrita no Firebase.
const { loadFlags, loadRms, environments, parseArgs } = require('./lib/common');
const S = require('./lib/status');

const USAGE = `Uso: node scripts/ff-status.js <${'list|detail|rollout|summary|sync|history|stale'}> [chave] [opções]
  list                 todas as FFs: plataformas, versão mínima, estado por plataforma e sincronia
  detail <chave>       ficha completa de uma FF (o que o app recebe e o que está no Firebase)
  rollout <chave>      percentual por plataforma e, em PROD, o estágio do RM
  summary              contagens por estado, plataforma, tipo e criticidade + última publicação
  sync                 main x Firebase por FF e chaves que só existem no Firebase (exige Firebase)
  history [--limit N]  últimas versões publicadas no Firebase (exige Firebase)
  stale                candidatas a limpeza
Opções: --env nonprod|prod  --platform ios|android  --owner <squad>  --search <termo>  --criticality <nível>  --json  --offline`;

async function connectRemote(cfgEnv) {
  const { connect } = require('./lib/remote-config');
  return connect(cfgEnv);
}

// deps é injetável para teste: { loadFlags, loadRms, environments, connect, now, hasKey, stdout, stderr }
async function run(argv, deps = {}) {
  const d = { loadFlags, loadRms, environments, connect: connectRemote, now: () => new Date(), hasKey: (cfgEnv) => Boolean(process.env[cfgEnv.keyVar]), stdout: console.log, stderr: console.error, ...deps };
  const args = parseArgs(argv);
  if (!args._.length || args._[0] === 'help' || args.help) { d.stdout(USAGE); return 0; }
  let q;
  try { q = S.parseStatusArgs(args); } catch (e) { d.stderr(`✗ ${e.message}\n${USAGE}`); return 1; }

  try {
    const cfgEnv = d.environments()[q.env];
    const flags = d.loadFlags();
    const rms = d.loadRms();
    const now = d.now();
    const timeGated = Boolean(cfgEnv.timeGated);
    const allRows = flags.map((f) => S.flagRow(f, q.env, { rms, now, timeGated }));
    const rows = S.filterRows(allRows, q.filters);
    const flagOf = (key) => flags.find((f) => f.key === key);

    // Firebase: só NÃO PROD (PROD ainda não tem projeto), só com credencial e sem --offline.
    const wantRemote = q.env === 'nonprod' && !q.offline && d.hasKey(cfgEnv);
    const needsRemote = q.cmd === 'sync' || q.cmd === 'history';
    if (needsRemote && !wantRemote) {
      d.stderr(`✗ ${q.cmd} consulta o Firebase NÃO PROD: defina ${cfgEnv.keyVar}${q.offline ? ', sem --offline' : ''}${q.env !== 'nonprod' ? ' e use --env nonprod' : ''}.`);
      return 1;
    }
    let rc = null; let template = null;
    if (wantRemote && q.cmd !== 'rollout') {
      ({ rc } = await d.connect(cfgEnv));
      template = await rc.getTemplate();
    }
    const syncOne = (f) => S.syncOf(f, q.env, template, cfgEnv, rms, now);
    const syncMap = template ? Object.fromEntries(rows.map((r) => [r.key, syncOne(flagOf(r.key))])) : null;
    const stateMap = syncMap ? Object.fromEntries(Object.entries(syncMap).map(([k, v]) => [k, v.state])) : null;
    const emit = (json, text) => d.stdout(q.json ? JSON.stringify({ command: q.cmd, env: q.env, firebase: Boolean(template), ...json }, null, 2) : text.trimEnd());

    if (q.cmd === 'list') {
      emit({ count: rows.length, flags: rows.map((r) => ({ ...r, sync: syncMap ? syncMap[r.key].state : null })) }, `## FFs em ${q.env} (${rows.length})\n\n${S.renderTable(rows, { sync: stateMap })}`);
    } else if (q.cmd === 'detail' || q.cmd === 'rollout') {
      const flag = flagOf(q.key);
      if (!flag) { d.stderr(`✗ FF "${q.key}" não existe no repositório. Use: node scripts/ff-status.js list --search <termo>`); return 1; }
      const row = allRows.find((r) => r.key === q.key);
      const served = S.servedFor(flag, q.env);
      if (q.cmd === 'rollout') {
        const rm = rms.find((r) => (r.flags || []).includes(q.key) && (r.targetEnvironments || []).includes(q.env));
        emit({ flag: row, served, rm: rm || null }, S.renderRollout(row, { flag, env: q.env, rm, now }));
      } else {
        const sync = template ? syncOne(flag) : null;
        emit({ flag: row, served, remote: template ? S.remoteInfo(template, q.key) : null, sync }, S.renderDetail(row, { flag, env: q.env, sync, template }));
      }
    } else if (q.cmd === 'summary') {
      let lastVersion = null;
      if (template) lastVersion = template.version || ((await rc.listVersions({ pageSize: 1 })).versions || [])[0] || null;
      const summary = S.summarize(rows);
      emit({ summary, lastVersion }, S.renderSummary(summary, { lastVersion }));
    } else if (q.cmd === 'sync') {
      const extraKeys = S.extras(template, flags);
      emit({ sync: syncMap, extras: extraKeys }, S.renderSync({ rows, sync: syncMap, extras: extraKeys }));
    } else if (q.cmd === 'history') {
      const versions = (await rc.listVersions({ pageSize: q.limit })).versions || [];
      emit({ versions }, `## Últimas ${versions.length} versões publicadas\n\n${S.renderHistory(versions)}`);
    } else if (q.cmd === 'stale') {
      const stale = S.staleCandidates(rows, template ? S.extras(template, flags) : []);
      emit(stale, S.renderStale(stale) + (template ? '' : '\n> Firebase não consultado: chaves fora do repositório não foram verificadas.\n'));
    }
    return 0;
  } catch (e) {
    d.stderr(`✗ ${e.message}`);
    return 1;
  }
}

if (require.main === module) run(process.argv.slice(2)).then((code) => process.exit(code));
module.exports = { run };
