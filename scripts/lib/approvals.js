// Regra de aprovação de PROD: >=1 aprovação de plataforma + >=1 aprovação de outra pessoa da equipe,
// nenhuma delas do autor do PR.
function evaluate(pr, cfg) {
  const authorId = pr.author && pr.author.account_id;
  const approvers = (pr.participants || [])
    .filter((p) => p.approved && p.user && p.user.account_id !== authorId)
    .map((p) => p.user.account_id);
  const platform = approvers.filter((id) => cfg.platform.includes(id));
  const team = approvers.filter((id) => !cfg.platform.includes(id));
  const problems = [];
  if (!cfg.platform.length) problems.push('config/approvers.json: lista "platform" vazia');
  if (!platform.length) problems.push('falta aprovação de uma pessoa da plataforma');
  if (!team.length) problems.push('falta aprovação de uma pessoa da equipe (diferente do autor e da plataforma)');
  return { ok: problems.length === 0, problems, platform, team };
}

module.exports = { evaluate };
