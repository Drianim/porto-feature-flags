#!/bin/sh
# Reconfere no commit de merge as regras do PR (escopo de pastas e FF nova x existente), para que um PR
# mergeado com pipeline vermelha não chegue ao deploy. Usa a origem lida em merge-source.txt e o 1º pai
# do commit de merge (main antes do merge) como base.
# Permissão por equipe (check-ownership): só a equipe dona da FF, ou a plataforma, altera a FF (autores = commits do PR).
# chore/* só pode ser mesclado por admin (config/approvers.json, "admins").
# A consulta ao Firebase é pulada aqui (--skip-remote): ela foi feita no PR e, depois do deploy, o próprio
# nome já existiria no Firebase (reexecutar a pipeline daria falso bloqueio).
src=$(cat merge-source.txt 2>/dev/null)
base=$(git rev-parse HEAD^1 2>/dev/null) || { echo "Sem commit anterior: nada a reconferir."; exit 0; }
case "$src" in
  feature/*|update/*|remove/*) node scripts/check-scope.js "$src" "$base" && node scripts/check-new-flags.js "$src" "$base" --skip-remote && node scripts/check-ownership.js "$src" "$base" ;;
  release/*) node scripts/check-scope.js "$src" "$base" && node scripts/check-ownership.js "$src" "$base" ;;
  chore/*) node scripts/check-merger.js "$src" HEAD ;;
  *) echo "Origem '${src:-desconhecida}': nada a reconferir (esta origem não publica)." ;;
esac
