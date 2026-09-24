// Modelo alinhado ao Remote Config do SuperApp:
//  - ft_* = feature toggle (valores "true"/"false"); rc_* = valor de configuração (string, URL...)
//  - por ambiente: valor padrão + override opcional por plataforma (ios/android)
//  - por FF: plataformas (android, ios ou ambas) e versão mínima do app, ambas obrigatórias
const PLATFORMS = ['ios', 'android'];
const KEY_RE = /^(ft|rc)_[A-Za-z0-9_]+$/;
// Toda FF declara em flags/<key>.json para quais plataformas existe ("android", "ios" ou "ambas") e a versão
// mínima do app que já tem o código (x.y.z). Abaixo dessa versão a FF nunca é ativada.
const PLATFORM_CHOICES = ['android', 'ios', 'ambas'];
const VERSION_RE = /^\d+\.\d+\.\d+$/;

const kindOf = (key) => (key.startsWith('ft_') ? 'toggle' : 'config');

// "ambas" -> [ios, android]; "ios" -> [ios]. Sem declaração válida, assume as duas (o validate reprova a FF).
const platformsOf = (flag) => {
  if (flag.platforms === 'android' || flag.platforms === 'ios') return [flag.platforms];
  return [...PLATFORMS];
};
// Versão mínima para a plataforma: texto único (vale para todas as plataformas da FF) ou { android, ios }.
const minVersionFor = (flag, platform) => (typeof flag.minVersion === 'string' ? flag.minVersion : (flag.minVersion || {})[platform]);

// Erros de plataforma e versão mínima da FF (lista vazia = ok). Usado pelo validate e pelo build.
function targetingErrors(flag) {
  const errors = [];
  if (!PLATFORM_CHOICES.includes(flag.platforms)) {
    errors.push(`platforms obrigatório: ${PLATFORM_CHOICES.map((c) => `"${c}"`).join(', ')}`);
    return errors;
  }
  const v = flag.minVersion;
  const example = 'ex.: "2.61.0" (x.y.z, só números)';
  if (v === undefined || v === null) errors.push(`minVersion obrigatório (versão mínima do app com o código da FF; ${example})`);
  else if (typeof v === 'string') { if (!VERSION_RE.test(v)) errors.push(`minVersion "${v}" inválida: ${example}`); }
  else if (typeof v === 'object' && !Array.isArray(v)) {
    const want = platformsOf(flag).sort().join(',');
    if (Object.keys(v).sort().join(',') !== want) errors.push(`minVersion por plataforma deve ter exatamente: ${want}`);
    for (const [p, x] of Object.entries(v)) if (!VERSION_RE.test(String(x))) errors.push(`minVersion.${p} "${x}" inválida: ${example}`);
  } else errors.push(`minVersion deve ser texto ou objeto por plataforma; ${example}`);
  return errors;
}

// Compara versões x.y.z: negativo, zero ou positivo.
const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
// Maior versão x.y.z estritamente menor que v ("2.61.0" -> "2.60.999"); null se não existir ("0.0.0").
const justBelow = (v) => {
  const [ma, mi, pa] = v.split('.').map(Number);
  if (pa > 0) return `${ma}.${mi}.${pa - 1}`;
  if (mi > 0) return `${ma}.${mi - 1}.999`;
  if (ma > 0) return `${ma - 1}.999.999`;
  return null;
};

// Normaliza: toggle com default "true" vira override "true" nas duas plataformas (padrão remoto "false"),
// para que o rollout por percentual funcione igual em qualquer forma de declarar.
function rules(flag, env) {
  const e = flag.environments[env];
  const toggle = kindOf(flag.key) === 'toggle';
  const overrides = {};
  for (const p of platformsOf(flag)) {
    if (e[p]) overrides[p] = { value: String(e[p].value), rolloutPercent: e[p].rolloutPercent };
    else if (toggle && e.default === 'true') overrides[p] = { value: 'true' };
  }
  return { defaultValue: toggle && e.default === 'true' ? 'false' : String(e.default), overrides };
}

// O que o Remote Config deve servir para (plataforma, versão do app), segundo o repositório.
//   { mode: 'exact', value }                       sempre esse valor (value undefined = chave ausente: o app usa o padrão dele)
//   { mode: 'percent', percent, value, other }     `percent`% recebem `value`; os demais recebem `other`
// Fora das plataformas da FF ou abaixo da versão mínima: toggle "false"; rc_ ausente.
function expectedAt(flag, env, platform, version) {
  const toggle = kindOf(flag.key) === 'toggle';
  const off = { mode: 'exact', value: toggle ? 'false' : undefined };
  if (!platformsOf(flag).includes(platform) || compareVersions(version, minVersionFor(flag, platform)) < 0) return off;
  const { defaultValue, overrides } = rules(flag, env);
  const o = overrides[platform];
  if (o && o.rolloutPercent > 0 && o.rolloutPercent < 100) return { mode: 'percent', percent: o.rolloutPercent, value: o.value, other: defaultValue };
  return { mode: 'exact', value: o && o.rolloutPercent !== 0 ? o.value : defaultValue };
}

// Flag "ativa" no ambiente = está liberando algo (exige RM e horário em PROD).
// Desligar (rollback) nunca é bloqueado.
function isActive(flag, env) {
  if (!flag.environments[env]) return false;
  if (kindOf(flag.key) === 'config') return true;
  return Object.values(rules(flag, env).overrides).some((o) => o.value === 'true' && o.rolloutPercent !== 0);
}

// Tipo no Remote Config, derivado dos VALORES da FF (todos os ambientes/plataformas):
// todos "true"/"false" -> BOOLEAN; qualquer outro valor (URL, texto...) -> STRING.
// Vale para ft_ e rc_; o campo valueType do arquivo é ignorado.
const isBoolean = (v) => v === 'true' || v === 'false';
function valueTypeOf(flag) {
  const values = [];
  for (const e of Object.values(flag.environments || {})) {
    values.push(String(e.default));
    for (const p of PLATFORMS) if (e[p]) values.push(String(e[p].value));
  }
  return values.length && values.every(isBoolean) ? 'BOOLEAN' : 'STRING';
}

module.exports = { PLATFORMS, PLATFORM_CHOICES, VERSION_RE, KEY_RE, kindOf, platformsOf, minVersionFor, targetingErrors, compareVersions, justBelow, rules, expectedAt, isActive, valueTypeOf };
