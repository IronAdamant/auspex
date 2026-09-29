import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { ASSERT_RECEIPT_PY_PATH } from "../src/receipt.ts"

function originErrors(requested: string, finalUrl: string): string[] {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("assert_receipt", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)
print(json.dumps(mod.validate_url_origin(sys.argv[2], sys.argv[3])))
`
  const out = spawnSync("python3", ["-c", py, ASSERT_RECEIPT_PY_PATH, requested, finalUrl], {
    encoding: "utf8",
  })
  assert.equal(out.status, 0, out.stderr || out.stdout)
  return JSON.parse(out.stdout) as string[]
}

test("validate_url_origin allows prefix-anchored www-flip and rejects notwww substring strip", () => {
  assert.deepEqual(originErrors("https://ironadamant.com/", "https://www.ironadamant.com/"), [])
  assert.deepEqual(originErrors("https://www.checkpointprojects.com/", "https://checkpointprojects.com/"), [])
  assert.deepEqual(originErrors("http://example.com/", "https://example.com/"), [])
  const bad = originErrors("https://notwww.example.com/", "https://not.example.com/")
  assert.ok(bad.length > 0)
  assert.match(bad[0] ?? "", /origin/)
})

function pageText(html: string): string {
  const py = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("assert_receipt", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)
sys.stdout.write(mod.normalize(mod.html_to_text(sys.argv[2])))
`
  const out = spawnSync("python3", ["-c", py, ASSERT_RECEIPT_PY_PATH, html], { encoding: "utf8" })
  assert.equal(out.status, 0, out.stderr || out.stdout)
  return out.stdout
}

test("anonymous claim reads page text, not the <title> or a <template>", () => {
  // example.com after its 2026 redesign: "Example Domain" is only the title.
  const text = pageText(
    "<html><head><title>Example Domain</title><style>p{}</style></head><body><p>This domain is for use in documentation examples.</p><template><p>Hidden Words</p></template></body></html>",
  )
  assert.equal(text.includes("Example Domain"), false)
  assert.equal(text.includes("Hidden Words"), false)
  assert.match(text, /documentation examples/)
})
