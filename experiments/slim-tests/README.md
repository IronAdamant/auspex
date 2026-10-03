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

## Round 2: fewer lines, every bug caught

Yardsticks, all scored only on bugs the full union of tests can catch at all:

- **training**: the 33 round-1 real bugs (`mutants/train/`) and synthetic batch 1 (401 operator
  mutants, max 6 per src file, fixed seed; 279 catchable);
- **validation**: synthetic batch 2 (597 more mutants, never the same place as batch 1; 420
  catchable);
- **holdout**: 19 more real bugs (`mutants/holdout/`), fixed before any round-2 design and not run
  until the end (18 catchable by any suite; the 19th is covered below).

Every kill is confirmed by rerunning the failing test twice in isolation with the mutant applied
(9 flaky pairs dropped in total). Tools: `synth-mutants.ts`, `affected.mjs`, `run-mutants.mjs`
(4 workers, 3 test processes each), `confirm-kills.mjs`, `score.mjs`, `cover.mjs`.

| suite | test code lines | holdout real bugs | training real bugs | batch 2 (unseen) |
|---|---|---|---|---|
| full (`main`) | 21,064 | 18/18 | 33/33 | 98.1% |
| slim A | 19,915 | 18/18 | 32/33 | 97.9% |
| slim B0 | 14,799 | 14/18 | 30/33 | 74.5% |
| slim B | 16,015 | 18/18 | 31/33 | 99.3% |
| greedy cover k=1 | ~4,500 bodies | 6/18 | 31/33 | 78.6% |
| greedy cover k=2 | ~7,000 bodies | 11/18 | 31/33 | 89.0% |
| **slim C** (cover k=2 + gaps, run directly) | 8,912 | **10/18** | 32/33 | 88.8% |
| **slim D** (B + gaps + 2 assertions + 3 tests, run directly) | **16,232 (−23%)** | **18/18, and 19/19 after the fix below** | **33/33** | **99.3%** |

Run time: full, A, B, D about 48 s; C 14 s (it drops the slow page-action timer tests).
Full tables: `round2-union-scores.tsv`, `round2-direct-scores.txt`.

### What the data says

1. **Pruning by a kill-matrix cover overfits.** Fitted to batch 1 it catches 100% of batch 1 and
   89% of batch 2; fitted the other way, 86.7%. k=3 only reaches 91%. On the sealed real-bug
   holdout, slim C caught 10 of 18. Of 55 tests with zero kills in training, 49 caught something
   in batch 2 and 6 batch-2 bugs were caught only by them: "zero kills" was sampling noise. Across
   all 1,031 mutants only 6 tests (74 lines) never catch anything.
2. **Cutting by kind and turning unit tests into golden tables generalises.** Slim B and D hold
   99.3% on unseen mutants (above the full suite's 98.1%: whole-output goldens catch changes that
   single assertions miss) and every catchable holdout bug.
3. **Mutation testing is best at finding gaps, not at deleting tests.** It found 25 untested
   branches (training data only) that one golden table of ~100 lines now covers, and two weak
   assertions (`receipt-diff`, `connect`) that pass with the bug in because the test folder is not
   under home. Setting `HOME` over the test folder makes them real.
4. **The holdout found a bug no suite caught**, the full one included: `connect` printing the
   receipt path with the home folder (ho-ba32203). After the holdout score was recorded, the
   connect success test was strengthened the same way; it now catches it.

Slim D is the recommended suite: every real bug caught (52 of 52 across training and holdout),
99.3% of unseen mutants, 23% fewer hand-written lines. "Much fewer lines" with no loss was not
reached by pruning; the remaining large cuts need new kinds of test (record-replay flow goldens,
docs generated from code), see `PROBATIO-HANDOFF.md`.

Two product observations recorded in `tests/golden/cases/gaps.ts`, not changed: the email
redactor swallows the host of `user@host` URLs, and a host tie in `selectLiveHost` goes to the
host that is not the minted one.

Mistakes made and corrected during round 2 (kept here so they are not repeated): TAP file headings
stamped the wrong file on failures (attribute by title); a load average of 66 made timing tests
flake (cap concurrency, confirm kills); a fuzzy-patch dry run was misread; the diff direction of
mutant patches was read backwards once; multi-file patches selected tests for their first file
only (15 patches rerun on every suite).
