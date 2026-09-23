#!/bin/sh
# Imprime a branch de origem do PR mergeado (mensagem "Merged in <branch> (pull request #N)").
# Vazio se não for possível identificar (ex.: fast-forward ou push direto).
git log -1 --pretty=%B | sed -n 's/^Merged in \([^ ]*\) (pull request.*/\1/p' | head -1
