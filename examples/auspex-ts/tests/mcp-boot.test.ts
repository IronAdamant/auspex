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
  assert.match(src, /await import\("\.\/desktop\.ts"\)/)
  assert.match(src, /from "\.\/job-store\.ts"/)
  assert.match(src, /from "\.\/tool-copy\.ts"/)
})
