const test = require('node:test');
const assert = require('node:assert');
const { build, apply } = require('./remote-config');
const { flagRow, filterRows, syncOf, extras, summarize, staleCandidates, servedFor, remoteInfo, renderTable, renderDetail, renderSummary, renderHistory, renderSync } = require('./status');

const base = { description: 'd', team: 'squad-a', criticality: 'baixa', platforms: 'ambas', minVersion: '2.61.0' };
const ambos = { ...base, key: 'ft_ambos', group: 'G', environments: { nonprod: { default: 'false', ios: { value: 'true' }, android: { value: 'true' } } } };
const ios50 = { ...base, key: 'ft_ios50', platforms: 'ios', team: 'squad-b', criticality: 'alta', environments: { nonprod: { default: 'false', ios: { value: 'true', rolloutPercent: 50 } } } };
const off = { ...base, key: 'ft_off', environments: { nonprod: { default: 'false' } } };
const allOn = { ...base, key: 'ft_todas', environments: { nonprod: { default: 'true' } } };
const url = { ...base, key: 'rc_url', platforms: 'android', minVersion: { android: '2.58.3' }, environments: { nonprod: { default: 'https://x' } } };
const flags = [ambos, ios50, off, allOn, url];
const cfg = { timeGated: false };
const rows = flags.map((f) => flagRow(f, 'nonprod', {}));
const template = () => apply({ parameters: {}, parameterGroups: {}, conditions: [] }, build(flags, [], 'nonprod', cfg));

// ---- Task 1: linha de status
test('FF ligada nas duas plataformas', () => {
  const r = rows[0];
  assert.deepStrictEqual([r.key, r.kind, r.valueType, r.platforms, r.minVersion], ['ft_ambos', 'toggle', 'BOOLEAN', 'ambas', '2.61.0']);
  assert.deepStrictEqual(r.perPlatform.ios, { state: 'ligada', percent: 100, value: 'true' });
  assert.deepStrictEqual(r.perPlatform.android, { state: 'ligada', percent: 100, value: 'true' });
});
test('FF só de iOS em 50%: Android é n/a', () => {
  assert.deepStrictEqual(rows[1].perPlatform.ios, { state: 'ligada', percent: 50, value: 'true' });
  assert.strictEqual(rows[1].perPlatform.android.state, 'n/a');
});
test('toggle sem override está desligado; default "true" liga em todas as plataformas', () => {
  assert.strictEqual(rows[2].perPlatform.ios.state, 'desligada');
  assert.strictEqual(rows[2].perPlatform.android.state, 'desligada');
  assert.deepStrictEqual([rows[3].perPlatform.ios.percent, rows[3].perPlatform.android.percent], [100, 100]);
});
test('rc_ mostra o valor e a versão mínima por plataforma vira texto', () => {
  assert.deepStrictEqual(rows[4].perPlatform.android, { state: 'valor', percent: 100, value: 'https://x' });
  assert.strictEqual(rows[4].perPlatform.ios.state, 'n/a');
  assert.strictEqual(rows[4].minVersion, 'android 2.58.3');
  assert.strictEqual(rows[4].valueType, 'STRING');
});
test('PROD: antes do horário do RM aguarda; depois usa o estágio (limitado pelo teto)', () => {
  const f = { ...base, key: 'ft_p', environments: { nonprod: { default: 'false' }, prod: { default: 'false', ios: { value: 'true' }, android: { value: 'true', rolloutPercent: 3 } } } };
  const rm = { flags: ['ft_p'], targetEnvironments: ['prod'], prodSchedule: '2026-10-01T14:00:00-03:00', rolloutPlan: [{ percent: 5, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }] };
  const before = flagRow(f, 'prod', { rms: [rm], now: new Date('2026-10-01T10:00:00-03:00') });
  assert.strictEqual(before.perPlatform.ios.state, 'aguardando');
  const during = flagRow(f, 'prod', { rms: [rm], now: new Date('2026-10-01T14:10:00-03:00') });
  assert.deepStrictEqual([during.perPlatform.ios.state, during.perPlatform.ios.percent, during.perPlatform.android.percent], ['ligada', 5, 3]);
  assert.deepStrictEqual(flagRow(f, 'prod', { rms: [rm], now: new Date('2026-10-02T00:00:00Z') }).perPlatform.ios.percent, 100);
});
test('FF sem o ambiente pedido fica marcada e sem estado', () => {
  const r = flagRow(url, 'prod', {});
  assert.strictEqual(r.inEnv, false);
  assert.strictEqual(r.perPlatform.android.state, 'n/a');
});
test('filtros por plataforma, dono, busca e criticidade', () => {
  const keys = (f) => filterRows(rows, f).map((r) => r.key);
  assert.deepStrictEqual(keys({ platform: 'ios' }), ['ft_ambos', 'ft_ios50', 'ft_off', 'ft_todas']);
  assert.deepStrictEqual(keys({ platform: 'android' }), ['ft_ambos', 'ft_off', 'ft_todas', 'rc_url']);
  assert.deepStrictEqual(keys({ team: 'SQUAD-B' }), ['ft_ios50']);
  assert.deepStrictEqual(keys({ search: 'IOS' }), ['ft_ios50']);
  assert.deepStrictEqual(keys({ criticality: 'alta' }), ['ft_ios50']);
  assert.deepStrictEqual(keys({ platform: 'ios', team: 'squad-a', search: 'todas' }), ['ft_todas']);
  assert.strictEqual(keys({}).length, 5);
});

// ---- Task 2: sincronia, extras, resumo, obsoletas
test('sincronia: template publicado a partir do repositório está ok', () => {
  for (const f of flags) assert.deepStrictEqual(syncOf(f, 'nonprod', template(), cfg, [], new Date()), { state: 'ok', problems: [] }, f.key);
});
test('sincronia: valor adulterado diverge com o motivo; parâmetro removido está ausente', () => {
  const t = template();
  t.conditions.find((c) => c.name === 'ft_ambos_ios').expression = "device.os == 'ios'";
  const d = syncOf(ambos, 'nonprod', t, cfg, [], new Date());
  assert.strictEqual(d.state, 'diverge');
  assert.match(d.problems.join('|'), /ft_ambos_ios/);
  delete t.parameters.ft_off;
  assert.strictEqual(syncOf(off, 'nonprod', t, cfg, [], new Date()).state, 'ausente');
});
test('sincronia: FF inválida (sem versão mínima) é reportada, não derruba o comando', () => {
  const bad = { ...off, key: 'ft_ruim', minVersion: undefined };
  const r = syncOf(bad, 'nonprod', template(), cfg, [], new Date());
  assert.strictEqual(r.state, 'invalida');
  assert.match(r.problems[0], /minVersion obrigatório/);
});
test('chaves que só existem no Firebase', () => {
  const t = template();
  t.parameters.legado = { defaultValue: { value: '1' } };
  t.parameterGroups.Outro = { parameters: { ft_solta: { defaultValue: { value: 'false' } } } };
  assert.deepStrictEqual(extras(t, flags).sort(), ['ft_solta', 'legado']);
});
test('resumo: contagens por tipo, criticidade, plataforma e rollout parcial', () => {
  const s = summarize(rows);
  assert.strictEqual(s.total, 5);
  assert.deepStrictEqual(s.porTipo, { toggle: 4, config: 1 });
  assert.deepStrictEqual(s.porCriticidade, { baixa: 4, alta: 1 });
  assert.deepStrictEqual(s.porPlataforma.ios, { ligadas: 2, parciais: 1, desligadas: 1, valores: 0, naoAplica: 1 });
  assert.deepStrictEqual(s.porPlataforma.android, { ligadas: 2, parciais: 0, desligadas: 1, valores: 1, naoAplica: 1 });
  assert.deepStrictEqual(s.parciais, ['ft_ios50']);
  assert.deepStrictEqual(s.porEquipe, { 'squad-a': 4, 'squad-b': 1 });
});
test('obsoletas: toggle ligado em 100% em todas as plataformas + chaves fora do repositório', () => {
  assert.deepStrictEqual(staleCandidates(rows, ['legado']), { ligadasEm100: ['ft_ambos', 'ft_todas'], foraDoRepositorio: ['legado'] });
});

// ---- Task 3: o que o app recebe, dados do Firebase e renderização
test('o que o app recebe: na mínima, logo abaixo e fora da plataforma', () => {
  const s = servedFor(ios50, 'nonprod');
  const at = (p, v) => s.find((x) => x.platform === p && x.version === v).result;
  assert.match(at('ios', '2.61.0'), /~50% recebem true, demais false/);
  assert.strictEqual(at('ios', '2.60.999'), 'false');
  assert.strictEqual(s.find((x) => x.platform === 'android').label, 'fora da plataforma');
  assert.strictEqual(servedFor(url, 'nonprod').find((x) => x.platform === 'android' && x.version === '2.58.2').result, 'não enviada (o app usa o padrão dele)');
});
test('dados publicados de uma FF no Firebase', () => {
  const info = remoteInfo(template(), 'ft_ambos');
  assert.strictEqual(info.group, 'G');
  assert.strictEqual(info.valueType, 'BOOLEAN');
  assert.strictEqual(info.defaultValue, 'false');
  assert.deepStrictEqual(info.conditions.map((c) => c.name).sort(), ['ft_ambos_android', 'ft_ambos_ios']);
  assert.strictEqual(remoteInfo(template(), 'nao_existe'), null);
  assert.strictEqual(remoteInfo(template(), 'rc_url').defaultValue, 'padrão do app');
});
test('tabela em Markdown com sincronia; sem Firebase mostra —', () => {
  const md = renderTable(rows, { sync: { ft_ambos: 'ok', ft_ios50: 'diverge', ft_off: 'ausente' } });
  assert.match(md, /\| FF \| Tipo \| Plataformas \| Versão mín\. \| iOS \| Android \| Criticidade \| Equipe \| Firebase \|/);
  assert.match(md, /\| `ft_ambos` \| toggle \(Boolean\) \| ambas \| 2\.61\.0 \| ligada 100% \| ligada 100% \| baixa \| squad-a \| ✓ ok \|/);
  assert.match(md, /ft_ios50.*ligada 50% \| n\/a .*✗ diverge/);
  assert.match(md, /ft_todas.* — \|$/m);
  assert.strictEqual(md.split('\n').filter((l) => l.startsWith('| `')).length, 5);
});
test('valores com | não quebram a tabela', () => {
  const f = { ...url, key: 'rc_pipe', environments: { nonprod: { default: 'a|b' } } };
  assert.match(renderTable([flagRow(f, 'nonprod', {})], {}), /valor `a\\\|b`/);
});
test('ficha da FF, resumo, histórico e sincronia', () => {
  const d = renderDetail(rows[1], { flag: ios50, env: 'nonprod', sync: { state: 'diverge', problems: ['x: divergiu'] }, template: template() });
  for (const re of [/## `ft_ios50`/, /Estado por plataforma/, /O que o app recebe/, /No Firebase/, /Sincronia: ✗ diverge/, /x: divergiu/]) assert.match(d, re);
  assert.match(renderDetail(rows[1], { flag: ios50, env: 'nonprod', sync: null, template: null }), /Firebase não consultado/);
  const sm = renderSummary(summarize(rows), { lastVersion: { versionNumber: '24', updateTime: '2026-09-24T12:00:00Z', updateUser: { email: 'a@b.com' } } });
  assert.match(sm, /Total: 5/);
  assert.match(sm, /\| squad-a \| 4 \|/);
  assert.match(sm, /Última publicação: versão 24 em 2026-09-24T12:00:00Z por a@b\.com/);
  assert.match(renderSummary(summarize(rows), { lastVersion: null }), /Firebase não consultado/);
  const h = renderHistory([{ versionNumber: '24', updateTime: '2026-09-24T12:00:00Z', updateUser: { email: 'a@b.com' }, description: 'deploy', updateOrigin: 'REST_API' }]);
  assert.match(h, /\| 24 \| 2026-09-24T12:00:00Z \| a@b\.com \| deploy \| REST_API \|/);
  const s = renderSync({ rows, sync: { ft_ambos: { state: 'ok', problems: [] }, ft_off: { state: 'diverge', problems: ['ft_off: valor padrão esperado "false"'] } }, extras: ['legado'] });
  assert.match(s, /✓ ok: 1/);
  assert.match(s, /ft_off: valor padrão esperado/);
  assert.match(s, /`legado`: existe no Firebase e não está no repositório/);
});

// ---- argumentos, rollout e limpeza
const { parseArgs } = require('./common');
const parse = (line) => parseStatusArgs(parseArgs(line.split(' ').filter(Boolean)));
const { parseStatusArgs, renderRollout, renderStale } = require('./status');

test('argumentos válidos viram consulta', () => {
  assert.deepStrictEqual(parse('list --platform ios --team squad-a --search home --criticality alta --json'), {
    cmd: 'list', key: null, env: 'nonprod', json: true, offline: false, limit: 10,
    filters: { platform: 'ios', team: 'squad-a', search: 'home', criticality: 'alta' },
  });
  assert.strictEqual(parse('detail ft_ambos --offline').key, 'ft_ambos');
  assert.strictEqual(parse('history --limit 5').limit, 5);
  assert.strictEqual(parse('rollout rc_url --env prod').env, 'prod');
});
test('argumentos inválidos são recusados com mensagem (nada chega a shell ou URL)', () => {
  for (const [line, re] of [
    ['', /subcomando inválido/], ['apagar', /subcomando inválido/], ['detail', /exige a chave/], ['detail ft_x;rm', /chave inválida/],
    ['detail nome_sem_prefixo', /chave inválida/], ['list ft_x', /não recebe argumento posicional/], ['list --platform web', /--platform deve ser/],
    ['list --criticality urgente', /--criticality deve ser/], ['list --env staging', /--env deve ser/], ['list --team a;b', /--team inválido/], ['list --owner squad-a', /--owner foi renomeado para --team/],
    ['list --search $(ls)', /--search inválido/], ['list --search', /exige um valor/], ['history --limit 0', /--limit deve ser/], ['history --limit 99', /--limit deve ser/],
    ['list --xpto 1', /opção desconhecida/], ['list --json sim', /não recebe valor/],
  ]) assert.throws(() => parse(line), re, line);
});
test('rollout: NÃO PROD sem estágios; PROD mostra o estágio do RM ou aguarda o horário', () => {
  const f = { ...base, key: 'ft_p', environments: { nonprod: { default: 'false' }, prod: { default: 'false', ios: { value: 'true' } } } };
  const rm = { id: 'RM-1', flags: ['ft_p'], targetEnvironments: ['prod'], prodSchedule: '2026-10-01T14:00:00-03:00', rolloutPlan: [{ percent: 5, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }] };
  assert.match(renderRollout(flagRow(f, 'nonprod', {}), { flag: f, env: 'nonprod' }), /NÃO PROD publica na hora/);
  const early = new Date('2026-10-01T10:00:00-03:00');
  assert.match(renderRollout(flagRow(f, 'prod', { rms: [rm], now: early }), { flag: f, env: 'prod', rm, now: early }), /aguardando o horário/);
  const mid = new Date('2026-10-01T14:10:00-03:00');
  const md = renderRollout(flagRow(f, 'prod', { rms: [rm], now: mid }), { flag: f, env: 'prod', rm, now: mid });
  assert.match(md, /Estágio atual: 5%/);
  assert.match(md, /\| 2 \| 100% \| 0 \|/);
  assert.match(renderRollout(flagRow(f, 'prod', {}), { flag: f, env: 'prod', rm: undefined }), /sem RM/);
});
test('limpeza em Markdown', () => {
  assert.match(renderStale({ ligadasEm100: ['ft_a'], foraDoRepositorio: ['legado'] }), /- `ft_a`[\s\S]*- `legado`/);
  assert.match(renderStale({ ligadasEm100: [], foraDoRepositorio: [] }), /Nenhum toggle[\s\S]*Nenhuma chave/);
});
