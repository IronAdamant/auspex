/** Pure await-login steer. Same order every time. waitForProfileSave stays the poll. */

import {
  editorSaveHungGuide,
  profileBusyAwaitGuide,
  streamExpiredGuide,
} from "./await-fail.ts"
import type { EditorFoldResult } from "./editor-fold.ts"
import { classifySeedReadiness, cookieSaveGuide, type SeedReadiness } from "./cookie-save.ts"
import {
  foldLeadBlockedByDrain,
  foldMissFinalizeGuide,
  shouldSteerToFinalize,
  type EditorSaveSnap,
} from "./fold-steer.ts"
import type { NextCall } from "./next-call.ts"
import { overlaySaveEditorGuidance } from "./profile-persist.ts"

export type AwaitSteerPatch = {
  next?: string
  nextCall?: NextCall
}

export type AwaitSteerSeed = {
  status: string
  name: string
  next: string
  nextCall?: NextCall
  cookies?: number
  origins?: number
  cookieHosts?: string[]
  sessionStorage?: number
  sessionStorageStale?: boolean
  liveHost?: string
  appOriginCookieCount?: number
  localStorageCount?: number
  localStorageAuthKeyNames?: string[]
  seedReadiness?: SeedReadiness
}

export type AwaitSteerFoldLead = {
  status: "completed"
  text: string
  nextCall: NextCall
}

export type AwaitSteerFailClosed = {
  status: "stream-expired" | "editor-save-hung" | "profile-busy"
  text: string
  nextCall: NextCall
}

export type AwaitSteerResult = {
  guided: { text: string; nextCall?: NextCall }
  cookieLead?: AwaitSteerFoldLead
  foldLead?: AwaitSteerFoldLead
  failClosed?: AwaitSteerFailClosed
}

/**
 * Order is frozen:
 * 1. host patch
 * 2. 409 not-savable exhaustion (stream-expired; a failed save does not claim cookies)
 * 3. cookie or localStorage Save (check --verify-with-profile)
 * 4. finalize steer
 * 5. stream-expired, then editor-save-hung, then profile-busy
 * 6. IdP-only (keeps the seed nextCall; app-visible has none)
 * 7. save-editor overlay
 */
export function steerAwaitLogin(input: {
  patch?: AwaitSteerPatch
  steered: AwaitSteerSeed
  editorSave?: EditorSaveSnap
  editorFold?: EditorFoldResult
  streamExpired: boolean
  editorHung: boolean
  profileBusy: boolean
  /** 409 not-savable, and the one live token check did not end in a successful save. */
  notSavableExhausted?: boolean
  siteHost?: string
  guideUrl?: string
  guideExpect?: string
}): AwaitSteerResult {
  const steered = input.steered
  const patch = input.patch
  const drainedNonApp = foldLeadBlockedByDrain({
    status: steered.status,
    cookieHosts: steered.cookieHosts,
    siteHost: input.siteHost,
  })
  const readiness =
    steered.seedReadiness ??
    classifySeedReadiness({
      profile: steered.name,
      url: input.guideUrl,
      siteHost: input.siteHost,
      cookies: steered.cookies,
      origins: steered.origins,
      sessionStorage: steered.sessionStorage,
      sessionStorageStale: steered.sessionStorageStale,
      cookieHosts: steered.cookieHosts,
      liveHost: steered.liveHost,
      appOriginCookieCount: steered.appOriginCookieCount,
      localStorageCount: steered.localStorageCount,
      localStorageAuthKeyNames: steered.localStorageAuthKeyNames,
    })
  const saveFailed = Boolean(input.editorSave && !input.editorSave.ok)
  const exhaustedLead =
    input.notSavableExhausted === true && !patch
      ? { status: "stream-expired" as const, ...streamExpiredGuide(steered.name) }
      : undefined
  const cookieLead =
    !exhaustedLead &&
    !patch &&
    !drainedNonApp &&
    !saveFailed &&
    steered.status !== "idp-only-save" &&
    steered.status !== "host-changed" &&
    steered.status !== "empty-save" &&
    readiness.solariSaveReady
      ? {
          status: "completed" as const,
          ...cookieSaveGuide({
            profile: steered.name,
            readiness,
            url: input.guideUrl,
            expect: input.guideExpect,
          }),
        }
      : undefined
  const foldLead =
    !exhaustedLead &&
    !cookieLead &&
    !patch &&
    !drainedNonApp &&
    steered.status !== "idp-only-save" &&
    shouldSteerToFinalize({
      editorSave: input.editorSave,
      editorFold: input.editorFold,
      cookies: steered.cookies,
      origins: steered.origins,
      hostChanged: false,
      cookieHosts: steered.cookieHosts,
      siteHost: input.siteHost,
      sessionStorage: steered.sessionStorage,
      sessionStorageStale: steered.sessionStorageStale,
      liveHost: steered.liveHost,
      appOriginCookieCount: steered.appOriginCookieCount,
      localStorageAuthKeyNames: steered.localStorageAuthKeyNames,
      solariSaveReady: readiness.solariSaveReady,
    })
      ? {
          status: "completed" as const,
          ...foldMissFinalizeGuide({
            profile: steered.name,
            editorSave: input.editorSave,
            editorFold: input.editorFold,
            streamNoted: input.streamExpired,
            url: input.guideUrl,
            expect: input.guideExpect,
          }),
        }
      : undefined
  const failClosed =
    exhaustedLead ??
    (!patch &&
    !cookieLead &&
    !foldLead &&
    steered.status !== "completed" &&
    steered.status !== "host-changed" &&
    steered.status !== "idp-only-save"
      ? input.streamExpired
        ? { status: "stream-expired" as const, ...streamExpiredGuide(steered.name) }
        : input.editorHung
          ? { status: "editor-save-hung" as const, ...editorSaveHungGuide(steered.name) }
          : input.profileBusy
            ? { status: "profile-busy" as const, ...profileBusyAwaitGuide(steered.name) }
            : undefined
      : undefined)
  const guided = patch
    ? { text: patch.next ?? "", nextCall: patch.nextCall }
    : exhaustedLead
      ? { text: exhaustedLead.text, nextCall: exhaustedLead.nextCall }
      : cookieLead
      ? { text: cookieLead.text, nextCall: cookieLead.nextCall }
      : foldLead
        ? { text: foldLead.text, nextCall: foldLead.nextCall }
      : failClosed
        ? { text: failClosed.text, nextCall: failClosed.nextCall }
        : steered.status === "idp-only-save"
          ? { text: steered.next, nextCall: steered.nextCall }
          : input.editorSave || input.editorFold
            ? overlaySaveEditorGuidance({
                next: steered.next,
                nextCall: steered.nextCall,
                profile: steered.name,
                editorSave: input.editorSave,
                editorFold: input.editorFold,
              })
            : { text: steered.next, nextCall: steered.nextCall }
  return {
    guided,
    ...(cookieLead ? { cookieLead } : {}),
    ...(foldLead ? { foldLead } : {}),
    ...(failClosed ? { failClosed } : {}),
  }
}
