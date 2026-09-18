import assert from "node:assert/strict"
import test from "node:test"
import { defaultProfileClaimCheck } from "../src/sandbox.ts"
import type { BrowserSession } from "@solarisdk/browser"
import { createClient } from "../src/solari.ts"

test("defaultProfileClaimCheck calls hydrateSessionStorage after navigation", async () => {
  let hydrateWasCalled = false
  let gotoUrl = ""
  let evaluateCalls: string[] = []

  const mockPage = {
    goto: async (url: string) => {
      gotoUrl = url
      return Promise.resolve()
    },
    waitForLoadState: async () => Promise.resolve(),
    evaluate: async (fn: Function | string) => {
      const fnStr = typeof fn === "function" ? fn.toString() : String(fn)
      evaluateCalls.push(fnStr)
      
      if (fnStr.includes("sessionStorage.setItem") && fnStr.includes("localStorage.getItem")) {
        hydrateWasCalled = true
        return 5
      }
      
      if (fnStr.includes("document.body")) {
        return "Document Editor"
      }
      
      return ""
    },
  }

  const mockContext = {
    pages: () => [mockPage],
    addInitScript: async () => undefined,
  }

  const mockBrowser = {
    id: "test-session-id",
    session: {
      storageState: {
        cookies: [],
        origins: [
          {
            origin: "https://consistencyhub.io",
            localStorage: [
              { name: "__auspex_ss__:accessToken", value: "test-token" },
              { name: "__auspex_ss__:userId", value: "user-123" },
            ],
          },
        ],
      },
    },
    contexts: () => [mockContext],
    newContext: async () => mockContext,
    close: async () => undefined,
  }

  const mockSolari = {
    sessions: {
      create: async () => ({
        id: "test-session-id",
        wsEndpoint: "ws://test",
        storageState: mockBrowser.session.storageState,
      }),
      releaseAndWait: async () => undefined,
    },
    profiles: {
      list: async () => [{ id: "profile-1", name: "test-profile" }],
    },
    close: async () => undefined,
  }

  const originalCreateClient = createClient
  let launchCalled = false

  try {
    (globalThis as any).createClient = () => mockSolari
    ;(globalThis as any).launchBrowser = async () => {
      launchCalled = true
      return mockBrowser as unknown as BrowserSession
    }
    ;(globalThis as any).pageForSession = async () => mockPage
    ;(globalThis as any).chromium = {
      connect: async () => mockBrowser,
    }

    const result = await defaultProfileClaimCheck({
      finalUrl: "https://consistencyhub.io/documents",
      expect: "Document Editor",
      profileId: "profile-1",
    })

    assert.equal(gotoUrl, "https://consistencyhub.io/documents", "should navigate to finalUrl")
    assert.equal(hydrateWasCalled, true, "should call hydrateSessionStorage after goto")
    assert.equal(result.claimOk, true, "should match expect text")
    assert.equal(result.sessionId, "test-session-id", "should return sessionId")
  } finally {
    delete (globalThis as any).createClient
    delete (globalThis as any).launchBrowser
    delete (globalThis as any).pageForSession
    delete (globalThis as any).chromium
  }
})

test("defaultProfileClaimCheck hydrates sessionStorage before evaluating page text", async () => {
  const callOrder: string[] = []

  const mockPage = {
    goto: async () => {
      callOrder.push("goto")
      return Promise.resolve()
    },
    waitForLoadState: async () => {
      callOrder.push("waitForLoadState")
      return Promise.resolve()
    },
    evaluate: async (fn: Function | string) => {
      const fnStr = typeof fn === "function" ? fn.toString() : String(fn)
      
      if (fnStr.includes("sessionStorage.setItem") && fnStr.includes("localStorage.getItem")) {
        callOrder.push("hydrateSessionStorage")
        return 3
      }
      
      if (fnStr.includes("document.body")) {
        callOrder.push("readBodyText")
        return "Document Editor"
      }
      
      return ""
    },
  }

  const mockContext = {
    pages: () => [mockPage],
    addInitScript: async () => undefined,
  }

  const mockBrowser = {
    id: "test-session-id",
    session: {
      storageState: {
        cookies: [],
        origins: [
          {
            origin: "https://consistencyhub.io",
            localStorage: [
              { name: "__auspex_ss__:token", value: "abc" },
            ],
          },
        ],
      },
    },
    contexts: () => [mockContext],
    newContext: async () => mockContext,
    close: async () => undefined,
  }

  const mockSolari = {
    sessions: {
      create: async () => ({
        id: "test-session-id",
        wsEndpoint: "ws://test",
        storageState: mockBrowser.session.storageState,
      }),
      releaseAndWait: async () => undefined,
    },
    profiles: {
      list: async () => [{ id: "p1", name: "test" }],
    },
    close: async () => undefined,
  }

  try {
    (globalThis as any).createClient = () => mockSolari
    ;(globalThis as any).launchBrowser = async () => mockBrowser as unknown as BrowserSession
    ;(globalThis as any).pageForSession = async () => mockPage

    await defaultProfileClaimCheck({
      finalUrl: "https://consistencyhub.io/app",
      expect: "Document Editor",
      profileId: "p1",
    })

    const hydrateIndex = callOrder.indexOf("hydrateSessionStorage")
    const readTextIndex = callOrder.indexOf("readBodyText")
    
    assert.notEqual(hydrateIndex, -1, "hydrateSessionStorage should be called")
    assert.notEqual(readTextIndex, -1, "readBodyText should be called")
    assert.ok(hydrateIndex < readTextIndex, "hydrateSessionStorage should be called before reading body text")
    
    const gotoIndex = callOrder.indexOf("goto")
    assert.ok(gotoIndex < hydrateIndex, "goto should be called before hydrateSessionStorage")
  } finally {
    delete (globalThis as any).createClient
    delete (globalThis as any).launchBrowser
    delete (globalThis as any).pageForSession
  }
})
