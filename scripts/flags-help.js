#!/usr/bin/env node
// Lista os comandos de FF (new/update/remove); adapta a saída à branch atual.
const { execSync } = require('child_process');
const { root } = require('./lib/common');
const { branchKind } = require('./lib/preflight');

const FLUXOS = [
  {
    tipo: 'feature',
    cmd: 'new:flag',
    status: 'ok',
    desc: 'cria flags/<key>.json + env/nonprod/<key>.json (exige branch feature/*)',
    args: '-- <chave> --team <equipe> --criticality <baixa|media|alta|critica> --description "..." --platforms <android|ios|ambas> --min-version <x.y.z>',
  },
  {
    tipo: 'update',
    cmd: 'update:flag',
    status: 'pendente',
    desc: 'ainda não implementado',
    args: '',
  },
  {
    tipo: 'remove',
    cmd: 'remove:flag',
    status: 'pendente',
    desc: 'ainda não implementado',
    args: '',
  },
];

const linhaComando = ({ cmd, status, desc, args }) => {
  if (status !== 'ok') return `npm run ${cmd} — ${desc}`;
  return `npm run ${cmd} ${args} — ${desc}`;
};

function ajudaCompleta() {
  console.log('Nenhum fluxo de FF ativo nesta branch. Escolha o que fazer:');
  FLUXOS.forEach((f, i) => {
    console.log(`\n${i + 1}. ${nomeFluxo(f.tipo)}:`);
    console.log(`   git checkout -b ${f.tipo}/<nome>`);
    console.log(`   ${linhaComando(f)}`);
  });
}

function ajudaFoco(tipoAtual) {
  const atual = FLUXOS.find((f) => f.tipo === tipoAtual);
  console.log(`Branch ${tipoAtual}/*: ${linhaComando(atual)}`);
  console.log('\nOutros comandos (referência):');
  for (const f of FLUXOS) {
    if (f.tipo === tipoAtual) continue;
    console.log(`  ${linhaComando(f)}`);
  }
}

function nomeFluxo(tipo) {
  return { feature: 'Criar FF nova', update: 'Alterar FF existente', remove: 'Remover FF' }[tipo];
}

const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim();
const tipoAtual = branchKind(branch);
if (tipoAtual === 'feature' || tipoAtual === 'update' || tipoAtual === 'remove') ajudaFoco(tipoAtual);
else ajudaCompleta();
