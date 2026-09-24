// Quem pode mesclar chore/* (script, pipeline, documentação) e revert/* (desfaz um merge da main): só admin.
// No GitHub a checagem do PR já exige que o AUTOR do PR seja admin; aqui, na main, a reconferência confere quem
// MESCLOU (merged_by do PR, pela API). Se não for admin, a reconferência reprova e a pipeline prepara a reversão.
const ADMIN_ONLY = /^(chore|revert)\//;
const low = (s) => String(s || '').trim().toLowerCase();

function evaluate({ source, mergedBy, adminLogins }) {
  if (!ADMIN_ONLY.test(source || '')) return { ok: true, problems: [] };
  const kind = source.split('/')[0];
  const list = (adminLogins || []).map(low).filter(Boolean);
  if (!list.length) return { ok: false, problems: [`config/approvers.json: lista "adminLogins" vazia (só admin pode mesclar ${kind}/*)`] };
  if (!low(mergedBy)) return { ok: false, problems: [`${source}: não consegui identificar quem fez o merge`] };
  if (!list.includes(low(mergedBy))) return { ok: false, problems: [`${source}: só admin pode mesclar ${kind}/*; o merge foi feito por ${mergedBy}`] };
  return { ok: true, problems: [] };
}

// Login do GitHub: letras, números e hífen, até 39 caracteres, sem começar com hífen.
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
function approversErrors(cfg) {
  const at = 'config/approvers.json';
  const errors = [];
  const logins = (name, list, required) => {
    if (!Array.isArray(list) || (required && !list.length) || !list.every((l) => LOGIN_RE.test(String(l)))) {
      errors.push(`${at}: "${name}" deve ser uma lista de logins do GitHub${required ? ' (ao menos um)' : ''}`);
    }
  };
  logins('adminLogins', cfg.adminLogins, true);
  logins('platformLogins', cfg.platformLogins === undefined ? [] : cfg.platformLogins, false);
  for (const old of ['admins', 'adminUuids', 'mergeBot', 'minApprovals', 'platform']) {
    if (cfg[old] !== undefined) errors.push(`${at}: "${old}" é do Bitbucket e foi substituído por adminLogins/platformLogins (GitHub)`);
  }
  return errors;
}

module.exports = { evaluate, approversErrors };
