// Valida no PRÓPRIO Firebase (validateTemplate, que NÃO publica) o template que o deploy publicaria.
// Serve para o erro de sintaxe aparecer no PR, antes do merge, e não no Run (spec 0008).
const { apply } = require('./remote-config');

const POSITION = /line \d+, column \d+/i; // o parser do Firebase informa a posição dentro da expressão
const MAX_INDIVIDUAL = 60; // limite de chamadas extras para achar a condição culpada

const errorMessage = (e) => String((e && e.message) || e).replace(/\s+/g, ' ').trim();

// plan = build(...). Devolve { ok, message, culprits: [{ name, expression, message }] }.
// Em erro, valida cada condição do plano isoladamente (sobre o template atual) para dizer QUAL expressão o Firebase recusa.
async function validateRemote(rc, plan) {
  const current = await rc.getTemplate();
  const template = apply(JSON.parse(JSON.stringify(current)), plan);
  try {
    await rc.validateTemplate(template);
    return { ok: true, message: 'aceito pelo Firebase', culprits: [] };
  } catch (e) {
    const message = errorMessage(e);
    const culprits = [];
    for (const c of plan.conditions.slice(0, MAX_INDIVIDUAL)) {
      const t = JSON.parse(JSON.stringify(current));
      t.conditions = [...(t.conditions || []).filter((x) => x.name !== c.name), { name: c.name, expression: c.expression }];
      try { await rc.validateTemplate(t); } catch (err) {
        const m = errorMessage(err);
        // Só é culpa da expressão se o erro aponta uma posição nela; erro geral (limite de parâmetros...) se repetiria em todas.
        if (POSITION.test(m)) culprits.push({ name: c.name, expression: c.expression, message: m });
      }
    }
    return { ok: false, message, culprits };
  }
}

module.exports = { validateRemote };
