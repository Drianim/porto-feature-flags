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

// Planos de estágio para NÃO PROD, por criticidade: mesmos percentuais do README, 60 min por estágio
// (o README não fixa tempo para os estágios de critica; o valor de PROD, em new-rm.js, é outro, específico
// de PROD). baixa não tem plano: sem estágio, sempre 100%/teto direto.
const NONPROD_ROLLOUT_PLANS = {
  media: [{ percent: 25, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }],
  critica: [{ percent: 5, monitorMinutes: 60 }, { percent: 25, monitorMinutes: 60 }, { percent: 50, monitorMinutes: 60 }, { percent: 100, monitorMinutes: 0 }],
};

// Percentual efetivo de um override em NÃO PROD: sem plano ou sem rolloutStartedAt, serve o teto (ou 100)
// direto, como hoje. Com plano e rolloutStartedAt, reaproveita currentStage trocando o RM por um objeto
// { prodSchedule, rolloutPlan } montado na hora — sem estado, mesma garantia de idempotência do PROD.
function nonprodEffectivePercent(criticality, rolloutStartedAt, cap, now = new Date()) {
  const plan = NONPROD_ROLLOUT_PLANS[criticality];
  if (!plan || !rolloutStartedAt) return cap ?? 100;
  const stage = currentStage({ prodSchedule: rolloutStartedAt, rolloutPlan: plan }, now);
  return stage ? Math.min(stage.percent, cap ?? 100) : 0;
}

// Próximo estágio de NÃO PROD (visibilidade, spec 0029): mesma soma de monitorMinutes que currentStage percorre,
// mas devolve o estágio SEGUINTE ao atual e o horário em que ele começa. null = sem plano, sem rolloutStartedAt
// ou já no estágio final (monitorMinutes 0).
function nextNonprodStage(criticality, rolloutStartedAt, now = new Date()) {
  const plan = NONPROD_ROLLOUT_PLANS[criticality];
  if (!plan || !rolloutStartedAt) return null;
  let t = Date.parse(rolloutStartedAt);
  for (let i = 0; i < plan.length; i++) {
    const stage = plan[i];
    if (stage.monitorMinutes === 0) return null;
    const end = t + stage.monitorMinutes * 60000;
    if (now.getTime() < end) {
      const next = plan[i + 1];
      return next ? { percent: next.percent, at: new Date(end) } : null;
    }
    t = end;
  }
  return null;
}

module.exports = { currentStage, effectivePercent, horarioPermitido, NONPROD_ROLLOUT_PLANS, nonprodEffectivePercent, nextNonprodStage };
