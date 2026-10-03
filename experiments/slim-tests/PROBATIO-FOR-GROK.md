# Probatio — brief for Grok (builder), from Claude (refiner)

Hello Grok. You build most of Probatio; I (Claude) refine and finish it. Read
`PROBATIO-HANDOFF.md` first: it has the why, the evidence from Auspex, and the lessons that cost
time. This page is how to build it so that both of us, ChatGPT, and agent swarms can use it well.

## The one rule

**Every claim Probatio makes must be checkable.** "This test is redundant", "this line is
untested", "the suite catches every ledger bug": each comes with the mutant id, the command that
reproduces it, and the evidence file. An agent acting on an unverifiable claim deletes the wrong
test.

## What makes a tool good for agents (build all of this in from day one)

1. **One JSON object on stdout per command**, with `schemaVersion`, `ok`, and `next` (one plain
   sentence) plus `nextCall` (the single next command, or none). Human text only behind `--human`.
   Exit 0 only when `ok` is true.
2. **Stable ids.** Mutants, tests, gaps and rows have ids that survive reruns (hash of file + span +
   operator for mutants; file + title for tests). Agents refer to them across sessions.
3. **`file:line` everywhere.** A gap is `src/sweep.ts:154 and-to-or s366`, not "a mutant in sweep".
4. **Short by default.** Top 10 gaps, a count of the rest, and the path to the full JSON. An agent's
   context is the scarcest resource; never dump 800 rows.
5. **Resumable and idempotent.** Long runs write progress to a state dir and resume where they
   stopped. Running a command twice gives the same answer.
6. **No prompts, no network, no telemetry.** Deterministic: fixed seeds, fixed clock in goldens.
7. **Budgets.** `--max-minutes`, `--max-mutants`. A run that hits its budget says what it covered.
8. **CLI and MCP are the same contract.** Every MCP tool is a CLI command; every flag is a JSON
   field. Build the CLI first; the MCP server is a thin wrapper.

## Swarm protocol (several agents, one repo)

- Work items are files: `.probatio/queue/<mutant-id>.json`. An agent claims one by atomic rename to
  `claimed/<agent>-<id>.json` with a lease time; expired leases return to the queue.
- Each agent works in its own git worktree. Results go to `.probatio/results/<id>.json`; they merge
  without conflicts because each file has one owner.
- Gap-fixing tasks ("write a row or test that kills mutant X") are done exactly when
  `probatio check-kill X` says the mutant dies on the agent's branch, and the suite stays green.
  That objective "done" is what makes the work safe to hand to a swarm.

## Build order and acceptance tests

Build in this order. Each step is done only when its acceptance test passes. Use the Auspex repo
(branch `experiment/slim-tests`) as the first real target: its numbers are known, so your output
can be checked against them.

1. **`mutate`** (start from `synth-mutants.ts`, `run-mutants.mjs`, `confirm-kills.mjs`,
   `affected.mjs`). Accept: on Auspex at commit b38e85f, the full suite kills every confirmed
   mutant the experiment recorded, within ±2%, and a mutant in a string literal is never produced.
   Every kill is confirmed by two isolated reruns; report flaky kills separately.
2. **`ledger`**. Accept: from Auspex history it rebuilds the 13 cleanly reverting fixes in
   `mutants/train/` and reports the conflicting ones as needing a hand-made mutant (do not fuzz-apply
   silently). Hand-made mutants live in `.probatio/ledger/` with the fix commit they stand for.
3. **`matrix`** (from `matrix-lib.mjs`, `score.mjs`, `cover.mjs`). Accept: reproduces the round-2
   table in `README.md`, including the cover's collapse on batch 2 and the holdout. The headline
   output is the gap list; pruning is advisory and never automatic (see the trap below).
4. **`golden`** (from `tests/golden.test.ts`, `record-goldens.ts`). Contract/wording split and
   invariants are required, not optional. Accept: changing a `next` sentence re-records with
   `--update wording`; changing an `ok` or `reason` fails unless a `Golden-Change:` trailer names the
   row; an invariant violation fails even after any update.
5. **`verify-change`**. Accept: on a branch that edits one function in Auspex, the report lists the
   affected tests, the diff-scoped mutants with caught/missed, and any golden contract changes, in
   under 3 minutes on a laptop.
6. **MCP server**, after the CLI is stable.

Probatio tests itself with Probatio: its own ledger, goldens and invariants from the first week.

## Traps (each one cost real time in the experiment)

- Do not attribute a failing test to a file from TAP headings; use unique titles or the runner's
  JSON reporter. Fail the run if titles are not unique.
- Do not run suites with unbounded parallelism; cap per-run concurrency, and confirm kills in
  isolation. Load-induced flakes look exactly like kills.
- Store patches in one direction and name it in the file (`mutant.patch` = apply to get the bug).
- Golden normalisation rewrites only this run's own folders, never literal paths in data.
- A recorder sees call arguments, not hidden inputs (globals, fakes, clocks); flag such tests as
  "keep as code" instead of recording them.
- Treat a test as integration when it reaches a process or file through a helper, not only directly.
- Write diffs with `diff -u` or the VCS, never by hand.
- **Do not build automatic pruning.** In round 2 a greedy cover fitted to 310 mutants kept 100% of
  them and caught only 10 of 18 sealed real bugs; 49 of 55 "zero-kill" tests caught something in
  the next batch. Probatio's value is finding gaps and guarding contracts, not deleting tests.
- A patch can span several files: select tests for all of them (a real bug looked uncaught
  because only the first file's tests ran).
- Score a suite against the bugs the full test union catches, never against itself.
- Never print a user's home path or name in outputs, fixtures or logs; normalise to `~`.

## How to leave things for me

Keep `NOTES-FOR-CLAUDE.md` at the repo root, newest first:

- **Decisions:** what you chose and the alternative you rejected, one line each.
- **Unsure:** anything you guessed, so I check it first.
- **Shortcuts:** anything stubbed, skipped, or not yet tested, with `file:line`.
- **Numbers:** acceptance-test results you actually ran (command + output), not expectations.

Please do not mark a step done without its acceptance output pasted there. I will start every
review by rerunning those commands.

## Ideas worth trying (not required for v0)

- **Flow goldens by record-replay:** record real HTTP and page states during a live run, replay
  offline, so async flows get end-to-end tests without hand-written fakes.
- **Generate docs from code** (CLI reference, field lists) so doc-sync tests disappear.
- **Language adapters:** Python next (AST via `ast`, pytest JSON report), behind the same contract.
- **Kill-map cache in the repo** so `verify-change` picks tests without running anything first.
- **"Explain this test" output:** for any test, which mutants only it kills; deleting a test with
  unique kills needs a reason in the commit, the same as a golden contract change.

Thank you. Build the small, checkable thing first; we can make it clever later.

— Claude
