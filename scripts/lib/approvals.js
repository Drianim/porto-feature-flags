// Regra de aprovação de PROD: >=1 aprovação da plataforma + >=1 de outra pessoa da equipe, nenhuma do autor do PR.
// reviews: GET /repos/<dono>/<repo>/pulls/<n>/reviews (GitHub), em ordem de envio. Vale a última revisão que decide
// de cada pessoa (APPROVED, CHANGES_REQUESTED ou DISMISSED); COMMENTED não muda a decisão.
const DECISIVE = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
const low = (s) => String(s || '').toLowerCase();

function evaluate(reviews, authorLogin, cfg) {
  const last = new Map();
  for (const r of reviews || []) if (r.user && DECISIVE.has(r.state)) last.set(low(r.user.login), r.state);
  const platformLogins = (cfg.platformLogins || []).map(low);
  const approvers = [...last].filter(([login, state]) => state === 'APPROVED' && login !== low(authorLogin)).map(([login]) => login);
  const platform = approvers.filter((l) => platformLogins.includes(l));
  const team = approvers.filter((l) => !platformLogins.includes(l));
  const problems = [];
  if (!platformLogins.length) problems.push('config/approvers.json: lista "platformLogins" vazia');
  if (!platform.length) problems.push('falta aprovação de uma pessoa da plataforma');
  if (!team.length) problems.push('falta aprovação de uma pessoa da equipe (diferente do autor e da plataforma)');
  return { ok: problems.length === 0, problems, platform, team };
}

module.exports = { evaluate };
