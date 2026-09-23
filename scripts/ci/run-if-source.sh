#!/bin/sh
# Uso: run-if-source.sh <prefixo-da-branch> <comando...>
# Executa o comando só se merge-source.txt começar com o prefixo (ex.: feature/ ou release/).
prefix="$1"; shift
src=$(cat merge-source.txt 2>/dev/null)
case "$src" in
  "$prefix"*) exec "$@" ;;
  *) echo "Origem do merge: '${src:-desconhecida}'. Ignorado (este passo é só para ${prefix}*)." ;;
esac
