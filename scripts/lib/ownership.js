// Permissão por equipe: uma equipe só cria, altera, apaga ou leva para PROD as FFs dela; a equipe de plataforma mexe
// em qualquer FF e é a única que transfere uma FF de uma equipe para outra.
// A identidade é o e-mail dos commits (configurável por quem commita: barra o erro e o descuido, não é autenticação).
const norm = (e) => String(e || '').trim().toLowerCase();

const FF_FILE = /^(?:flags|env\/nonprod|env\/prod)\/(.+)\.json$/;
const RM_FILE = /^rm\/RM-.*\.json$/;

// Chaves de FF tocadas por uma lista { status, file } (git diff --name-status). `rmFlagsOf(file)` devolve as FFs do RM
// (antes e depois da mudança); catálogo, docs e demais arquivos não contam.
function changedKeys(nameStatus, rmFlagsOf = () => []) {
  const keys = new Set();
  for (const { file } of nameStatus) {
    const m = FF_FILE.exec(file);
    if (m) keys.add(m[1]);
    else if (RM_FILE.test(file)) for (const k of rmFlagsOf(file)) keys.add(k);
  }
  return [...keys].sort();
}

// authors: e-mails dos commits do PR. changes: [{ key, before, after }] com a equipe da FF antes e depois (null = FF inexistente).
// config: config/teams.json ({ platform: [e-mails], teams: { <equipe>: { members: [e-mails] } } }).
function checkOwnership({ authors, changes, config }) {
  if (!authors || !authors.length) return { ok: false, problems: ['não consegui identificar o autor dos commits do PR'] };
  const platform = new Set((config.platform || []).map(norm));
  const membersOf = (team) => new Set((((config.teams || {})[team] || {}).members || []).map(norm));
  const problems = [];
  for (const { key, before, after } of changes) {
    if (!before && !after) continue;
    const owner = before || after;
    const transfer = Boolean(before && after && before !== after);
    const denied = authors.filter((a) => !platform.has(norm(a)) && (transfer || !membersOf(owner).has(norm(a))));
    if (!denied.length) continue;
    problems.push(transfer
      ? `${key}: mudar a equipe de "${before}" para "${after}" é permitido só à equipe de plataforma; sem permissão: ${denied.join(', ')}`
      : `${key}: FF da equipe "${owner}"; ${denied.join(', ')} não é membro dessa equipe nem da plataforma. Peça à equipe "${owner}" ou à plataforma para fazer a mudança.`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { changedKeys, checkOwnership };
