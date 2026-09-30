import { mkdtempSync } from "node:fs"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Local state (runs, ledger, traces, jobs, locks, editor-save, operator files).
 * AUSPEX_HOME wins. Under `node --test` each process gets a temp dir, so tests never
 * write fake runs or session ids into the operator's real `.auspex/`.
 * An npm install (npx cache or node_modules) uses `~/.auspex`, so saved-login handles,
 * jobs, and screenshots survive upgrades and sit at a path the agent can open.
 * A git clone keeps `<package>/.auspex`.
 */
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  root: string = packageRoot,
  home: string = homedir(),
): string {
  const explicit = env.AUSPEX_HOME?.trim()
  if (explicit) return path.resolve(explicit)
  if (env.NODE_TEST_CONTEXT) return mkdtempSync(path.join(tmpdir(), "auspex-test-state-"))
  if (root.split(path.sep).includes("node_modules")) return path.join(home, ".auspex")
  return path.join(root, ".auspex")
}

export const stateDir = resolveStateDir()

/**
 * Which install this is and where its state lives, so an agent can see its environment instead of
 * assuming it. stateDir is a display path (`~/…` or relative), never the account name.
 */
export function installInfo(
  env: NodeJS.ProcessEnv = process.env,
  root: string = packageRoot,
  home: string = homedir(),
): { install: "npm" | "clone" | "AUSPEX_HOME"; stateDir: string; command: string } {
  const install = env.AUSPEX_HOME?.trim() ? "AUSPEX_HOME" : root.split(path.sep).includes("node_modules") ? "npm" : "clone"
  // A full path (a clone's .auspex is not in the current folder), with the home folder as ~.
  const abs = resolveStateDir({ ...env, NODE_TEST_CONTEXT: "" }, root, home)
  const inHome = inside(home, abs)
  return { install, stateDir: inHome ? `~/${inHome.replaceAll("\\", "/")}` : abs, command: cliCommand(root) }
}

/** How to run this install from a shell: npm (`npx auspex-solari`) or a clone (`npx auspex`). */
export function cliCommand(root: string = packageRoot): string {
  return root.split(path.sep).includes("node_modules") ? "npx auspex-solari" : "npx auspex"
}

/** State dir for a caller-supplied root. The package root maps to `stateDir`; any other root keeps `<root>/.auspex`. */
export function stateDirFor(root: string): string {
  return path.resolve(root) === packageRoot ? stateDir : path.join(root, ".auspex")
}

function inside(parent: string, child: string): string | undefined {
  const rel = path.relative(parent, child)
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : undefined
}

/**
 * Receipt path. Relative inside the package (`.auspex/runs/…` in a clone), `~/…` under the
 * home dir (never the username; sandbox verify rejects home paths), absolute otherwise.
 */
export function toStatePath(absPath: string, home: string = homedir()): string {
  const inPackage = inside(packageRoot, absPath)
  if (inPackage) return inPackage.replaceAll("\\", "/")
  const inHome = inside(home, absPath)
  if (inHome) return `~/${inHome.replaceAll("\\", "/")}`
  return absPath.replaceAll("\\", "/")
}

/** Inverse of toStatePath: `~/` expands to the home dir, relative paths are under the package. */
export function resolveStatePath(p: string, home: string = homedir()): string {
  if (p.startsWith("~/")) return path.join(home, p.slice(2))
  return path.isAbsolute(p) ? p : path.join(packageRoot, p)
}

/** Run folders kept by default (about 150 KB each). AUSPEX_KEEP_RUNS overrides; 0 keeps every run. */
export const DEFAULT_KEEP_RUNS = 200
/** A run this young may still belong to a running command (its check, its door QR). Never pruned. */
export const RUN_PRUNE_MIN_AGE_MS = 60 * 60 * 1000
/** Only folders named like a run stamp are ever pruned. */
const RUN_FOLDER = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/

export function keepRunsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AUSPEX_KEEP_RUNS?.trim()
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_KEEP_RUNS
  return Number(raw)
}

/** Deletes run folders past the newest `keep` (by stamp), skipping any under an hour old. Returns the names removed. */
export async function pruneRuns(runsDir: string, keep: number, nowMs: number = Date.now()): Promise<string[]> {
  if (keep <= 0) return []
  const names = (await readdir(runsDir).catch(() => [] as string[])).filter((n) => RUN_FOLDER.test(n)).sort().reverse()
  const removed: string[] = []
  for (const name of names.slice(keep)) {
    const dir = path.join(runsDir, name)
    const st = await stat(dir).catch(() => undefined)
    if (!st?.isDirectory() || nowMs - st.mtimeMs < RUN_PRUNE_MIN_AGE_MS) continue
    await rm(dir, { recursive: true, force: true })
    removed.push(name)
  }
  return removed
}

/**
 * A new folder of its own under runs/ (a second run in the same second gets `-2`, so two checks never
 * share a screenshot). Then trims old runs so .auspex does not grow without end.
 */
export async function ensureRunDir(runsDir: string = path.join(stateDir, "runs")): Promise<string> {
  await mkdir(runsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
  let runDir = ""
  for (let n = 1; !runDir; n++) {
    const candidate = path.join(runsDir, n === 1 ? stamp : `${stamp}-${n}`)
    try {
      await mkdir(candidate)
      runDir = candidate
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err
    }
  }
  await pruneRuns(runsDir, keepRunsFromEnv()).catch(() => undefined)
  return runDir
}
