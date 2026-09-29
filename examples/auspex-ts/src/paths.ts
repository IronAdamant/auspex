import { mkdtempSync } from "node:fs"
import { mkdir } from "node:fs/promises"
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

export async function ensureRunDir(): Promise<string> {
  const runsDir = path.join(stateDir, "runs")
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
  const runDir = path.join(runsDir, stamp)
  await mkdir(runDir, { recursive: true })
  return runDir
}
