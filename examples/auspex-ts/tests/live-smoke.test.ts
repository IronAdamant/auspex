import assert from "node:assert/strict"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"
import { persistLiveProfile } from "../src/profile-persist.ts"
import { createClient, launchBrowser, pageForSession } from "../src/solari.ts"

const live = process.env.AUSPEX_LIVE === "1" && Boolean(process.env.SOLARI_API_KEY?.trim())

test("live Solari smoke is opt-in via AUSPEX_LIVE=1", { skip: !live }, async () => {
  const parsed = parseArgv(["check", "https://example.com", "--expect", "Example Domain"])
  assert.equal(parsed.status, "ok")
  const { runCheck } = await import("../src/check.ts")
  if (parsed.status !== "ok" || parsed.command.cmd !== "check") throw new Error("parse")
  const result = await runCheck(parsed.command.opts)
  assert.equal(result.ok, true)
  assert.equal(result.matched, true)
  assert.match(result.finalUrl, /example\.com/)
})

test("live profile persist carries localStorage on a new session", { skip: !live }, async () => {
  const name = `auspex-persist-probe-${Date.now()}`
  const marker = `persist-${Date.now()}`
  const solari = createClient()
  let profileId = ""
  try {
    const created = await solari.profiles.create({ name })
    profileId = created.id
    const first = await launchBrowser(solari, { profileId })
    try {
      const page = await pageForSession(first)
      await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 45_000 })
      await page.evaluate((m: string) => {
        localStorage.setItem("auspex_persist", m)
        document.cookie = `auspex_persist=${m}; path=/`
      }, marker)
      const state = await page.context().storageState()
      const saved = await persistLiveProfile({
        solari,
        profileId,
        sessionId: first.id,
        state,
      })
      assert.equal(saved.ok, true, saved.error)
      assert.ok((saved.cookies ?? 0) + (saved.origins ?? 0) > 0)
    } finally {
      await first.close()
    }
    const second = await launchBrowser(solari, { profileId })
    try {
      const page = await pageForSession(second)
      await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 45_000 })
      const seen = await page.evaluate(() => localStorage.getItem("auspex_persist"))
      assert.equal(seen, marker)
    } finally {
      await second.close()
    }
  } finally {
    if (profileId) await solari.profiles.delete(profileId).catch(() => undefined)
    await solari.close()
  }
})
