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

/** State dir for a caller-supplied root. The package root maps to `stateDir`; any other root keeps `<root>/.auspex`. */
export function stateDirFor(root: string): string {
  return path.resolve(root) === packageRoot ? stateDir : path.join(root, ".auspex")
}

/** Receipt path: relative inside the package (`.auspex/runs/…` in a clone), absolute otherwise. */
export function toStatePath(absPath: string): string {
  const rel = path.relative(packageRoot, absPath)
  const out = rel.startsWith("..") || path.isAbsolute(rel) ? absPath : rel
  return out.replaceAll("\\", "/")
}

export async function ensureRunDir(): Promise<string> {
  const runsDir = path.join(stateDir, "runs")
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
  const runDir = path.join(runsDir, stamp)
  await mkdir(runDir, { recursive: true })
  return runDir
}
