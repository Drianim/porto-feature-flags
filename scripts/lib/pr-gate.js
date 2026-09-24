// Pipeline de PR no GitHub (spec 0010): o tipo da branch decide o que roda, e um job final "Tudo verde" consolida
// todos os outros. A proteção da main exige "Tudo verde": o merge só é liberado quando tudo passou.
const FF_KINDS = ['feature', 'update', 'remove', 'release'];
const ADMIN_KINDS = ['chore', 'revert'];
const low = (s) => String(s || '').trim().toLowerCase();

// branch: nome da branch do PR; author: login do autor do PR; adminLogins: de config/approvers.json.
function prKind({ branch, author, adminLogins }) {
  const kind = [...FF_KINDS, ...ADMIN_KINDS].find((k) => String(branch || '').startsWith(`${k}/`)) || null;
  if (!kind) return { ok: false, kind: null, ff: false, problems: [`branch "${branch}" fora do processo: use feature/, update/, remove/, release/, chore/ ou revert/`] };
  const problems = [];
  if (ADMIN_KINDS.includes(kind)) {
    const admins = (adminLogins || []).map(low).filter(Boolean);
    if (!admins.length) problems.push(`config/approvers.json: "adminLogins" vazio (só admin abre ${kind}/*)`);
    else if (!admins.includes(low(author))) problems.push(`só admin abre ${kind}/*; o autor do PR é ${author || 'desconhecido'}`);
  }
  return { ok: problems.length === 0, kind, ff: FF_KINDS.includes(kind), problems };
}

// needs: o objeto `needs` do GitHub Actions ({ job: { result } }). Skipped = não se aplica ao tipo da branch.
function allGreen(needs) {
  const entries = Object.entries(needs || {});
  const problems = entries.filter(([, v]) => !['success', 'skipped'].includes(v && v.result)).map(([k, v]) => `${k}: ${(v && v.result) || 'sem resultado'}`);
  if (!needs || !needs.tipo || needs.tipo.result !== 'success') problems.unshift(`tipo: o job que identifica a branch precisa passar (${(needs && needs.tipo && needs.tipo.result) || 'não rodou'})`);
  return { ok: problems.length === 0, problems };
}

module.exports = { FF_KINDS, ADMIN_KINDS, prKind, allGreen };
