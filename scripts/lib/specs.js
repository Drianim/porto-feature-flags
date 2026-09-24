// Confere o formato das specs de docs/specs/ (SDD dos scripts). O formato é o de docs/sdd/template.md.
// Uma spec é "aprovada" antes de virar código; "implementada" só quando todo critério de aceite está marcado.
const STATUS = ['rascunho', 'aprovada', 'implementada'];
const FRONT = ['spec', 'titulo', 'status', 'criado', 'atualizado'];
// Seções obrigatórias, nesta ordem.
const SECTIONS = ['Resumo', 'Contexto', 'Objetivo e fora de escopo', 'Critérios de aceite', 'Desenho', 'Arquivos afetados', 'Plano de implementação', 'Verificação', 'Riscos e reversão', 'Decisões'];
// Marcadores de pendência: não podem existir numa spec aprovada ou implementada.
const PENDING = /\b(TBD|TODO|FIXME)\b|\ba definir\b|\bpreencher depois\b/i;

function parse(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { front: null, body: text };
  const front = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) front[kv[1]] = kv[2].trim();
  }
  return { front, body: m[2] };
}

// Devolve a lista de problemas (vazia = spec ok). `fileName` é só o nome do arquivo (NNNN-slug.md).
function checkSpec(fileName, text) {
  const problems = [];
  const name = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(fileName);
  if (!name) problems.push('nome do arquivo deve ser NNNN-slug.md (4 dígitos, slug em minúsculas com hífen)');
  const { front, body } = parse(text);
  if (!front) return [...problems, 'frontmatter (--- ... ---) ausente'];
  for (const k of FRONT) if (!front[k]) problems.push(`frontmatter: campo "${k}" obrigatório`);
  if (front.status && !STATUS.includes(front.status)) problems.push(`frontmatter: status deve ser ${STATUS.join(' | ')}`);
  if (name && front.spec && front.spec !== name[1]) problems.push(`frontmatter: spec "${front.spec}" difere do número do arquivo (${name[1]})`);
  for (const k of ['criado', 'atualizado']) if (front[k] && !/^\d{4}-\d{2}-\d{2}$/.test(front[k])) problems.push(`frontmatter: ${k} deve ser AAAA-MM-DD`);

  const headings = [...body.matchAll(/^## (.+)$/gm)].map((h) => h[1].trim());
  let last = -1;
  for (const s of SECTIONS) {
    const i = headings.indexOf(s);
    if (i < 0) problems.push(`seção "## ${s}" ausente`);
    else if (i < last) problems.push(`seção "## ${s}" fora de ordem`);
    else last = i;
  }

  const section = (title) => {
    const m = new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body);
    return m ? m[1] : '';
  };
  const criteria = [...section('Critérios de aceite').matchAll(/^- \[( |x)\] (CA-\d+): .+$/gm)];
  if (!criteria.length) problems.push('"## Critérios de aceite" precisa de itens no formato "- [ ] CA-1: ..."');

  if (front.status === 'aprovada' || front.status === 'implementada') {
    const plan = section('Plano de implementação');
    const tasks = plan.split(/^### /m).slice(1);
    if (!tasks.length) problems.push('"## Plano de implementação" precisa de tarefas "### Task N: ..."');
    tasks.forEach((t, i) => {
      if (!/^Task \d+: .+/.test(t)) problems.push(`tarefa ${i + 1}: o título deve ser "### Task N: ..."`);
      if (!/\*\*Files:\*\*/.test(t)) problems.push(`tarefa ${i + 1}: falta o bloco **Files:**`);
      if (!/\*\*Interfaces:\*\*/.test(t)) problems.push(`tarefa ${i + 1}: falta o bloco **Interfaces:**`);
    });
    const pending = body.split('\n').find((l) => PENDING.test(l));
    if (pending) problems.push(`marcador de pendência numa spec ${front.status}: "${pending.trim().slice(0, 60)}"`);
  }
  if (front.status === 'implementada' && criteria.some((c) => c[1] === ' ')) {
    problems.push('spec implementada com critério de aceite ainda desmarcado');
  }
  return problems;
}

module.exports = { STATUS, FRONT, SECTIONS, parse, checkSpec };
