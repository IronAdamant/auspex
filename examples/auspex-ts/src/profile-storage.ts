import type { StorageState } from "@solarisdk/browser"
import { stillOnAuth } from "./sso.ts"

export const SESSION_STORAGE_PREFIX = "__auspex_ss__:"

export const PUBLIC_PROFILE_SAVE_ERROR =
  "refusing to save a public /landing session over the profile"

export type CookieRecord = {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "Strict" | "Lax" | "None"
  partitionKey?: string
}

export type OriginRecord = {
  origin: string
  localStorage?: Array<{ name: string; value: string }>
  indexedDB?: unknown
}

type EvalFn = (fn: () => unknown) => Promise<unknown>
type FrameLike = { url: () => string; evaluate: EvalFn }
type PageLike = FrameLike & { frames?: () => FrameLike[] }
type ContextLike = {
  storageState: (opts?: { indexedDB?: boolean }) => Promise<StorageState>
  pages: () => PageLike[]
  cookies?: () => Promise<CookieRecord[]>
}
type BrowserLike = { contexts: () => ContextLike[] }

export function originOf(url: string): string | undefined {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined
    return u.origin
  } catch {
    return undefined
  }
}

export function isPersistableAppUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (stillOnAuth(parsed)) return false
  const path = (parsed.pathname.replace(/\/+$/, "") || "/").toLowerCase()
  if (
    path === "/" ||
    path === "/landing" ||
    path === "/login" ||
    path === "/signup" ||
    path.startsWith("/auth")
  ) {
    return false
  }
  return true
}

/** /landing or a login page — profile reuse did not stay signed in. */
export function isLoggedOutLanding(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (stillOnAuth(parsed)) return true
  const path = (parsed.pathname.replace(/\/+$/, "") || "/").toLowerCase()
  return path === "/landing" || path.startsWith("/landing/")
}

export function cookiesForOrigin(cookies: CookieRecord[] | undefined, origin: string): CookieRecord[] {
  let host: string
  try {
    host = new URL(origin).hostname.toLowerCase()
  } catch {
    return []
  }
  return (cookies ?? []).filter((c) => {
    if (!c?.name) return false
    const d = (c.domain ?? "").replace(/^\./, "").toLowerCase()
    if (!d) return false
    return host === d || host.endsWith(`.${d}`)
  })
}

export type OriginStoreCounts = {
  cookies: number
  localStorage: number
  sessionStorage: number
}

export function originStoreCounts(state: StorageState, origin: string): OriginStoreCounts {
  const cookies = cookiesForOrigin(state.cookies as CookieRecord[] | undefined, origin).length
  const rec = ((state.origins ?? []) as OriginRecord[]).find((o) => o.origin === origin)
  let localStorage = 0
  let sessionStorage = 0
  for (const row of rec?.localStorage ?? []) {
    if (!row?.name) continue
    if (row.name.startsWith(SESSION_STORAGE_PREFIX)) sessionStorage += 1
    else localStorage += 1
  }
  return { cookies, localStorage, sessionStorage }
}

export function originHasLandedBytes(state: StorageState, origin: string): boolean {
  const c = originStoreCounts(state, origin)
  return c.cookies + c.localStorage + c.sessionStorage > 0
}

export function sessionItemsByOrigin(
  state: StorageState,
  prefix = SESSION_STORAGE_PREFIX,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const o of (state.origins ?? []) as OriginRecord[]) {
    if (!o?.origin) continue
    const items: Record<string, string> = {}
    for (const row of o.localStorage ?? []) {
      if (!row?.name?.startsWith(prefix)) continue
      const name = row.name.slice(prefix.length)
      if (name) items[name] = row.value ?? ""
    }
    if (Object.keys(items).length) out[o.origin] = items
  }
  return out
}

export function cookieKey(c: CookieRecord): string {
  return `${c.domain ?? ""}\0${c.name}\0${c.path ?? "/"}`
}

export function mergeStorageStates(base: StorageState, extra: StorageState): StorageState {
  const cookies = new Map<string, CookieRecord>()
  for (const c of [...(base.cookies ?? []), ...(extra.cookies ?? [])]) {
    if (!c?.name) continue
    cookies.set(cookieKey(c), c)
  }
  const origins = new Map<string, OriginRecord>()
  for (const o of [...(base.origins ?? []), ...(extra.origins ?? [])] as OriginRecord[]) {
    if (!o?.origin) continue
    const prev = origins.get(o.origin) ?? { origin: o.origin, localStorage: [] }
    const items = new Map<string, string>()
    for (const row of [...(prev.localStorage ?? []), ...(o.localStorage ?? [])]) {
      if (!row?.name) continue
      items.set(row.name, row.value ?? "")
    }
    origins.set(o.origin, {
      origin: o.origin,
      localStorage: [...items.entries()].map(([name, value]) => ({ name, value })),
      indexedDB: o.indexedDB ?? prev.indexedDB,
    })
  }
  return { cookies: [...cookies.values()], origins: [...origins.values()] }
}

export function foldSessionStorage(
  state: StorageState,
  origin: string,
  items: Array<{ name: string; value: string }>,
  prefix = SESSION_STORAGE_PREFIX,
): StorageState {
  if (!origin || items.length === 0) return state
  const extra: StorageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: items
          .filter((row) => row.name)
          .map((row) => ({ name: `${prefix}${row.name}`, value: row.value ?? "" })),
      },
    ],
  }
  return mergeStorageStates(state, extra)
}

export function hydrateSessionStorageInMemory(
  localStorage: Record<string, string>,
  sessionStorage: Record<string, string> = {},
  prefix = SESSION_STORAGE_PREFIX,
): Record<string, string> {
  const out = { ...sessionStorage }
  for (const [key, value] of Object.entries(localStorage)) {
    if (!key.startsWith(prefix)) continue
    const name = key.slice(prefix.length)
    if (name && out[name] == null) out[name] = value
  }
  return out
}

export function hydrateSessionStorageSource(
  itemsByOrigin: Record<string, Record<string, string>> = {},
  prefix = SESSION_STORAGE_PREFIX,
): string {
  return `(() => { try { const baked = ${JSON.stringify(itemsByOrigin)}; const items = baked[location.origin]; if (items) { for (const [k, v] of Object.entries(items)) { if (sessionStorage.getItem(k) == null) sessionStorage.setItem(k, String(v)); } } const prefix = ${JSON.stringify(prefix)}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !k.startsWith(prefix)) continue; const name = k.slice(prefix.length); if (name && sessionStorage.getItem(name) == null) sessionStorage.setItem(name, localStorage.getItem(k) ?? ""); } } catch {} })()`
}

/** Copy prefixed localStorage into sessionStorage after Playwright has restored origins. */
export async function hydrateSessionStorage(page: {
  evaluate: (fn: (prefix: string) => number, arg: string) => Promise<number>
}): Promise<number> {
  return page.evaluate((prefix) => {
    let n = 0
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !k.startsWith(prefix)) continue
        const name = k.slice(prefix.length)
        if (!name || sessionStorage.getItem(name) != null) continue
        sessionStorage.setItem(name, localStorage.getItem(k) ?? "")
        n += 1
      }
    } catch {
      /* opaque origins */
    }
    return n
  }, SESSION_STORAGE_PREFIX)
}

async function readSessionItems(frame: FrameLike): Promise<Array<{ name: string; value: string }>> {
  try {
    const rows = (await frame.evaluate(() => {
      const out: Array<{ name: string; value: string }> = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const name = sessionStorage.key(i)
        if (name) out.push({ name, value: sessionStorage.getItem(name) ?? "" })
      }
      return out
    })) as Array<{ name: string; value: string }>
    return Array.isArray(rows) ? rows.filter((row) => row?.name) : []
  } catch {
    return []
  }
}

async function captureContext(ctx: ContextLike): Promise<StorageState> {
  let state: StorageState = { cookies: [], origins: [] }
  try {
    state = await ctx.storageState({ indexedDB: true })
  } catch {
    try {
      state = await ctx.storageState()
    } catch {
      state = { cookies: [], origins: [] }
    }
  }
  if (typeof ctx.cookies === "function") {
    try {
      const extra = await ctx.cookies()
      state = mergeStorageStates(state, { cookies: extra, origins: [] })
    } catch {
      /* cookies() is best-effort */
    }
  }
  const pages = ctx.pages?.() ?? []
  for (const page of pages) {
    const frames = [page, ...(typeof page.frames === "function" ? page.frames() : [])]
    for (const frame of frames) {
      const origin = originOf(frame.url())
      if (!origin) continue
      const items = await readSessionItems(frame)
      state = foldSessionStorage(state, origin, items)
    }
  }
  return state
}

export async function captureStorageState(browser: BrowserLike): Promise<StorageState> {
  let merged: StorageState = { cookies: [], origins: [] }
  for (const ctx of browser.contexts()) {
    merged = mergeStorageStates(merged, await captureContext(ctx))
  }
  return merged
}
