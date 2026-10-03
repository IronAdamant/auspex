#!/bin/bash
# Usage: mutate.sh <label> <git-ref-for-tests>
# Puts each past bug back into src (one at a time) in a scratch worktree,
# runs the test suite found at <ref>, and records whether it fails.
set -u
S=${SLIM_SCRATCH:?set SLIM_SCRATCH to a scratch folder holding mutants/ fuzzy/ hand/}
REPO=$(git rev-parse --show-toplevel)
LABEL=$1
REF=$2
WT=$S/wt-$LABEL
OUT=$S/results-$LABEL
mkdir -p "$OUT"
DIRS=${DIRS:-"mutants fuzzy hand"}
git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
git -C "$REPO" worktree add --detach "$WT" "$REF" >/dev/null 2>&1 || { echo "worktree failed"; exit 1; }
ln -s "$REPO/examples/auspex-ts/node_modules" "$WT/examples/auspex-ts/node_modules"
cd "$WT/examples/auspex-ts"

run_suite() {
  npm run build:mcp >/dev/null 2>&1
  local start=$(date +%s)
  # unset live keys so no test reaches Solari
  env -u SOLARI_API_KEY -u AUSPEX_LIVE npx tsx --test --test-reporter=tap tests/*.test.ts > "$1" 2>&1
  echo $(( $(date +%s) - start ))
}

secs=$(run_suite "$OUT/_clean.tap")
cleanfail=$(grep -c '^# fail [1-9]' "$OUT/_clean.tap")
echo "clean run: ${secs}s, tests=$(grep '^# tests' "$OUT/_clean.tap" | awk '{print $3}'), fail-line-nonzero=$cleanfail" >> "$OUT/summary.txt"

for p in $(for d in $DIRS; do ls "$S"/$d/*.patch; done); do
  id=$(basename "$(dirname "$p")")/$(basename "$p" .patch)
  if [[ "$p" == *"/fuzzy/"* ]]; then
    patch -p1 -R -F3 -s -t -d "$WT" < "$p" >/dev/null 2>&1 || { echo "$id APPLY-FAILED" >> "$OUT/summary.txt"; git -C "$WT" checkout -- . ; git -C "$WT" clean -fdq examples/auspex-ts/src; continue; }
  else
    git -C "$WT" apply -R "$p" || { echo "$id APPLY-FAILED" >> "$OUT/summary.txt"; continue; }
  fi
  mkdir -p "$OUT/$(dirname "$id")"; secs=$(run_suite "$OUT/$id.tap")
  fails=$(grep '^# fail' "$OUT/$id.tap" | awk '{print $3}')
  trivial=$(grep -cE "SyntaxError|does not provide an export|Transform failed|Cannot find module" "$OUT/$id.tap")
  echo "$id fail=${fails:-?} trivialErrLines=$trivial ${secs}s" >> "$OUT/summary.txt"
  git -C "$WT" checkout -- .
  git -C "$WT" clean -fdq examples/auspex-ts/src
  find "$WT/examples/auspex-ts/src" -name '*.orig' -o -name '*.rej' | xargs rm -f 2>/dev/null
done
echo DONE >> "$OUT/summary.txt"
