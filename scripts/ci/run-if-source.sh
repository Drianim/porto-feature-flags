#!/bin/sh
# Uso: run-if-source.sh <prefixo[|prefixo...]> <comando...>
# Executa o comando só se merge-source.txt começar com algum dos prefixos (ex.: "feature/|update/" ou "release/").
prefixes="$1"; shift
src=$(cat merge-source.txt 2>/dev/null)
old_ifs="$IFS"; IFS='|'
for prefix in $prefixes; do
  case "$src" in
    "$prefix"*) IFS="$old_ifs"; exec "$@" ;;
  esac
done
IFS="$old_ifs"
echo "Origem do merge: '${src:-desconhecida}'. Ignorado (este passo é só para ${prefixes})."
