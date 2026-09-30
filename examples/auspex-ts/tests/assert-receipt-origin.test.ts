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

test("forbidden_host covers link-local and cloud metadata, not public or loopback hosts", () => {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("assert_receipt", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
urls = sys.argv[2:]
print(json.dumps([mod.forbidden_host(u) for u in urls]))
`
  const urls = [
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://127.0.0.1:8080/",
    "http://localhost/",
    "http://[::1]/",
    "http://[fd00:ec2::254]/",
    "https://example.com/",
    "https://app.lorari.com/member/",
  ]
  const out = spawnSync("python3", ["-c", py, ASSERT_RECEIPT_PY_PATH, ...urls], { encoding: "utf8" })
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(JSON.parse(out.stdout), [true, true, false, false, false, true, false, false])
})

test("the anonymous fetch refuses a redirect to cloud metadata without connecting to it", async () => {
  const { createServer } = await import("node:http")
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const path = await import("node:path")
  const { spawn } = await import("node:child_process")
  const server = createServer((_req, res) => {
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" })
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-redirect-"))
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ expect: "iam", screenshotPath: ".auspex/runs/x/screenshot.png", finalUrl: `http://127.0.0.1:${port}/` }))
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(path.join(path.dirname(ASSERT_RECEIPT_PY_PATH), "..", "demo", "ironadamant.png")))
  try {
    const out = await new Promise<string>((resolve) => {
      const child = spawn("python3", [ASSERT_RECEIPT_PY_PATH, dir])
      let stdout = ""
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")))
      child.on("close", () => resolve(stdout))
    })
    const parsed = JSON.parse(out) as { claimOk: boolean; claimErrors: string[] }
    assert.equal(parsed.claimOk, false)
    // This note (not "fetch failed" after a connect attempt) is what proves the redirect was refused.
    assert.ok(parsed.claimErrors.includes("finalUrl redirected to a link-local or cloud-metadata address; not followed"), JSON.stringify(parsed.claimErrors))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test("a public name whose DNS points at link-local or metadata is not fetched", () => {
  const py = `
import importlib.util, json, socket, sys
spec = importlib.util.spec_from_file_location("assert_receipt", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
answers = {"evil.example": "169.254.169.254", "mapped.example": "::ffff:169.254.169.254", "aws6.example": "fd00:ec2::254", "fine.example": "93.184.216.34"}
def fake(host, *_a, **_k):
    if host not in answers:
        raise socket.gaierror("no such host")
    return [(0, 0, 0, "", (answers[host], 0))]
socket.getaddrinfo = fake
urls = ["http://evil.example/", "http://mapped.example/", "http://aws6.example/", "http://fine.example/", "http://missing.example/"]
print(json.dumps([mod.resolves_forbidden(u) for u in urls]))
`
  const out = spawnSync("python3", ["-c", py, ASSERT_RECEIPT_PY_PATH], { encoding: "utf8" })
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(JSON.parse(out.stdout), [true, true, true, false, false])
})
