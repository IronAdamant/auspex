import assert from "node:assert/strict"
import test from "node:test"
import {
  LIVE_HOST_CHANGED_MARK,
  adviseLiveHostChange,
  } from "../src/live-host-change.ts"
import { waitForProfileSave } from "../src/profile-persist.ts"

test("storage origin wins when the page URL is still the minted host", () => {
  const change = adviseLiveHostChange({
    profile: "myapp-example",
    mintUrl: "https://myapp.example",
    pageUrl: "https://myapp.example/dashboard",
    state: {
      origins: [{ origin: "https://app.socialaize.com", localStorage: [{ name: "k" }] }],
    },
  })
  assert.equal(change?.suggestedUrl, "https://app.socialaize.com")
  assert.equal(change?.suggestedProfile, "app-socialaize-com")
})

function awaitDeps(liveHost: string) {
  return {
    now: () => 10_000,
    sleep: async () => undefined,
    list: async () => [{ id: "p1", name: "myapp-example", version: 2 }],
    inspect: async () => ({ cookies: 2, origins: 1, sessionStorage: 2, liveHost }),
  }
}

test("await-login host change remints and does not tell the agent to finalize the old profile", async () => {
  const changed = await waitForProfileSave("myapp-example", {
    sinceVersion: 1,
    timeoutMs: 5_000,
    url: "https://myapp.example",
    deps: awaitDeps("app.socialaize.com"),
  })
  assert.equal(changed.status, "host-changed")
  assert.equal(changed.hostChanged, true)
  assert.equal(changed.profileHostMatch, false)
  assert.equal(changed.nextCall?.tool, "auspex_login")
  assert.equal(changed.nextCall?.url, "https://app.socialaize.com")
  assert.equal(changed.next.startsWith(LIVE_HOST_CHANGED_MARK), true)
  assert.equal(/soft advise/i.test(changed.next), false)
  const same = await waitForProfileSave("myapp-example", {
    sinceVersion: 1,
    timeoutMs: 5_000,
    url: "https://myapp.example",
    deps: awaitDeps("www.myapp.example"),
  })
  assert.equal(same.status, "completed")
  assert.equal(same.hostChanged, undefined)
  assert.match(same.next, /finalize-login/)
})

