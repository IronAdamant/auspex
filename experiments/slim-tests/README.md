# Experiment: a slimmer test suite

Branch only (`experiment/slim-tests`). `main` keeps the full suite.

Question: does a suite built from end-to-end, integration and golden tests, with few unit tests,
catch as many real bugs as the full suite, and is it easier for an agent (Claude, Grok) to work with?

## Yardstick

Real bugs from this repo's history. For each fix commit, the bug goes back into today's code, the
suite runs, and a failing suite counts as a catch. 33 bugs: 13 fix commits reverse cleanly
(`git apply -R`), 6 with a fuzzy `patch -R -F3`, and 14 that conflict with today's code were put
back by hand, one or two lines each (`craft-mutants.py`, patches in `mutants/hand/`). One 312-line
refactor (43d15db) is left out. The same 33 mutants run against every variant (`mutate.sh`).

## Variants

- **full**: the suite on `main` at b38e85f (770 tests).
- **slim A** (conservative): cut by rule, fixed before any per-test catch data was read:
  1. the test only reads a source file as text and asserts its wording;
  2. the test only asserts phrases in docs (kept: generated-sync checks, AGENT-CARD vs AGENTS,
     every documented command parses, door JS that actually runs);
  3. an in-process parseArgv twin of a shipped-CLI process test for the same rule.
  List: `slim-a.tsv`, applied with `drop-tests.mjs`.
- **slim B0**: slim A minus synchronous tests that neither start a process nor touch files (directly or
  through a helper), outside the security, real-data and contract files. List: `slim-b-drop.tsv`
  (rule: `slim-b-list.cjs`). No replacement.
- **slim B** (the user's rule): B0 plus golden tables. `record-goldens.ts` ran the 249 dropped tests
  once with every src export wrapped and kept each JSON-safe call as a row (673 rows); Solari error
  blame, schema refusals and the live receipts in `demo/` are hand-written tables (195 rows).

## Results (2026-10-03)

| | full | slim A | slim B0 | slim B |
|---|---|---|---|---|
| tests | 770 | 715 | 466 | 466 + 46 golden areas (868 rows) |
| hand-written test code | 21,064 lines | 19,915 | 14,799 | 14,917 + 1,098 lines of case tables |
| run time | 48 s | 51 s | 48 s | 49 s |
| real bugs caught | **33/33** | 32/33 | 29/33 | **31/33** |

Per bug: `results.tsv`; which tests failed: `results-detail.txt`.

What the misses say:

- **fcf67aa** (receipts must not name the home folder in `verify.runDir`): the only guard in the full
  suite was a test that greps the source for `toStatePath`. Slim A cut it by rule, and no behaviour
  test covers it in any variant. The grep test caught a real bug, but the fix is a behaviour test
  (a verify receipt's `runDir` under home reads `~/…`), not keeping the grep.
- **14ebd22** (`--fill` refuses a shown password and a one-time-code box): caught in the full suite by
  a unit test that stubs a global `document`. The recorder saw the call `probeVisibleControl("#code")`
  but not the stubbed page behind it, so no golden row could hold it. Security-critical and invisible
  to recording: a hand-written golden row with a fake control, or a kept unit test, is needed.
- **840551b** and **f5f27ee** were lost by B0 and won back by B's goldens (`solari-errors`, `sweep`).

Runtime does not move: it is spent in a few page-action tests that wait on real 12–15 s timers.

Failure message, same bug (f5f27ee), unit test vs golden:

```
full:   The input did not match the regular expression /bot check/. Input: "the live browser did not
        find the text, but a second browser with the saved login did: ..."
slim B: sweep: 1 row(s) changed.
        - classifySweepReceipt({"name":"home",...})
            recorded: {..."status":"unknown","detail":"the site showed the cloud browser a bot check ...","previousReason":"matched"}
            now:      {..."status":"unknown","detail":"the live browser did not find the text ...","previousReason":"matched","regressed":true}
```

The unit test stops at its first regex. The golden shows the whole result, including the worse
change: `regressed: true`, a bot wall reported as a regression.

## Reading

- Cutting by kind (source greps, doc phrases, twins) is nearly free: 1 bug lost, and that one points
  at a missing behaviour test.
- Dropping ~250 unit tests outright loses 4 of 33 (12%). Golden tables recorded from those same
  tests win back 2, at a fraction of the hand-written code.
- Goldens are blind to hidden inputs (globals, fakes, time not passed in). Those tests stay as code.
- Goldens fail on any output change, including intended wording. The cost is one re-record and a JSON
  diff to read; the unit-test cost was editing assertions (September: 39k test lines churned against
  31k src lines, and 186 of 210 src commits touched tests).
- Not measured: how often goldens raise intended-change failures over a month of real commits, and
  whether agents actually fix faster from a golden diff. Both need replaying real history.

## Round 2 (in progress): fewer lines, every bug caught

Overfitting guard: a **holdout** of 19 more real bugs (`mutants/holdout/`, 10 clean reversals of fix
commits + 9 put back by hand with `craft-holdout.py`) was fixed on 2026-10-03 before any round-2
design and is not run until the round-2 suite is final. Round-1's 33 bugs are `mutants/train/`.

Tools: `synth-mutants.ts` (401 operator mutants, max 6 per src file, fixed seed), `affected.mjs`
(test files that can see each src module), `run-mutants.mjs` (4 workers on a union checkout holding
every test of every variant, so one run per mutant scores all variants). Flake baseline: 6 clean
union runs under 3-way parallel load, no flaky test.

Duplication is not the lever: jscpd finds 3% copy-paste in tests (592 of 20,000 lines).
