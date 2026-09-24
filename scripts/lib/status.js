// Status das FFs (somente leitura): lógica pura por trás de scripts/ff-status.js.
// O estado por plataforma vem do repositório, pelas mesmas regras que o deploy usa (flags.js); o Firebase entra só
// como comparação (sincronia) e como informação (o que está publicado). Nada aqui escreve em lugar nenhum.
const { PLATFORMS, kindOf, valueTypeOf, rules, expectedAt, platformsOf, minVersionFor, justBelow } = require('./flags');
const { currentStage } = require('./rollout');
const { build, diff, findRemote } = require('./remote-config');

const { KEY_RE } = require('./flags');
const NA = { state: 'n/a' };
const COMMANDS = ['list', 'detail', 'rollout', 'summary', 'sync', 'history', 'stale'];
const CRITICALITIES = ['baixa', 'media', 'alta', 'critica'];
const VALUE_FLAGS = ['env', 'platform', 'owner', 'search', 'criticality', 'limit'];
const BOOL_FLAGS = ['json', 'offline'];

// Valida os argumentos do comando (nada do que o usuário digita chega a um shell ou a uma URL). Lança Error com a mensagem.
function parseStatusArgs(args) {
  const [cmd, ...rest] = args._;
  if (!COMMANDS.includes(cmd)) throw new Error(`subcomando inválido "${cmd || ''}". Use: ${COMMANDS.join(', ')}`);
  const known = new Set([...VALUE_FLAGS, ...BOOL_FLAGS, '_']);
  for (const k of Object.keys(args)) if (!known.has(k)) throw new Error(`opção desconhecida --${k}`);
  for (const k of VALUE_FLAGS) if (args[k] === true) throw new Error(`--${k} exige um valor`);
  for (const k of BOOL_FLAGS) if (args[k] !== undefined && args[k] !== true) throw new Error(`--${k} não recebe valor`);
  const needsKey = cmd === 'detail' || cmd === 'rollout';
  if (needsKey ? rest.length !== 1 : rest.length) throw new Error(needsKey ? `${cmd} exige a chave da FF (ex.: ${cmd} ft_minha_flag)` : `${cmd} não recebe argumento posicional`);
  if (needsKey && !KEY_RE.test(rest[0])) throw new Error(`chave inválida "${rest[0]}": use ft_ ou rc_ com letras, números e _`);
  const oneOf = (name, list) => { if (args[name] !== undefined && !list.includes(args[name])) throw new Error(`--${name} deve ser ${list.join(' | ')}`); };
  oneOf('env', ['nonprod', 'prod']); oneOf('platform', PLATFORMS); oneOf('criticality', CRITICALITIES);
  if (args.owner !== undefined && !/^[A-Za-z0-9_.-]{1,40}$/.test(args.owner)) throw new Error('--owner inválido (letras, números, . _ -; até 40)');
  if (args.search !== undefined && !/^[A-Za-z0-9_-]{1,40}$/.test(args.search)) throw new Error('--search inválido (letras, números, _ -; até 40)');
  if (args.limit !== undefined && !(/^\d{1,2}$/.test(args.limit) && Number(args.limit) >= 1 && Number(args.limit) <= 50)) throw new Error('--limit deve ser um número de 1 a 50');
  return {
    cmd, key: needsKey ? rest[0] : null, env: args.env || 'nonprod', json: args.json === true, offline: args.offline === true,
    limit: args.limit ? Number(args.limit) : 10,
    filters: { platform: args.platform, owner: args.owner, search: args.search, criticality: args.criticality },
  };
}
const minVersionText = (flag) => (typeof flag.minVersion === 'string' ? flag.minVersion : Object.entries(flag.minVersion || {}).map(([p, v]) => `${p} ${v}`).join(' / '));

// Estado de uma FF no ambiente, por plataforma. timeGated (PROD): o estágio do RM limita o percentual e, antes do horário, "aguardando".
function flagRow(flag, env, { rms = [], now = new Date(), timeGated = env === 'prod' } = {}) {
  const inEnv = Boolean(flag.environments[env]);
  const base = {
    key: flag.key, kind: kindOf(flag.key), valueType: valueTypeOf(flag), platforms: flag.platforms, minVersion: minVersionText(flag),
    criticality: flag.criticality, owner: flag.owner, group: flag.group || null, description: flag.description, env, inEnv,
  };
  const perPlatform = {};
  const toggle = base.kind === 'toggle';
  const rm = rms.find((r) => (r.flags || []).includes(flag.key) && (r.targetEnvironments || []).includes(env));
  const stage = rm && currentStage(rm, now);
  const { defaultValue, overrides } = inEnv ? rules(flag, env) : { overrides: {} };
  for (const p of PLATFORMS) {
    if (!inEnv || !platformsOf(flag).includes(p)) { perPlatform[p] = { ...NA }; continue; }
    const o = overrides[p];
    if (toggle) {
      if (!(o && o.value === 'true' && o.rolloutPercent !== 0)) { perPlatform[p] = { state: 'desligada', value: 'false' }; continue; }
      let percent = o.rolloutPercent ?? 100;
      if (timeGated) {
        if (!stage) { perPlatform[p] = { state: 'aguardando', value: 'true' }; continue; }
        percent = Math.min(percent, stage.percent);
      }
      perPlatform[p] = { state: 'ligada', percent, value: 'true' };
    } else if (timeGated && !stage) {
      perPlatform[p] = { state: 'aguardando', value: o ? o.value : defaultValue };
    } else {
      perPlatform[p] = { state: 'valor', percent: (o && o.rolloutPercent) ?? 100, value: o ? o.value : defaultValue };
    }
  }
  return { ...base, perPlatform };
}

function filterRows(rows, { platform, owner, search, criticality } = {}) {
  const lower = (s) => String(s || '').toLowerCase();
  return rows.filter((r) => (!platform || r.perPlatform[platform].state !== 'n/a')
    && (!owner || lower(r.owner) === lower(owner))
    && (!criticality || r.criticality === criticality)
    && (!search || lower(r.key).includes(lower(search)) || lower(r.description).includes(lower(search))));
}

// Sincronia de UMA FF: o que o repositório mandaria publicar x o que está no template do Firebase.
function syncOf(flag, env, template, cfgEnv, rms = [], now = new Date()) {
  let plan;
  try { plan = build([flag], rms, env, cfgEnv, now); } catch (e) { return { state: 'invalida', problems: [e.message] }; }
  if (!plan.items.length && plan.skipped.length) return { state: 'aguardando', problems: [] };
  if (!findRemote(template, flag.key)) return { state: 'ausente', problems: [] };
  const { problems } = diff(template, plan);
  return { state: problems.length ? 'diverge' : 'ok', problems };
}

function extras(template, flags) {
  const known = new Set(flags.map((f) => f.key));
  const remote = [...Object.keys(template.parameters || {}), ...Object.values(template.parameterGroups || {}).flatMap((g) => Object.keys(g.parameters || {}))];
  return remote.filter((k) => !known.has(k));
}

const isPartial = (s) => (s.state === 'ligada' || s.state === 'valor') && s.percent < 100;
function summarize(rows) {
  const count = (fn) => rows.reduce((acc, r) => { const k = fn(r); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const porPlataforma = {};
  for (const p of PLATFORMS) {
    const st = rows.map((r) => r.perPlatform[p]);
    porPlataforma[p] = {
      ligadas: st.filter((s) => s.state === 'ligada' && s.percent === 100).length,
      parciais: st.filter((s) => s.state === 'ligada' && s.percent < 100).length,
      desligadas: st.filter((s) => s.state === 'desligada').length,
      valores: st.filter((s) => s.state === 'valor').length,
      naoAplica: st.filter((s) => s.state === 'n/a').length,
    };
  }
  const has = (r, fn) => PLATFORMS.some((p) => fn(r.perPlatform[p]));
  return {
    total: rows.length,
    porTipo: { toggle: 0, config: 0, ...count((r) => r.kind) },
    porCriticidade: count((r) => r.criticality),
    porPlataforma,
    parciais: rows.filter((r) => has(r, isPartial)).map((r) => r.key),
    aguardando: rows.filter((r) => has(r, (s) => s.state === 'aguardando')).map((r) => r.key),
  };
}

// Candidatas a limpeza: toggle ligado em 100% em todas as plataformas da FF (o código pode virar permanente) e chaves órfãs.
function staleCandidates(rows, extraKeys = []) {
  const ligadasEm100 = rows.filter((r) => {
    const st = PLATFORMS.map((p) => r.perPlatform[p]).filter((s) => s.state !== 'n/a');
    return r.kind === 'toggle' && st.length > 0 && st.every((s) => s.state === 'ligada' && s.percent === 100);
  }).map((r) => r.key);
  return { ligadasEm100, foraDoRepositorio: [...extraKeys] };
}

const describeExpected = (e) => {
  if (e.mode === 'percent') return `~${e.percent}% recebem ${e.value}, demais ${e.other}`;
  return e.value === undefined ? 'não enviada (o app usa o padrão dele)' : String(e.value);
};
// O que o app recebe, segundo o repositório: na versão mínima, logo abaixo dela e fora das plataformas da FF.
function servedFor(flag, env) {
  const out = [];
  for (const platform of PLATFORMS) {
    const listed = platformsOf(flag).includes(platform);
    const min = listed ? minVersionFor(flag, platform) : null;
    const versions = listed ? [[min, 'na versão mínima'], ...(justBelow(min) ? [[justBelow(min), 'logo abaixo da mínima']] : [])] : [['99.0.0', 'fora da plataforma']];
    for (const [version, label] of versions) out.push({ platform, version, label, result: describeExpected(expectedAt(flag, env, platform, version)) });
  }
  return out;
}

// O que está publicado no Firebase para a chave (null se não existir).
function remoteInfo(template, key) {
  const r = findRemote(template, key);
  if (!r) return null;
  const cv = r.param.conditionalValues || {};
  const names = new Set(Object.keys(cv));
  return {
    group: r.group,
    valueType: r.param.valueType || 'STRING',
    defaultValue: r.param.defaultValue && r.param.defaultValue.useInAppDefault ? 'padrão do app' : (r.param.defaultValue || {}).value,
    conditionalValues: cv,
    conditions: (template.conditions || []).filter((c) => names.has(c.name)).map((c) => ({ name: c.name, expression: c.expression })),
  };
}

// ---- renderização (Markdown) ----
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (v) => (String(v).length > 40 ? `${String(v).slice(0, 37)}...` : String(v));
const stateText = (s) => {
  if (s.state === 'ligada') return `ligada ${s.percent}%`;
  if (s.state === 'valor') return `valor \`${short(s.value)}\`${s.percent < 100 ? ` (${s.percent}%)` : ''}`;
  if (s.state === 'aguardando') return 'aguardando horário';
  return s.state;
};
const typeText = (r) => `${r.kind} (${r.valueType === 'BOOLEAN' ? 'Boolean' : 'String'})`;
const SYNC_TEXT = { ok: '✓ ok', diverge: '✗ diverge', ausente: '✗ ausente', aguardando: '… aguardando', invalida: '✗ inválida' };
const table = (head, lines) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...lines.map((l) => `| ${l.map(cell).join(' | ')} |`)].join('\n');
// a tabela de FFs escapa por célula, mas mantém o `código` da chave
const NO_FIREBASE = 'Firebase não consultado (sem credencial ou --offline): só o repositório.';

function renderTable(rows, { sync } = {}) {
  const head = ['FF', 'Tipo', 'Plataformas', 'Versão mín.', 'iOS', 'Android', 'Criticidade', 'Dono', 'Firebase'];
  const lines = rows.map((r) => [`\`${r.key}\``, typeText(r), r.platforms, r.minVersion, stateText(r.perPlatform.ios), stateText(r.perPlatform.android), r.criticality, r.owner, sync ? (SYNC_TEXT[sync[r.key]] || '—') : '—']);
  return `${table(head, lines)}\n${sync ? '' : `\n> ${NO_FIREBASE}\n`}`;
}

function renderDetail(row, { flag, env, sync, template } = {}) {
  const out = [`## \`${row.key}\``, '',
    table(['Campo', 'Valor'], [['Tipo', typeText(row)], ['Plataformas', row.platforms], ['Versão mínima', row.minVersion], ['Criticidade', row.criticality], ['Dono', row.owner], ['Grupo', row.group || '—'], ['Descrição', row.description], ['Ambiente', env || row.env]]), '',
    '### Estado por plataforma', '',
    table(['Plataforma', 'Estado'], [['iOS', stateText(row.perPlatform.ios)], ['Android', stateText(row.perPlatform.android)]]), '',
    '### O que o app recebe', '',
    table(['Plataforma', 'Versão', 'Situação', 'Recebe'], servedFor(flag, env || row.env).map((s) => [s.platform === 'ios' ? 'iOS' : 'Android', s.version, s.label, s.result])), '',
    '### No Firebase', ''];
  const info = template ? remoteInfo(template, row.key) : null;
  if (!template) out.push(NO_FIREBASE);
  else if (!info) out.push('Não publicada no Firebase.');
  else {
    out.push(table(['Campo', 'Valor'], [['Grupo', info.group || '—'], ['Tipo', info.valueType], ['Valor padrão', info.defaultValue]]), '',
      table(['Condição', 'Expressão', 'Valor'], info.conditions.map((c) => [c.name, `\`${c.expression}\``, info.conditionalValues[c.name].value])));
  }
  if (sync) {
    out.push('', `Sincronia: ${SYNC_TEXT[sync.state] || sync.state}`);
    for (const p of sync.problems) out.push(`- ${p}`);
  }
  return `${out.join('\n')}\n`;
}

function renderSummary(s, { lastVersion } = {}) {
  const pl = (p) => { const x = s.porPlataforma[p]; return [p === 'ios' ? 'iOS' : 'Android', x.ligadas, x.parciais, x.desligadas, x.valores, x.naoAplica]; };
  const out = [`## Resumo das FFs`, '', `**Total: ${s.total}** (${s.porTipo.toggle} toggles, ${s.porTipo.config} configs)`, '',
    table(['Plataforma', 'Ligadas 100%', 'Rollout parcial', 'Desligadas', 'Valores (rc_)', 'Não se aplica'], [pl('ios'), pl('android')]), '',
    table(['Criticidade', 'FFs'], Object.entries(s.porCriticidade)), ''];
  if (s.parciais.length) out.push(`Em rollout parcial: ${s.parciais.map((k) => `\`${k}\``).join(', ')}`, '');
  if (s.aguardando.length) out.push(`Aguardando o horário do RM: ${s.aguardando.map((k) => `\`${k}\``).join(', ')}`, '');
  if (lastVersion) out.push(`Última publicação: versão ${lastVersion.versionNumber} em ${lastVersion.updateTime} por ${(lastVersion.updateUser && lastVersion.updateUser.email) || '—'}`);
  else out.push(NO_FIREBASE);
  return `${out.join('\n')}\n`;
}

function renderHistory(versions) {
  if (!versions.length) return 'Nenhuma versão publicada encontrada.\n';
  return `${table(['Versão', 'Quando', 'Quem', 'Descrição', 'Origem'], versions.map((v) => [v.versionNumber, v.updateTime, (v.updateUser && v.updateUser.email) || '—', v.description || '—', v.updateOrigin || '—']))}\n`;
}

function renderRollout(row, { flag, env, rm, now = new Date() } = {}) {
  const out = [`## Rollout: \`${row.key}\``, '',
    table(['Plataforma', 'Estado', 'Versão mínima'], [['iOS', stateText(row.perPlatform.ios), row.minVersion], ['Android', stateText(row.perPlatform.android), row.minVersion]]), ''];
  if (env === 'prod') {
    if (!rm) out.push('PROD: sem RM para esta FF (se ela libera algo, o deploy de PROD exige RM).');
    else {
      const stage = currentStage(rm, now);
      out.push(`RM \`${rm.id || '—'}\`, agendado para ${rm.prodSchedule}. ${stage ? `Estágio atual: ${stage.percent}% (monitorar ${stage.monitorMinutes} min).` : 'Ainda aguardando o horário: nada foi liberado.'}`, '',
        table(['Estágio', 'Percentual', 'Monitorar (min)'], (rm.rolloutPlan || []).map((st, i) => [i + 1, `${st.percent}%`, st.monitorMinutes])));
    }
  } else out.push('NÃO PROD publica na hora, sem estágios: o percentual é o `rolloutPercent` de `env/nonprod/`.');
  out.push('', '### O que o app recebe', '', table(['Plataforma', 'Versão', 'Situação', 'Recebe'], servedFor(flag, env).map((x) => [x.platform === 'ios' ? 'iOS' : 'Android', x.version, x.label, x.result])));
  return `${out.join('\n')}\n`;
}

function renderStale({ ligadasEm100, foraDoRepositorio }) {
  const out = ['## Candidatas a limpeza', '',
    ligadasEm100.length ? ['Toggles ligados em 100% em todas as plataformas (o código pode virar permanente e a FF ser removida com `remove/*`):', ...ligadasEm100.map((k) => `- \`${k}\``)].join('\n') : 'Nenhum toggle ligado em 100% em todas as plataformas.', '',
    foraDoRepositorio.length ? ['Chaves que só existem no Firebase (não estão no repositório):', ...foraDoRepositorio.map((k) => `- \`${k}\``)].join('\n') : 'Nenhuma chave fora do repositório.'];
  return `${out.join('\n')}\n`;
}

function renderSync({ rows, sync, extras: extraKeys = [] }) {
  const count = (st) => rows.filter((r) => (sync[r.key] || {}).state === st).length;
  const out = ['## Sincronia main × Firebase NÃO PROD', '',
    `${SYNC_TEXT.ok}: ${count('ok')} · ${SYNC_TEXT.diverge}: ${count('diverge')} · ${SYNC_TEXT.ausente}: ${count('ausente')} · ${SYNC_TEXT.invalida}: ${count('invalida')} · ${SYNC_TEXT.aguardando}: ${count('aguardando')}`, ''];
  for (const r of rows) {
    const s = sync[r.key];
    if (s && s.state !== 'ok' && s.state !== 'aguardando') {
      out.push(`### \`${r.key}\` ${SYNC_TEXT[s.state]}`);
      for (const p of s.problems) out.push(`- ${p}`);
      if (!s.problems.length) out.push('- não está publicada no Firebase');
      out.push('');
    }
  }
  if (extraKeys.length) { out.push('### Só no Firebase', ...extraKeys.map((k) => `- \`${k}\`: existe no Firebase e não está no repositório`), ''); }
  if (rows.every((r) => (sync[r.key] || {}).state === 'ok') && !extraKeys.length) out.push('Tudo sincronizado: a `main` é idêntica ao Firebase.');
  return `${out.join('\n')}\n`;
}

module.exports = { COMMANDS, parseStatusArgs, renderRollout, renderStale, flagRow, filterRows, syncOf, extras, summarize, staleCandidates, servedFor, remoteInfo, renderTable, renderDetail, renderSummary, renderHistory, renderSync };
