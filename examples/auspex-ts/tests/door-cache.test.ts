import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { phoneHandoffUrl } from "../src/handoff-doors.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

test("each minted door link has a per-mint query so the cached page is not reused", () => {
  const url = phoneHandoffUrl("not.a.jwt", "", { profileName: "app-example-com", expiresAt: "2026-09-28T07:18:16.000Z" })
  assert.match(url, /^https:\/\/ironadamant\.com\/auspex\/phone\.html\?r=\d+#v=not\.a\.jwt/)
  const exp = new URL(url).searchParams.get("r")
  assert.equal(new URLSearchParams(url.split("#")[1]).get("exp"), exp)
})

test("Pages deploy versions exactly the three door scripts phone.html loads", () => {
  const phone = readFileSync(path.join(repo, "docs", "phone.html"), "utf8")
  const srcs = [...phone.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(srcs, ["./novnc-rfb.js", "./door-stream.js", "./door-page.js"])
  const pages = readFileSync(path.join(repo, ".github", "workflows", "pages.yml"), "utf8")
  assert.match(pages, /novnc-rfb\|door-stream\|door-page/)
  assert.match(pages, /-eq 3/)
})
