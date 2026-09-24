// Merge só pela pipeline (spec 0009): na main só a conta-bot tem permissão de merge; o último passo da pipeline do PR,
// manual, decide aqui se pode mesclar e mescla pela API. Assim não existe botão de merge antes de a validação passar.
const KINDS = ['feature', 'update', 'remove', 'release', 'chore', 'revert'];
const ADMIN_KINDS = ['chore', 'revert']; // mudam script, pipeline ou a própria main: só admin mescla
const kindOfBranch = (branch) => KINDS.find((k) => String(branch || '').startsWith(`${k}/`)) || null;
const normUuid = (u) => String(u || '').replace(/[{}]/g, '').trim().toLowerCase();

// pr: JSON da API do Bitbucket. validatedCommit: BITBUCKET_COMMIT (o commit que a pipeline validou).
// triggererUuid: BITBUCKET_STEP_TRIGGERER_UUID (quem clicou em Run). config: config/approvers.json.
function decide({ pr, validatedCommit, destination, kind, triggererUuid, config }) {
  const problems = [];
  const prDest = pr && pr.destination && pr.destination.branch && pr.destination.branch.name;
  if (destination !== 'main' || (prDest && prDest !== 'main')) problems.push(`o passo só mescla na main (destino: ${prDest || destination || 'desconhecido'})`);
  if (!pr || pr.state !== 'OPEN') problems.push(`o PR não está aberto (está ${(pr && pr.state) || 'desconhecido'})`);
  const prCommit = String((pr && pr.source && pr.source.commit && pr.source.commit.hash) || '');
  const validated = String(validatedCommit || '');
  if (!validated) problems.push('a pipeline não informou o commit validado (BITBUCKET_COMMIT)');
  else if (!prCommit || !(validated.startsWith(prCommit) || prCommit.startsWith(validated))) {
    problems.push(`o PR está no commit ${prCommit.slice(0, 12) || '?'}, mas esta pipeline validou ${validated.slice(0, 12)}: um push chegou depois da validação; espere a nova pipeline`);
  }
  const min = Number((config && config.minApprovals) || 0);
  if (min > 0) {
    const author = normUuid(pr && pr.author && pr.author.uuid);
    const approvals = ((pr && pr.participants) || []).filter((p) => p.approved && normUuid(p.user && p.user.uuid) !== author).length;
    if (approvals < min) problems.push(`precisa de ${min} aprovação(ões) de outra pessoa no PR; tem ${approvals}`);
  }
  if (!kind) problems.push('branch fora do processo (use feature/, update/, remove/, release/, chore/ ou revert/)');
  else if (ADMIN_KINDS.includes(kind)) {
    const admins = ((config && config.adminUuids) || []).map(normUuid).filter(Boolean);
    if (!admins.length) problems.push('config/approvers.json: adminUuids vazio (só admin mescla chore/* e revert/*)');
    else if (!normUuid(triggererUuid)) problems.push('não consegui identificar quem clicou em Run (BITBUCKET_STEP_TRIGGERER_UUID)');
    else if (!admins.includes(normUuid(triggererUuid))) problems.push(`só admin mescla ${kind}/*; quem clicou em Run (${triggererUuid}) não está em adminUuids`);
  }
  return { ok: problems.length === 0, problems };
}

// ---- API do Bitbucket (conta-bot) ----
const API = 'https://api.bitbucket.org/2.0/repositories';
const prUrl = ({ workspace, repo, prId }) => `${API}/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pullrequests/${encodeURIComponent(prId)}`;
const authHeader = (user, token) => `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;
// Nunca deixa o token aparecer numa mensagem (mesmo que a API o ecoe).
const scrub = (text, token) => (token ? String(text).split(token).join('***') : String(text));

async function apiError(res, token) {
  let msg = '';
  try { const b = await res.json(); msg = (b && b.error && b.error.message) || JSON.stringify(b); } catch { msg = ''; }
  const hint = res.status === 401 || res.status === 403
    ? ' Confira o usuário e o token da conta-bot (BB_MERGE_BOT_USER e BB_MERGE_BOT_TOKEN) e se ela tem permissão de merge na main.' : '';
  return scrub(`HTTP ${res.status}${msg ? `: ${msg}` : ''}.${hint}`, token);
}

async function getPr({ fetch, workspace, repo, prId, user, token }) {
  const res = await fetch(prUrl({ workspace, repo, prId }), { headers: { Authorization: authHeader(user, token), Accept: 'application/json' } });
  if (!res.ok) throw new Error(`não consegui ler o PR #${prId}: ${await apiError(res, token)}`);
  return res.json();
}

// merge_commit (dois pais: a reconferência e a reversão usam o 1º pai) e SEM mensagem própria: o Bitbucket usa
// "Merged in <branch> (pull request #N)", que scripts/ci/merge-source.sh lê para saber a origem do merge.
async function mergePr({ fetch, workspace, repo, prId, user, token, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 30 }) {
  const headers = { Authorization: authHeader(user, token), Accept: 'application/json', 'Content-Type': 'application/json' };
  const res = await fetch(`${prUrl({ workspace, repo, prId })}/merge`, { method: 'POST', headers, body: JSON.stringify({ type: 'pullrequest', merge_strategy: 'merge_commit', close_source_branch: true }) });
  const done = (body) => {
    const hash = body && body.merge_commit && body.merge_commit.hash;
    return { ok: true, message: `PR #${prId} mesclado${hash ? ` (commit ${hash})` : ''}`, mergeCommit: hash || null };
  };
  if (res.status === 202) { // merge demorado: o Bitbucket devolve a URL da tarefa
    const location = res.headers.get('location');
    if (!location) return { ok: false, message: `merge aceito (HTTP 202) sem URL de acompanhamento; confira o PR #${prId}`, mergeCommit: null };
    for (let i = 0; i < attempts; i++) {
      await sleep(2000);
      const t = await fetch(location, { headers });
      if (!t.ok) return { ok: false, message: `acompanhando o merge: ${await apiError(t, token)}`, mergeCommit: null };
      const body = await t.json();
      if (body.task_status === 'SUCCESS') return done(body.merge_result);
      if (body.task_status && body.task_status !== 'PENDING') return { ok: false, message: scrub(`merge terminou com ${body.task_status}`, token), mergeCommit: null };
    }
    return { ok: false, message: `o merge do PR #${prId} não terminou a tempo; confira o PR`, mergeCommit: null };
  }
  if (!res.ok) return { ok: false, message: `merge recusado pela API: ${await apiError(res, token)}`, mergeCommit: null };
  return done(await res.json());
}

module.exports = { KINDS, kindOfBranch, decide, getPr, mergePr, scrub };
