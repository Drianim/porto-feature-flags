// Escopo por tipo de branch:
//   feature/* e update/* -> só ambientes NÃO produtivos (não podem tocar em env/prod/ nem rm/)
//   release/* -> só PROD (pode tocar apenas em env/prod/, rm/ e catalog/)
//   remove/*  -> só APAGA FFs (ver checkScopeChanges)
// Outros prefixos (chore/, hotfix/...) não são restringidos aqui e também não disparam deploy.
const PROD_PATHS = ['env/prod/', 'rm/'];
const isProd = (f) => PROD_PATHS.some((p) => f.startsWith(p));

function checkScope(branch, files) {
  const problems = [];
  if (branch.startsWith('release/')) {
    for (const f of files) {
      if (!isProd(f) && !f.startsWith('catalog/')) problems.push(`${f}: release/* só pode alterar env/prod/, rm/ e catalog/`);
    }
  } else if (branch.startsWith('feature/') || branch.startsWith('update/')) {
    for (const f of files) {
      if (isProd(f)) problems.push(`${f}: ${branch.split('/')[0]}/* não pode alterar PROD (env/prod/, rm/); use uma release/*`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// Versão com status do git (A/M/D): remove/* só pode APAGAR arquivos de FF (flags/, env/nonprod/, env/prod/, rm/);
// catalog/ é regenerado e pode mudar. As demais branches seguem checkScope (só por caminho).
const REMOVABLE = ['flags/', 'env/nonprod/', 'env/prod/', 'rm/'];
function checkScopeChanges(branch, changes) {
  if (!branch.startsWith('remove/')) return checkScope(branch, changes.map((c) => c.file));
  const problems = [];
  for (const { status, file } of changes) {
    if (file.startsWith('catalog/')) continue;
    if (!REMOVABLE.some((p) => file.startsWith(p))) problems.push(`${file}: remove/* só pode apagar arquivos em flags/, env/nonprod/, env/prod/ e rm/`);
    else if (status !== 'D') problems.push(`${file}: remove/* só apaga (status ${status}); criar ou alterar exige feature/*, update/* ou release/*`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { checkScope, checkScopeChanges };
