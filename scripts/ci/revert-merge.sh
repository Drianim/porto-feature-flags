#!/bin/sh
# Roda no after-script do step "Reconferir regras do merge". Se ele FALHOU, prepara a reversão do merge ruim:
# cria a branch revert/pr-<n>-<origem>, empurra por SSH e imprime o link de um clique para abrir o PR.
# Nunca faz merge sozinho e nunca falha o step (sempre sai com 0).
# Pré-requisito (uma vez): chave SSH do Pipelines cadastrada como Access key com escrita (ver README).
# Env do Bitbucket: BITBUCKET_EXIT_CODE, BITBUCKET_REPO_FULL_NAME. REVERT_REMOTE_URL sobrescreve o remoto (testes).

if [ "${BITBUCKET_EXIT_CODE:-1}" = "0" ]; then exit 0; fi   # a reconferência passou: nada a reverter

src=$(cat merge-source.txt 2>/dev/null)
case "$src" in
  feature/*|update/*|remove/*|release/*|chore/*) ;;
  *) echo "Origem '${src:-desconhecida}': não publica, nada a reverter."; exit 0 ;;
esac

sha=$(git rev-parse HEAD)
if [ "$(git rev-list --parents -n 1 HEAD | wc -w | tr -d ' ')" != "3" ]; then
  echo "HEAD não é um commit de merge: reversão automática não se aplica."; exit 0
fi

pr=$(git log -1 --pretty=%B | sed -n 's/.*(pull request #\([0-9][0-9]*\)).*/\1/p' | head -1)
branch="revert/${pr:+pr-$pr-}$(echo "$src" | tr '/' '-')"
remote_url="${REVERT_REMOTE_URL:-git@bitbucket.org:${BITBUCKET_REPO_FULL_NAME}.git}"
link="https://bitbucket.org/${BITBUCKET_REPO_FULL_NAME:-workspace/repo}/pull-requests/new?source=${branch}&dest=main"
base_sha=$(git rev-parse HEAD^1)

manual() {
  cat <<TXT
Reversão manual (rode no seu computador):
  git fetch origin && git checkout -b $branch origin/main
  git revert -m 1 $sha
  git push -u origin $branch
  depois abra: $link
TXT
}

git config user.name "Pipelines (reversão automática)"
git config user.email "pipelines@bitbucket.org"
git remote remove revert-origin >/dev/null 2>&1
git remote add revert-origin "$remote_url"

if git ls-remote --exit-code --heads revert-origin "$branch" >/dev/null 2>&1; then
  echo "A branch $branch já existe no remoto (reexecução?). Abra ou confira o PR: $link"; exit 0
fi

git checkout -q -b "$branch" || { echo "Não consegui criar a branch $branch."; manual; exit 0; }
if ! git revert -m 1 --no-edit "$sha" >/dev/null 2>&1; then
  git revert --abort >/dev/null 2>&1
  echo "Conflito ao reverter $sha (algo mais mexeu nos mesmos arquivos depois). Reversão automática abortada."
  manual; exit 0
fi

if ! git push revert-origin "$branch" 2>&1; then
  echo "Não consegui empurrar $branch. Confira se a chave SSH do Pipelines está cadastrada como Access key com escrita."
  manual; exit 0
fi

cat <<TXT

============================================================
Merge $sha violou as regras. Preparei a reversão em '$branch'
(main antes do merge: $base_sha).
Abra o PR com um clique e mergeie: $link
============================================================
TXT
exit 0
