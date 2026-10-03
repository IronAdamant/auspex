# Experiment: a slimmer test suite

Branch only (`experiment/slim-tests`). `main` keeps the full suite.

Question: does a suite built from end-to-end, integration and golden tests, with few unit tests,
catch as many real bugs as the full suite, and is it easier for an agent (Claude, Grok) to work with?

## Yardstick

Real bugs from this repo's history. For each fix commit, its `src/` change is reversed on today's
code (the bug goes back in), the suite runs, and a failing suite counts as a catch. 34 fixes:
14 reverse cleanly with `git apply -R`, 20 need a fuzzy `patch -R -F3`. One 312-line refactor
(43d15db) is left out. The same 34 mutants run against every variant.

## Variants

- **full**: the suite on `main` at b38e85f (770 tests).
- **slim A** (conservative): cut by rule, fixed before any per-test catch data was read:
  1. the test only reads a source file as text and asserts its wording;
  2. the test only asserts phrases in docs (kept: generated-sync checks, AGENT-CARD vs AGENTS,
     every documented command parses, door JS that actually runs);
  3. an in-process parseArgv twin of a shipped-CLI process test for the same rule.
  List: `slim-a.tsv`, applied with `drop-tests.mjs`.
- **slim B** (the user's rule): end-to-end, integration, golden, real data and security tests only;
  synchronous pure-function unit tests become golden tables (real inputs, recorded outputs).

## Results

(filled in when the runs finish)
