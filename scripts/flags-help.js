#!/usr/bin/env node
// Lista os comandos de FF disponíveis (new/update/remove) e o que cada um faz.
const COMANDOS = [
  {
    cmd: 'npm run new:flag',
    status: 'ok',
    desc: 'cria flags/<key>.json + env/nonprod/<key>.json (exige branch feature/*)',
  },
  {
    cmd: 'npm run update:flag',
    status: 'pendente',
    desc: 'ainda não implementado',
  },
  {
    cmd: 'npm run remove:flag',
    status: 'pendente',
    desc: 'ainda não implementado',
  },
];

console.log('Comandos de FF disponíveis:');
for (const { cmd, status, desc } of COMANDOS) {
  const marca = status === 'ok' ? '✓' : '…';
  console.log(`  ${marca} ${cmd} — ${desc}`);
}
