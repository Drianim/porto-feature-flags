// Quem pode mesclar um PR de chore/* (ajuste de script, pipeline e documentação): só admin.
// O Bitbucket não restringe merge pela branch de ORIGEM; por isso a checagem é feita na main, depois do merge,
// pelo e-mail de quem fez o merge (committer do commit de merge). Se não for admin, a reconferência reprova
// e a pipeline prepara a reversão.
// mergeBot: e-mail dos commits de merge da conta-bot (spec 0009). Ela só mescla depois de a pipeline do PR conferir
// que quem clicou em Run é admin; por isso o merge dela também é aceito.
function evaluate({ source, mergerEmail, admins, mergeBot }) {
  if (!/^chore\//.test(source || '')) return { ok: true, problems: [] };
  const list = (admins || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return { ok: false, problems: ['config/approvers.json: lista "admins" vazia (só admin pode mesclar chore/*)'] };
  const who = String(mergerEmail || '').trim().toLowerCase();
  if (!who) return { ok: false, problems: [`${source}: não consegui identificar quem fez o merge`] };
  if (mergeBot && who === String(mergeBot).trim().toLowerCase()) return { ok: true, problems: [] };
  if (!list.includes(who)) return { ok: false, problems: [`${source}: só admin pode mesclar chore/*; o merge foi feito por ${who}`] };
  return { ok: true, problems: [] };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
// Formato de config/approvers.json. mergeBot e adminUuids podem ficar vazios até a conta-bot existir (spec 0009).
function approversErrors(cfg) {
  const at = 'config/approvers.json';
  const errors = [];
  if (!Array.isArray(cfg.admins) || !cfg.admins.length || !cfg.admins.every((e) => EMAIL_RE.test(e))) errors.push(`${at}: "admins" precisa de ao menos um e-mail válido`);
  if (cfg.mergeBot !== undefined && cfg.mergeBot !== '' && !EMAIL_RE.test(cfg.mergeBot)) errors.push(`${at}: "mergeBot" deve ser o e-mail dos commits de merge da conta-bot (ou vazio até ela existir)`);
  if (cfg.adminUuids !== undefined && (!Array.isArray(cfg.adminUuids) || !cfg.adminUuids.every((u) => UUID_RE.test(u)))) errors.push(`${at}: "adminUuids" deve ser uma lista de UUIDs do Bitbucket, ex.: {11111111-2222-3333-4444-555555555555}`);
  if (cfg.minApprovals !== undefined && !(Number.isInteger(cfg.minApprovals) && cfg.minApprovals >= 0)) errors.push(`${at}: "minApprovals" deve ser um inteiro >= 0`);
  return errors;
}

module.exports = { evaluate, approversErrors };
