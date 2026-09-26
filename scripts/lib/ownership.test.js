const test = require('node:test');
const assert = require('node:assert');
const { checkOwnership, changedKeys } = require('./ownership');

const config = {
  platform: ['Plat@x.com'],
  teams: { 'squad-a': { members: ['ana@x.com', 'ANDRE@x.com'] }, 'squad-b': { members: ['bia@x.com'] }, 'squad-vazia': { members: [] } },
};
const check = (authors, changes) => checkOwnership({ authors, changes, config });
const edit = (key, team) => ({ key, before: team, after: team });

test('membro altera FF da própria equipe (ignora maiúsculas do e-mail)', () => {
  assert.deepStrictEqual(check(['ana@x.com'], [edit('ft_a', 'squad-a')]), { ok: true, problems: [] });
  assert.strictEqual(check(['andre@x.com'], [edit('ft_a', 'squad-a')]).ok, true);
});
test('membro de uma equipe não altera FF de outra: a mensagem diz FF, equipe dona, autor e o que fazer', () => {
  const r = check(['bia@x.com'], [edit('ft_a', 'squad-a')]);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /ft_a: FF da equipe "squad-a"; bia@x\.com não é membro dessa equipe nem da plataforma/);
  assert.match(r.problems[0], /Peça à equipe "squad-a" ou à plataforma/);
});
test('a equipe de plataforma altera FF de qualquer equipe', () => {
  assert.strictEqual(check(['plat@x.com'], [edit('ft_a', 'squad-a'), edit('ft_b', 'squad-b')]).ok, true);
});
test('FF nova: só membro da equipe declarada (ou a plataforma) cria', () => {
  assert.strictEqual(check(['ana@x.com'], [{ key: 'ft_n', before: null, after: 'squad-a' }]).ok, true);
  const r = check(['ana@x.com'], [{ key: 'ft_n', before: null, after: 'squad-b' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /FF da equipe "squad-b"/);
  assert.strictEqual(check(['plat@x.com'], [{ key: 'ft_n', before: null, after: 'squad-b' }]).ok, true);
});
test('apagar FF vale a equipe dona (a de antes)', () => {
  assert.strictEqual(check(['bia@x.com'], [{ key: 'ft_a', before: 'squad-a', after: null }]).ok, false);
  assert.strictEqual(check(['ana@x.com'], [{ key: 'ft_a', before: 'squad-a', after: null }]).ok, true);
});
test('transferir FF de equipe é só da plataforma, mesmo para quem é da origem ou do destino', () => {
  const t = [{ key: 'ft_a', before: 'squad-a', after: 'squad-b' }];
  for (const who of ['ana@x.com', 'bia@x.com']) {
    const r = check([who], t);
    assert.strictEqual(r.ok, false, who);
    assert.match(r.problems[0], /mudar a equipe de "squad-a" para "squad-b" é permitido só à equipe de plataforma/);
  }
  assert.strictEqual(check(['plat@x.com'], t).ok, true);
});
test('todos os autores precisam estar autorizados', () => {
  const r = check(['ana@x.com', 'bia@x.com'], [edit('ft_a', 'squad-a')]);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /bia@x\.com/);
  assert.doesNotMatch(r.problems[0], /ana@x\.com/);
});
test('PR com FFs de várias equipes: o autor precisa valer para cada uma', () => {
  const r = check(['ana@x.com'], [edit('ft_a', 'squad-a'), edit('ft_b', 'squad-b')]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /^ft_b:/);
});
test('equipe sem membros cadastrados: só a plataforma altera', () => {
  assert.strictEqual(check(['ana@x.com'], [edit('ft_v', 'squad-vazia')]).ok, false);
  assert.strictEqual(check(['plat@x.com'], [edit('ft_v', 'squad-vazia')]).ok, true);
});
test('sem autor identificado reprova; sem FF envolvida passa', () => {
  assert.match(check([], [edit('ft_a', 'squad-a')]).problems[0], /não consegui identificar o autor/);
  assert.strictEqual(check(['ana@x.com'], []).ok, true);
  assert.strictEqual(check(['ana@x.com'], [{ key: 'ft_x', before: null, after: null }]).ok, true);
});
test('equipe que não existe mais na config: só a plataforma altera', () => {
  assert.strictEqual(check(['ana@x.com'], [edit('ft_z', 'squad-extinta')]).ok, false);
});

test('chaves tocadas: flags/, env/ e as FFs de um RM; catálogo e outros arquivos não contam', () => {
  const ns = [
    { status: 'M', file: 'flags/ft_a.json' }, { status: 'A', file: 'env/nonprod/ft_b.json' }, { status: 'M', file: 'env/prod/ft_c.json' },
    { status: 'M', file: 'catalog/home/keys.json' }, { status: 'M', file: 'README.md' }, { status: 'A', file: 'rm/RM-1.json' },
  ];
  assert.deepStrictEqual(changedKeys(ns, (f) => (f === 'rm/RM-1.json' ? ['ft_d', 'ft_a'] : [])), ['ft_a', 'ft_b', 'ft_c', 'ft_d']);
});
