// Utilitários do preflight: qual tipo de branch é e qual o link de um clique para abrir o PR.
const KINDS = ['feature', 'update', 'remove', 'release'];
const branchKind = (branch) => KINDS.find((k) => branch.startsWith(`${k}/`)) || null;

// git@bitbucket.org:ws/repo.git | https://user@bitbucket.org/ws/repo.git -> link de novo PR
function prLink(remoteUrl, branch, dest = 'main') {
  const m = /bitbucket\.org[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl || '');
  return m ? `https://bitbucket.org/${m[1]}/${m[2]}/pull-requests/new?source=${branch}&dest=${dest}` : null;
}

module.exports = { KINDS, branchKind, prLink };
