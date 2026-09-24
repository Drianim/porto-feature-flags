#!/usr/bin/env node
// Teste real do filtro por plataforma: registra (ou reaproveita) um app Android e um iOS de teste no projeto,
// pede ao PRÓPRIO Firebase para avaliar o Remote Config como cada plataforma (endpoint de fetch dos apps)
// e compara com o que o repositório manda. Depois remove os apps que criou.
// Uso: node scripts/test-platforms.js nonprod [--keys a,b] [--samples 60] [--keep-apps]
// Env: FIREBASE_SA_KEY_NONPROD. Só ambientes NÃO PROD.
const crypto = require('crypto');
const { loadFlags, environments, parseArgs } = require('./lib/common');
const { rules } = require('./lib/flags');

const args = parseArgs(process.argv.slice(2));
const env = args._[0];
const cfgEnv = environments()[env];
if (!cfgEnv || cfgEnv.timeGated) { console.error('Uso: node scripts/test-platforms.js nonprod [--keys a,b] [--samples 60] [--keep-apps]'); process.exit(1); }
const SAMPLES = Number(args.samples || 30);
const PKG = 'com.poc.rcteste';
const only = args.keys ? String(args.keys).split(',') : null;

const admin = require('firebase-admin');
const projectId = process.env[cfgEnv.projectVar] || cfgEnv.projectId;
if (!process.env[cfgEnv.keyVar]) { console.error(`✗ ${cfgEnv.keyVar} não definido`); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(process.env[cfgEnv.keyVar], 'base64').toString('utf8'))), projectId });

const MGMT = `https://firebase.googleapis.com/v1beta1/projects/${projectId}`;
let token;
async function call(method, url, body, headers = {}, attempt = 0) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 429 && attempt < 5) {
    const wait = 15000 + attempt * 10000;
    console.log(`  limite de requisições (429): aguardando ${wait / 1000}s...`);
    await new Promise((res) => setTimeout(res, wait));
    return call(method, url, body, headers, attempt + 1);
  }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${url.replace(/\?.*/, '')} -> ${r.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const mgmt = (method, path, body) => call(method, `${MGMT}${path}`, body, { Authorization: `Bearer ${token}` });

async function waitOp(op) {
  let o = op;
  for (let i = 0; i < 40 && !o.done; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    o = await call('GET', `https://firebase.googleapis.com/v1beta1/${op.name}`, null, { Authorization: `Bearer ${token}` });
  }
  if (!o.done) throw new Error('operação não terminou');
  if (o.error) throw new Error(JSON.stringify(o.error));
  return o.response;
}

async function ensureApp(platform) {
  const kind = platform === 'android' ? 'androidApps' : 'iosApps';
  const listed = (await mgmt('GET', `/${kind}`)).apps || [];
  const found = listed.find((a) => (a.packageName || a.bundleId) === PKG);
  // o pacote com.poc.rcteste é exclusivo deste teste: um app já existente com ele é lixo de execução anterior e também é removido
  if (found) return { appId: found.appId, created: true, reused: true, kind };
  const body = platform === 'android' ? { displayName: 'rc-teste-android', packageName: PKG } : { displayName: 'rc-teste-ios', bundleId: PKG };
  const resp = await waitOp(await mgmt('POST', `/${kind}`, body));
  return { appId: resp.appId, created: true, kind };
}

async function apiKeyFor(platform, app) {
  const cfg = await mgmt('GET', `/${app.kind}/${app.appId}/config`);
  const text = Buffer.from(cfg.configFileContents, 'base64').toString('utf8');
  if (platform === 'android') return JSON.parse(text).client[0].api_key[0].current_key;
  return /<key>API_KEY<\/key>\s*<string>([^<]+)<\/string>/.exec(text)[1];
}

const newFid = () => { const b = crypto.randomBytes(17); b[0] = 0x70 | (b[0] & 0x0f); return b.toString('base64url').slice(0, 22); };

async function fetchAs(platform, app, apiKey, projectNumber) {
  const fid = newFid();
  const inst = await call('POST', `https://firebaseinstallations.googleapis.com/v1/projects/${projectId}/installations`,
    { fid, authVersion: 'FIS_v2', appId: app.appId, sdkVersion: platform === 'android' ? 'a:17.0.0' : 'i:10.0.0' }, { 'x-goog-api-key': apiKey });
  const headers = { 'x-goog-api-key': apiKey, ...(platform === 'ios' ? { 'X-Ios-Bundle-Identifier': PKG } : { 'X-Android-Package': PKG }) };
  const res = await call('POST', `https://firebaseremoteconfig.googleapis.com/v1/projects/${projectNumber}/namespaces/firebase:fetch`, {
    appInstanceId: fid, appInstanceIdToken: inst.authToken.token, appId: app.appId,
    countryCode: 'BR', languageCode: 'pt-BR', platformVersion: platform === 'android' ? '33' : '17', timeZone: 'America/Sao_Paulo',
    appVersion: '1.0', appBuild: '1', packageName: PKG, sdkVersion: '21.0.0',
  }, headers);
  return res.entries || {};
}

async function pool(n, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < n) { const k = i++; out[k] = await fn(k); } }));
  return out;
}

const apps = {};
let cleaned = false;
async function cleanup() {
  if (cleaned || args['keep-apps']) return;
  cleaned = true;
  for (const p of ['android', 'ios']) {
    if (!apps[p] || !apps[p].created) continue;
    try { await mgmt('POST', `/${apps[p].kind}/${apps[p].appId}:remove`, { immediate: true }); console.log(`app ${p} de teste removido`); }
    catch (e) { console.log(`! não consegui remover o app ${p} (${apps[p].appId}): ${e.message}`); }
  }
}

(async () => {
  token = (await admin.app().options.credential.getAccessToken()).access_token;
  const flags = loadFlags().filter((f) => f.environments[env] && (!only || only.includes(f.key)));
  const projectNumber = (await mgmt('GET', '')).projectNumber;
  for (const p of ['android', 'ios']) {
    apps[p] = await ensureApp(p);
    apps[p].key = await apiKeyFor(p, apps[p]);
    console.log(`app ${p}: ${apps[p].appId} (${apps[p].reused ? 'reaproveitado de execução anterior' : 'criado agora'})`);
  }
  await new Promise((r) => setTimeout(r, 4000)); // deixa as chaves de API propagarem

  const needsSamples = flags.some((f) => Object.values(rules(f, env).overrides).some((o) => o.rolloutPercent !== undefined && o.rolloutPercent < 100 && o.rolloutPercent > 0));
  const results = {};
  for (const p of ['android', 'ios']) {
    const n = needsSamples ? SAMPLES : 3;
    results[p] = await pool(n, 2, async () => { const e = await fetchAs(p, apps[p], apps[p].key, projectNumber); await new Promise((r) => setTimeout(r, 900)); return e; });
  }

  let bad = 0;
  await cleanup();
  console.log(`\n${'FF'.padEnd(20)} ${'plataforma'.padEnd(10)} ${'esperado'.padEnd(26)} obtido`);
  for (const f of flags) {
    const { defaultValue, overrides } = rules(f, env);
    for (const p of ['android', 'ios']) {
      const o = overrides[p];
      const got = results[p].map((e) => e[f.key]);
      const trueShare = Math.round((got.filter((v) => v === 'true').length / got.length) * 100);
      let ok; let expected;
      if (got.every((v) => v === undefined)) { ok = false; expected = '(ainda não publicada)'; }
      else if (o && o.rolloutPercent > 0 && o.rolloutPercent < 100) {
        expected = `~${o.rolloutPercent}% recebem ${o.value}`; ok = Math.abs(trueShare - o.rolloutPercent) <= 25 && got.every((v) => v === o.value || v === defaultValue);
      } else { const want = o && o.rolloutPercent !== 0 ? o.value : defaultValue; expected = `sempre ${want}`; ok = got.every((v) => v === want); }
      const obtido = got.every((v) => v === undefined) ? 'ausente' : (new Set(got).size === 1 ? `sempre ${got[0]}` : `${trueShare}% true (${got.length} instâncias)`);
      if (!ok) bad++;
      console.log(`${f.key.padEnd(20)} ${p.padEnd(10)} ${expected.padEnd(26)} ${obtido} ${ok ? 'OK' : 'DIVERGE'}`);
    }
  }

  if (bad) { console.error(`\n✗ ${bad} combinação(ões) fora do esperado`); process.exit(1); }
  console.log('\n✓ o filtro por plataforma se comporta como o repositório manda');
})().catch(async (e) => { console.error(`✗ ${e.message}`); await cleanup(); process.exit(1); });
