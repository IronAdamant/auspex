#!/bin/bash
# Build slim C from slim A (b5ef60d) + the golden tables, keeping only the tests cover.mjs chose
# (k=2) plus the kept-by-rule tests. Run from examples/auspex-ts.
set -euo pipefail
X=../../experiments/slim-tests
git checkout b5ef60d -- tests
git checkout f574dd0 -- tests/golden.test.ts tests/golden
git checkout HEAD -- tests/golden.test.ts tests/golden/out/paths.json 2>/dev/null || true
cp $X/receipt-diff.strengthened.test.ts tests/receipt-diff.test.ts
node $X/drop-tests.mjs tests $X/slim-c-drop.tsv > /dev/null
for a in $(cat $X/slim-c-golden-drop.txt); do rm -f tests/golden/cases/$a.ts tests/golden/out/$a.json; done
for f in tests/*.test.ts; do
  [ "$f" = tests/golden.test.ts ] && continue
  [ "$(grep -cE '^(test|it)\(' "$f")" = 0 ] && rm "$f"
done
npx tsx $X/prune-unused.ts
