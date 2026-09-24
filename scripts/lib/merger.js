// Quem pode mesclar um PR de chore/* (ajuste de script, pipeline e documentação): só admin.
// O Bitbucket não restringe merge pela branch de ORIGEM; por isso a checagem é feita na main, depois do merge,
// pelo e-mail de quem fez o merge (committer do commit de merge). Se não for admin, a reconferência reprova
// e a pipeline prepara a reversão.
function evaluate({ source, mergerEmail, admins }) {
  if (!/^chore\//.test(source || '')) return { ok: true, problems: [] };
  const list = (admins || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return { ok: false, problems: ['config/approvers.json: lista "admins" vazia (só admin pode mesclar chore/*)'] };
  const who = String(mergerEmail || '').trim().toLowerCase();
  if (!who) return { ok: false, problems: [`${source}: não consegui identificar quem fez o merge`] };
  if (!list.includes(who)) return { ok: false, problems: [`${source}: só admin pode mesclar chore/*; o merge foi feito por ${who}`] };
  return { ok: true, problems: [] };
}

module.exports = { evaluate };
