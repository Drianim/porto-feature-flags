#!/bin/sh
# Roda depois do passo "Reconferir regras do merge" (GitHub Actions). Se ele FALHOU, prepara a reversão do merge ruim:
# cria a branch revert/pr-<n>-<origem>, empurra e imprime o link para abrir o PR. Nunca faz merge sozinho e nunca
# falha o passo (sempre sai com 0).
# Empurra pelo remoto "origin" do checkout, que já leva o GITHUB_TOKEN (o job precisa de permissions: contents: write).
# Env: RECHECK_EXIT_CODE (resultado da reconferência), GITHUB_REPOSITORY. REVERT_REMOTE_URL sobrescreve o remoto (testes).

if [ "${RECHECK_EXIT_CODE:-1}" = "0" ]; then exit 0; fi   # a reconferência passou: nada a reverter

src=$(cat merge-source.txt 2>/dev/null)
case "$src" in
  feature/*|update/*|remove/*|release/*|chore/*) ;;
  *) echo "Origem '${src:-desconhecida}': não publica, nada a reverter."; exit 0 ;;
esac

sha=$(git rev-parse HEAD)
if [ "$(git rev-list --parents -n 1 HEAD | wc -w | tr -d ' ')" != "3" ]; then
  echo "HEAD não é um commit de merge: reversão automática não se aplica."; exit 0
fi

# número do PR: "Merge pull request #N from ..." (GitHub) ou "... (pull request #N)" (histórico do Bitbucket)
pr=$(git log -1 --pretty=%B | sed -n -e 's/^Merge pull request #\([0-9][0-9]*\) .*/\1/p' -e 's/.*(pull request #\([0-9][0-9]*\)).*/\1/p' | head -1)
branch="revert/${pr:+pr-$pr-}$(echo "$src" | tr '/' '-')"
remote_url="${REVERT_REMOTE_URL:-}"
link="https://github.com/${GITHUB_REPOSITORY:-dono/repo}/compare/main...${branch}?expand=1"
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

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
remote=origin
if [ -n "$remote_url" ]; then
  git remote remove revert-origin >/dev/null 2>&1
  git remote add revert-origin "$remote_url"
  remote=revert-origin
fi

if git ls-remote --exit-code --heads "$remote" "$branch" >/dev/null 2>&1; then
  echo "A branch $branch já existe no remoto (reexecução?). Abra ou confira o PR: $link"; exit 0
fi

git checkout -q -b "$branch" || { echo "Não consegui criar a branch $branch."; manual; exit 0; }
if ! git revert -m 1 --no-edit "$sha" >/dev/null 2>&1; then
  git revert --abort >/dev/null 2>&1
  echo "Conflito ao reverter $sha (algo mais mexeu nos mesmos arquivos depois). Reversão automática abortada."
  manual; exit 0
fi

if ! git push "$remote" "$branch" 2>&1; then
  echo "Não consegui empurrar $branch. Confira se o job tem permissions: contents: write."
  manual; exit 0
fi

cat <<TXT

============================================================
Merge $sha violou as regras. Preparei a reversão em '$branch'
(main antes do merge: $base_sha).
Abra o PR e mescle (depois de a pipeline do PR passar): $link
============================================================
TXT
exit 0
