const test = require('node:test');
const assert = require('node:assert');
const { currentStage, effectivePercent, horarioPermitido, nonprodEffectivePercent, nextNonprodStage } = require('./rollout');
const { rules, isActive, kindOf, valueTypeOf } = require('./flags');

const rm = {
  prodSchedule: '2026-10-01T14:00:00-03:00',
  rolloutPlan: [
    { percent: 5, monitorMinutes: 30 },
    { percent: 25, monitorMinutes: 60 },
    { percent: 100, monitorMinutes: 0 },
  ],
};
const at = (iso) => new Date(iso);

test('antes do agendamento não há estágio', () => {
  assert.strictEqual(currentStage(rm, at('2026-10-01T16:59:00Z')), null);
});
test('no horário começa em 5%', () => {
  assert.strictEqual(currentStage(rm, at('2026-10-01T17:00:00Z')).percent, 5);
});
test('após 30 min vai para 25%', () => {
  assert.strictEqual(currentStage(rm, at('2026-10-01T17:30:00Z')).percent, 25);
});
test('após 90 min chega em 100% e permanece', () => {
  assert.strictEqual(currentStage(rm, at('2026-10-01T18:30:00Z')).percent, 100);
  assert.strictEqual(currentStage(rm, at('2026-10-05T00:00:00Z')).percent, 100);
});
test('sem RM ou antes da hora => null', () => {
  assert.strictEqual(effectivePercent(100, null), null);
  assert.strictEqual(effectivePercent(100, rm, at('2026-10-01T10:00:00Z')), null);
});
test('teto da flag limita o estágio', () => {
  assert.strictEqual(effectivePercent(10, rm, at('2026-10-01T18:30:00Z')), 10);
});

test('horarioPermitido: baixa passa em qualquer horário', () => {
  assert.strictEqual(horarioPermitido('baixa', '2026-10-01T14:00:00-03:00').ok, true);
  assert.strictEqual(horarioPermitido('baixa', '2026-10-01T23:00:00-03:00').ok, true);
});
test('horarioPermitido: media/critica só entre 22:00–06:00 (horário de Brasília)', () => {
  const fora = horarioPermitido('critica', '2026-10-01T14:00:00-03:00');
  assert.strictEqual(fora.ok, false);
  assert.match(fora.motivo, /22:00–06:00/);
  assert.strictEqual(horarioPermitido('media', '2026-10-01T23:00:00-03:00').ok, true);
  assert.strictEqual(horarioPermitido('critica', '2026-10-01T05:59:00-03:00').ok, true);
  assert.strictEqual(horarioPermitido('media', '2026-10-01T06:00:00-03:00').ok, false);
  assert.strictEqual(horarioPermitido('critica', '2026-10-01T22:00:00-03:00').ok, true);
});

test('nonprodEffectivePercent: critica sobe 5 -> 25 -> 50 -> 100 a cada 60 min', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, undefined, at('2026-10-01T15:00:00Z')), 5);
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, undefined, at('2026-10-01T16:01:00Z')), 25);
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, undefined, at('2026-10-01T17:01:00Z')), 50);
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, undefined, at('2026-10-01T18:01:00Z')), 100);
});
test('nonprodEffectivePercent: media sobe 25 -> 100 em 60 min', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nonprodEffectivePercent('media', inicio, undefined, at('2026-10-01T15:00:00Z')), 25);
  assert.strictEqual(nonprodEffectivePercent('media', inicio, undefined, at('2026-10-01T16:01:00Z')), 100);
});
test('nonprodEffectivePercent: baixa ignora rolloutStartedAt e serve o teto (ou 100) direto', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nonprodEffectivePercent('baixa', inicio, undefined, at('2026-10-01T15:00:00Z')), 100);
  assert.strictEqual(nonprodEffectivePercent('baixa', inicio, 40, at('2026-10-01T15:00:00Z')), 40);
});
test('nonprodEffectivePercent: sem rolloutStartedAt, sem estágio, serve o teto (ou 100) direto', () => {
  assert.strictEqual(nonprodEffectivePercent('critica', undefined, undefined, at('2026-10-01T15:00:00Z')), 100);
  assert.strictEqual(nonprodEffectivePercent('critica', undefined, 30, at('2026-10-01T15:00:00Z')), 30);
});
test('nonprodEffectivePercent: antes de rolloutStartedAt é 0', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, undefined, at('2026-10-01T14:00:00Z')), 0);
});
test('nonprodEffectivePercent: teto da flag limita o estágio', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nonprodEffectivePercent('critica', inicio, 3, at('2026-10-01T15:00:00Z')), 3);
});

test('nextNonprodStage: critica aponta o próximo estágio e o horário em que ele começa', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.deepStrictEqual(nextNonprodStage('critica', inicio, at('2026-10-01T15:00:00Z')), { percent: 25, at: at('2026-10-01T16:00:00Z') });
  assert.deepStrictEqual(nextNonprodStage('critica', inicio, at('2026-10-01T16:01:00Z')), { percent: 50, at: at('2026-10-01T17:00:00Z') });
  assert.deepStrictEqual(nextNonprodStage('critica', inicio, at('2026-10-01T17:01:00Z')), { percent: 100, at: at('2026-10-01T18:00:00Z') });
  assert.strictEqual(nextNonprodStage('critica', inicio, at('2026-10-01T18:01:00Z')), null);
});
test('nextNonprodStage: media aponta 100% e depois null', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.deepStrictEqual(nextNonprodStage('media', inicio, at('2026-10-01T15:00:00Z')), { percent: 100, at: at('2026-10-01T16:00:00Z') });
  assert.strictEqual(nextNonprodStage('media', inicio, at('2026-10-01T16:01:00Z')), null);
});
test('nextNonprodStage: baixa, ou sem rolloutStartedAt, é sempre null', () => {
  const inicio = '2026-10-01T12:00:00-03:00';
  assert.strictEqual(nextNonprodStage('baixa', inicio, at('2026-10-01T15:00:00Z')), null);
  assert.strictEqual(nextNonprodStage('critica', undefined, at('2026-10-01T15:00:00Z')), null);
});

test('prefixo define o tipo', () => {
  assert.strictEqual(kindOf('ft_x'), 'toggle');
  assert.strictEqual(kindOf('rc_url_x'), 'config');
});
test('toggle com default true vira override nas duas plataformas', () => {
  const f = { key: 'ft_a', environments: { prod: { default: 'true' } } };
  const r = rules(f, 'prod');
  assert.strictEqual(r.defaultValue, 'false');
  assert.deepStrictEqual(Object.keys(r.overrides), ['ios', 'android']);
});
test('toggle desligado não é ativo (rollback nunca bloqueia)', () => {
  assert.strictEqual(isActive({ key: 'ft_a', environments: { prod: { default: 'false' } } }, 'prod'), false);
  assert.strictEqual(isActive({ key: 'ft_a', environments: { prod: { default: 'false', ios: { value: 'true', rolloutPercent: 0 } } } }, 'prod'), false);
});
test('toggle com override true é ativo; config sempre é', () => {
  assert.strictEqual(isActive({ key: 'ft_a', environments: { prod: { default: 'false', android: { value: 'true' } } } }, 'prod'), true);
  assert.strictEqual(isActive({ key: 'rc_u', environments: { prod: { default: 'https://x' } } }, 'prod'), true);
});

test('valueTypeOf deriva dos valores', () => {
  const f = (envs, extra = {}) => ({ key: 'x', environments: envs, ...extra });
  assert.strictEqual(valueTypeOf(f({ nonprod: { default: 'false', ios: { value: 'true' } } })), 'BOOLEAN');
  assert.strictEqual(valueTypeOf(f({ nonprod: { default: 'https://x' } })), 'STRING');
  assert.strictEqual(valueTypeOf(f({ nonprod: { default: 'false' }, prod: { default: 'false', android: { value: 'talvez' } } })), 'STRING', 'um valor não booleano em qualquer ambiente torna String');
  assert.strictEqual(valueTypeOf(f({ nonprod: { default: 'false' } }, { valueType: 'STRING' })), 'BOOLEAN', 'campo valueType é ignorado');
});
