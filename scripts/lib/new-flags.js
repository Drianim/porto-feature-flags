// FF nova x alteração de FF existente:
//   feature/* -> só cria FF NOVA (nome não pode existir no repo nem no Firebase NÃO PROD)
//   update/*  -> só altera FF que JÁ existe
const keyOf = (file) => file.replace(/^(flags|env\/nonprod)\//, '').replace(/\.json$/, '');

// "git diff --name-status" -> [{ status: 'A'|'M'|'D', file }]
function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((l) => {
    const parts = l.split('\t');
    return { status: parts[0][0], file: parts[parts.length - 1] };
  });
}

// Chave nova = flags/<key>.json foi ADICIONADO. Qualquer outra mudança em flags/ ou env/nonprod/ é alteração.
function classify(changes) {
  const newKeys = new Set();
  const changed = new Set();
  for (const { status, file } of changes) {
    if (!/^(flags|env\/nonprod)\/.+\.json$/.test(file)) continue;
    const key = keyOf(file);
    if (file.startsWith('flags/') && status === 'A') newKeys.add(key);
    else changed.add(key);
  }
  for (const k of newKeys) changed.delete(k);
  return { newKeys: [...newKeys], changedKeys: [...changed] };
}

function evaluate({ mode, newKeys, changedKeys, repoKeys, remoteKeys }) {
  const lower = (list) => new Set(list.map((k) => k.toLowerCase()));
  const repo = lower(repoKeys);
  const remote = lower(remoteKeys);
  const problems = [];
  if (mode === 'feature') {
    for (const k of changedKeys) {
      problems.push(`${k}: essa FF já existe. Alterar FF existente deve ser feito numa branch update/* (feature/* é só para FF nova)`);
    }
    for (const k of newKeys) {
      if (repo.has(k.toLowerCase())) problems.push(`${k}: já existe em main (nome duplicado, mesmo ignorando maiúsculas). Para alterar, use uma branch update/*`);
      else if (remote.has(k.toLowerCase())) problems.push(`${k}: já existe no Firebase NÃO PROD. Para alterar, use uma branch update/*; se é uma FF nova, escolha outro nome`);
    }
  } else if (mode === 'update') {
    for (const k of newKeys) problems.push(`${k}: é uma FF nova. Criar FF deve ser feito numa branch feature/* (update/* é só para FF que já existe)`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { keyOf, parseNameStatus, classify, evaluate };
