import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("mcp-tools static imports stay light (no desktop/sandbox/check/profiles)", () => {
  const src = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  const staticImports = [...src.matchAll(/^import .* from "(\.\/[^"]+)"/gm)].map((m) => m[1])
  for (const banned of ["./desktop.ts", "./sandbox.ts", "./check.ts", "./profiles.ts", "./job.ts", "./runners.ts"]) {
    assert.equal(staticImports.includes(banned), false, `mcp-tools must not statically import ${banned}`)
  }
  assert.match(src, /await import\("\.\/runners\.ts"\)/)
  assert.match(src, /runDesktopDoor/)
  assert.equal(src.includes('await import("./desktop.ts")'), false, "desktop goes through runners.runDesktopDoor")
  assert.match(src, /from "\.\/job-store\.ts"/)
  assert.match(src, /from "\.\/tool-copy\.ts"/)
})

function localValueImports(file: string): string[] {
  const src = readFileSync(file, "utf8")
  const specs: string[] = []
  const starts: number[] = []
  for (const match of src.matchAll(/(?:^|\n)(?:import|export)\s+/g)) {
    const at = match.index ?? 0
    starts.push(src[at] === "\n" ? at + 1 : at)
  }
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i]!
    const statement = src.slice(begin, starts[i + 1] ?? src.length)
    const from = statement.match(/\sfrom\s+"(\.\/[^"]+)"/)
    if (!from?.[1]) continue
    const clause = statement.slice(statement.indexOf(" "), statement.indexOf(" from")).trim()
    if (/^type\b/.test(clause)) continue
    if (clause.startsWith("{")) {
      const inner = clause.slice(1, clause.lastIndexOf("}"))
      const values = inner
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !part.startsWith("type "))
      if (values.length === 0) continue
    }
    specs.push(from[1])
  }
  return specs
}

test("cli help graph does not load job.ts, check.ts, or the Solari client", () => {
  const start = path.join(root, "src", "cli.ts")
  const seen = new Set<string>()
  const pending = [start]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of localValueImports(file)) {
      pending.push(path.resolve(path.dirname(file), spec))
    }
  }
  const rel = [...seen].map((file) => path.relative(path.join(root, "src"), file))
  for (const banned of ["job.ts", "check.ts", "solari.ts", "profiles.ts", "runners.ts"]) {
    assert.equal(rel.includes(banned), false, `cli static graph must not include ${banned}`)
  }
  assert.equal(localValueImports(start).includes("./job-cli.ts"), true)
})
