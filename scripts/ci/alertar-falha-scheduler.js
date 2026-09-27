// Alerta de falha do nonprod-scheduler (spec 0029): abre uma GitHub Issue com título fixo reconhecível, ou
// comenta na já aberta com esse título em vez de duplicar. Chamado pelo passo `if: failure()` do workflow via
// actions/github-script. Função pura o suficiente para teste: recebe fetch/token/repo por injeção.
const TITULO = 'nonprod-scheduler: falha na publicação automática';

async function avisarFalha({ fetch, token, repo, runUrl, titulo = TITULO }) {
  const base = `https://api.github.com/repos/${repo}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const api = async (path, opts = {}) => {
    const r = await fetch(`${base}${path}`, { headers, ...opts });
    if (!r.ok) throw new Error(`GitHub API ${r.status} em ${path}`);
    return r.json();
  };
  const abertas = await api('/issues?state=open&per_page=100');
  const existente = abertas.find((i) => i.title === titulo && !i.pull_request);
  const corpo = `Falha na execução automática do rollout de NÃO PROD (nonprod-scheduler).\n\nRun: ${runUrl}`;
  if (existente) {
    await api(`/issues/${existente.number}/comments`, { method: 'POST', body: JSON.stringify({ body: corpo }) });
    return { action: 'commented', number: existente.number };
  }
  const created = await api('/issues', { method: 'POST', body: JSON.stringify({ title: titulo, body: corpo }) });
  return { action: 'created', number: created.number };
}

module.exports = { avisarFalha, TITULO };
