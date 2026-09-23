// Rollout por tempo: o estágio ativo é derivado de prodSchedule + rolloutPlan.
// Sem estado: rodar o deploy várias vezes (pipeline agendada) é idempotente.

function currentStage(rm, now = new Date()) {
  const start = Date.parse(rm.prodSchedule);
  if (Number.isNaN(start) || now.getTime() < start) return null;
  let t = start;
  for (const stage of rm.rolloutPlan) {
    const end = t + stage.monitorMinutes * 60000;
    if (stage.monitorMinutes === 0 || now.getTime() < end) return stage;
    t = end;
  }
  return rm.rolloutPlan[rm.rolloutPlan.length - 1];
}

// Percentual efetivo de um override: menor entre o estágio atual e o teto declarado na flag.
// null = ainda não está na hora (sem RM ou antes de prodSchedule).
function effectivePercent(cap, rm, now = new Date()) {
  if (!rm) return null;
  const stage = currentStage(rm, now);
  return stage ? Math.min(stage.percent, cap ?? 100) : null;
}

module.exports = { currentStage, effectivePercent };
