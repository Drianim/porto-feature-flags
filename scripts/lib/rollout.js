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

// null  = ainda não está na hora (não mexer no valor remoto)
// número = percentual efetivo (0 = desligada, 100 = todos)
function effectivePercent(prodCfg, rm, now = new Date()) {
  if (!prodCfg.enabled) return 0;
  if (!rm) return null;
  const stage = currentStage(rm, now);
  if (!stage) return null;
  return Math.min(stage.percent, prodCfg.rolloutPercent ?? 100);
}

module.exports = { currentStage, effectivePercent };
