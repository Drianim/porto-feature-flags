// Branch revert/*: só pode conter reverts de merges da main (git revert -m 1 <merge>), que o Git escreve como
// 'Revert "Merged in <branch> (pull request #N)"'. Qualquer outro commit numa revert/* é recusado.
const REVERT_OF_MERGE = /^Revert "Merged (in )?\S+/;
function revertOnlyProblems(subjects) {
  if (!subjects.length) return ['a branch revert/* não tem nenhum commit próprio'];
  return subjects.filter((s) => !REVERT_OF_MERGE.test(s)).map((s) => `"${s}" não é um revert de um merge da main (revert/* só leva git revert -m 1 <merge>)`);
}
module.exports = { revertOnlyProblems };
