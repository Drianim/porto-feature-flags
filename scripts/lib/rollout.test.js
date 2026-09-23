const test = require('node:test');
const assert = require('node:assert');
const { currentStage, effectivePercent } = require('./rollout');

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
test('flag desligada => 0 mesmo sem RM', () => {
  assert.strictEqual(effectivePercent({ enabled: false }, null), 0);
});
test('flag ligada sem RM ou antes da hora => null', () => {
  assert.strictEqual(effectivePercent({ enabled: true }, null), null);
  assert.strictEqual(effectivePercent({ enabled: true }, rm, at('2026-10-01T10:00:00Z')), null);
});
test('rolloutPercent da flag limita o estágio', () => {
  assert.strictEqual(effectivePercent({ enabled: true, rolloutPercent: 10 }, rm, at('2026-10-01T18:30:00Z')), 10);
});
