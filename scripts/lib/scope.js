// Escopo por tipo de branch:
//   feature/* -> só ambientes NÃO produtivos (não pode tocar em env/prod/ nem rm/)
//   release/* -> só PROD (pode tocar apenas em env/prod/, rm/ e catalog/)
// Outros prefixos (chore/, hotfix/...) não são restringidos aqui e também não disparam deploy.
const PROD_PATHS = ['env/prod/', 'rm/'];
const isProd = (f) => PROD_PATHS.some((p) => f.startsWith(p));

function checkScope(branch, files) {
  const problems = [];
  if (branch.startsWith('release/')) {
    for (const f of files) {
      if (!isProd(f) && !f.startsWith('catalog/')) problems.push(`${f}: release/* só pode alterar env/prod/, rm/ e catalog/`);
    }
  } else if (branch.startsWith('feature/')) {
    for (const f of files) {
      if (isProd(f)) problems.push(`${f}: feature/* não pode alterar PROD (env/prod/, rm/); use uma release/*`);
    }
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { checkScope };
