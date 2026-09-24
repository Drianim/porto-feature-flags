// Utilitários do preflight: qual tipo de branch é e qual o link de um clique para abrir o PR.
const KINDS = ['feature', 'update', 'remove', 'release'];
const branchKind = (branch) => KINDS.find((k) => branch.startsWith(`${k}/`)) || null;

// Link de um clique para abrir o PR, a partir do remoto (SSH ou HTTPS):
//   GitHub:    https://github.com/<dono>/<repo>/compare/main...<branch>?expand=1
//   Bitbucket: https://bitbucket.org/<ws>/<repo>/pull-requests/new?source=<branch>&dest=main
function prLink(remoteUrl, branch, dest = 'main') {
  const gh = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl || '');
  if (gh) return `https://github.com/${gh[1]}/${gh[2]}/compare/${dest}...${branch}?expand=1`;
  const bb = /bitbucket\.org[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl || '');
  return bb ? `https://bitbucket.org/${bb[1]}/${bb[2]}/pull-requests/new?source=${branch}&dest=${dest}` : null;
}

module.exports = { KINDS, branchKind, prLink };
