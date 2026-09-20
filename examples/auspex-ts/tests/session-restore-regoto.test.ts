import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { gotoWithSessionRestore } from "../src/solari.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function mockRestorePage(args: { landedUrl: string; restored: number }) {
  const gotos: string[] = []
  let current = "about:blank"
  const page = {
    goto: async (url: string) => {
      gotos.push(url)
      current = args.landedUrl
    },
    url: () => current,
    evaluate: async () => args.restored,
  }
  return { page, gotos }
}

test("gotoWithSessionRestore re-gotos after hydrate on persistable /dashboard", async () => {
  const { page, gotos } = mockRestorePage({
    landedUrl: "https://consistencyhub.io/dashboard",
    restored: 2,
  })
  const restored = await gotoWithSessionRestore(page as never, {
    url: "https://consistencyhub.io/dashboard",
    profile: true,
  })
  assert.equal(restored, 2)
  assert.deepEqual(gotos, [
    "https://consistencyhub.io/dashboard",
    "https://consistencyhub.io/dashboard",
  ])
})

test("gotoWithSessionRestore re-gotos after hydrate on non-persistable /", async () => {
  const { page, gotos } = mockRestorePage({
    landedUrl: "https://consistencyhub.io/",
    restored: 2,
  })
  const restored = await gotoWithSessionRestore(page as never, {
    url: "https://consistencyhub.io",
    profile: true,
  })
  assert.equal(restored, 2)
  assert.deepEqual(gotos, ["https://consistencyhub.io", "https://consistencyhub.io"])
})

test("gotoWithSessionRestore does not re-goto when restored is 0", async () => {
  const { page, gotos } = mockRestorePage({
    landedUrl: "https://consistencyhub.io/dashboard",
    restored: 0,
  })
  const restored = await gotoWithSessionRestore(page as never, {
    url: "https://consistencyhub.io/dashboard",
    profile: true,
  })
  assert.equal(restored, 0)
  assert.deepEqual(gotos, ["https://consistencyhub.io/dashboard"])
})

test("gotoWithSessionRestore does not re-goto without a profile", async () => {
  const { page, gotos } = mockRestorePage({
    landedUrl: "https://consistencyhub.io/dashboard",
    restored: 2,
  })
  const restored = await gotoWithSessionRestore(page as never, {
    url: "https://consistencyhub.io/dashboard",
  })
  assert.equal(restored, 2)
  assert.deepEqual(gotos, ["https://consistencyhub.io/dashboard"])
})

test("gotoWithSessionRestore drops the persistable-url re-goto guard", () => {
  const src = readFileSync(path.join(root, "src", "solari.ts"), "utf8")
  assert.match(src, /if \(opts\.profile && restored > 0\)/)
  assert.equal(src.includes("!isPersistableAppUrl(page.url())"), false)
})
