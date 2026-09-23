#!/bin/sh
# Imprime a branch de origem do merge, lendo a 1ª linha da mensagem do commit. Formatos aceitos:
#   "Merged in <branch> (pull request #N)"   (merge por PR)
#   "Merged <branch> into <destino>"         (merge de branch)
# Vazio se não for possível identificar (ex.: fast-forward, squash sem esse padrão, push direto).
git log -1 --pretty=%B | head -1 | sed -n \
  -e 's/^Merged in \([^ ]*\) (pull request.*/\1/p' \
  -e 's/^Merged \([^ ]*\) into .*/\1/p' | head -1
