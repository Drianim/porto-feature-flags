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

const JANELA = '22:00–06:00';
const FUSO = 'America/Sao_Paulo';

// Janela de horário exigida por criticidade em PROD: baixa não tem restrição; media/critica só na
// madrugada (horário de Brasília), fuso IANA resolvido nativamente pelo Intl (sem lib nova).
function horarioPermitido(criticidade, dataISO) {
  if (criticidade === 'baixa') return { ok: true };
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(new Date(dataISO)));
  if (hora >= 22 || hora < 6) return { ok: true };
  return { ok: false, motivo: `prodSchedule fora da janela exigida para criticidade "${criticidade}": ${JANELA} (horário de Brasília)` };
}

module.exports = { currentStage, effectivePercent, horarioPermitido };
