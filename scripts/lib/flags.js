// Modelo alinhado ao Remote Config do SuperApp:
//  - ft_* = feature toggle (valores "true"/"false"); rc_* = valor de configuração (string, URL...)
//  - por ambiente: valor padrão + override opcional por plataforma (ios/android)
const PLATFORMS = ['ios', 'android'];
const KEY_RE = /^(ft|rc)_[A-Za-z0-9_]+$/;

const kindOf = (key) => (key.startsWith('ft_') ? 'toggle' : 'config');

// Normaliza: toggle com default "true" vira override "true" nas duas plataformas (padrão remoto "false"),
// para que o rollout por percentual funcione igual em qualquer forma de declarar.
function rules(flag, env) {
  const e = flag.environments[env];
  const toggle = kindOf(flag.key) === 'toggle';
  const overrides = {};
  for (const p of PLATFORMS) {
    if (e[p]) overrides[p] = { value: String(e[p].value), rolloutPercent: e[p].rolloutPercent };
    else if (toggle && e.default === 'true') overrides[p] = { value: 'true' };
  }
  return { defaultValue: toggle && e.default === 'true' ? 'false' : String(e.default), overrides };
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

module.exports = { PLATFORMS, KEY_RE, kindOf, rules, isActive, valueTypeOf };
