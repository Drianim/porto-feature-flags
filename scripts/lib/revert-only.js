// Branch revert/*: só pode conter reverts de merges da main (git revert -m 1 <merge>). O Git escreve essa mensagem
// como 'Revert "Merged in <branch> (pull request #N)"' (Bitbucket, histórico) ou 'Revert "Merge pull request #N
// from <owner>/<branch>"' (GitHub, desde a spec 0010). Qualquer outro commit numa revert/* é recusado.
const REVERT_OF_MERGE_BITBUCKET = /^Revert "Merged (in )?\S+/;
const REVERT_OF_MERGE_GITHUB = /^Revert "Merge pull request #\d+ from \S+/;
function revertOnlyProblems(subjects) {
  if (!subjects.length) return ['a branch revert/* não tem nenhum commit próprio'];
  return subjects.filter((s) => !REVERT_OF_MERGE_BITBUCKET.test(s) && !REVERT_OF_MERGE_GITHUB.test(s)).map((s) => `"${s}" não é um revert de um merge da main (revert/* só leva git revert -m 1 <merge>)`);
}
module.exports = { revertOnlyProblems };
