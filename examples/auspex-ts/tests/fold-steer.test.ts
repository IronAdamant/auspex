import assert from "node:assert/strict"
import test from "node:test"
import { foldLeadBlockedByDrain, foldMissFinalizeGuide, idpOnlySaveGuide, isIdpOnlySave, shouldSteerToFinalize } from "../src/fold-steer.ts"
import { cookieHostIsIdp } from "../src/login-trace.ts"
import { profileClaimSessionCreate } from "../src/launch-options.ts"
import { sameProductAdopt, sameProductHosts } from "../src/live-host-change.ts"
import { adviseLiveHostChange } from "../src/live-host-change.ts"

const TODAY_IDP_HOSTS = ["live.com", "login.live.com", "login.microsoft.com", "login.microsoftonline.com"]

const PHONE_SAVE_HOSTS = [
  "google.com",
  "live.com",
  "login.live.com",
  "login.microsoft.com",
  "login.microsoftonline.com",
  "www.google.com",
]

test("host-change detection treats country suffixes and shared hosting as many sites, not one", async () => {
  const { hostsAlign } = await import("../src/live-host-change.ts")
  const { registeredDomain } = await import("../src/http-url.ts")
  // Different companies under a country suffix, or on a shared host, are different sites.
  assert.equal(hostsAlign("app.shopa.com.sg", "app.shopb.com.sg"), false)
  assert.equal(hostsAlign("portal.acme.org.uk", "portal.other.org.uk"), false)
  assert.equal(hostsAlign("myapp.vercel.app", "someone-else.vercel.app"), false)
  assert.equal(hostsAlign("me.github.io", "you.github.io"), false)
  // Siblings of one site still align.
  assert.equal(hostsAlign("app.shopa.com.sg", "www.shopa.com.sg"), true)
  assert.equal(hostsAlign("app.example.co.uk", "auth.example.co.uk"), true)
  assert.equal(hostsAlign("www.tldraw.com", "tldraw.com"), true)
  assert.equal(hostsAlign("grok.x.ai", "x.ai"), true)
  assert.equal(registeredDomain("preview.myapp.vercel.app"), "myapp.vercel.app")
  assert.equal(registeredDomain("x.up.railway.app"), "x.up.railway.app")
  assert.equal(registeredDomain("vercel.app"), "vercel.app")
  assert.equal(registeredDomain("App.Example.COM."), "example.com")
})
