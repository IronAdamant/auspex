/**
 * `connect`: one command for a person at a terminal. Mint the phone door, show the link,
 * treat Enter as Save, then run the same job chain (await → finalize when needed →
 * check --verify-with-profile) and say the outcome in one plain sentence.
 *
 * A person at a terminal presses Enter. Without a terminal (an agent's shell), connect
 * waits for `connect --save <profile>` instead; the wait ends with Solari's typing window.
 */

import { homedir } from "node:os"
import { createInterface, type Interface } from "node:readline"
import QRCode from "qrcode"
import { takeFlag, takeOption, unexpectedArgs } from "./argv.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { jobFilePath, type JobReceipt } from "./job-store.ts"
import type { JobRunOptions } from "./job-cli.ts"
import type { HandoffPacket } from "./profiles.ts"
import { cliCommand } from "./paths.ts"
import { findWaitingDrain, signalSaveDrain, signalSaveDrainIn } from "./save-drain.ts"
import { requireProfileName } from "./profile-slug.ts"
import { isNonEmptyExpect } from "./text.ts"

export const CONNECT_NEEDS_EXPECT =
  "Without a terminal, connect needs --expect <words that only appear once logged in>."

/** Thrown from onMinted when the mint fell back to Solari's own handoff page (no phone door). */
export const NO_PHONE_DOOR =
  "Solari did not open a phone door: its remote browser was not ready (the editor token never arrived)."

export function isPhoneDoor(link: string | undefined): boolean {
  return Boolean(link && /\/auspex\/phone\.html/.test(link))
}

/** Show a path with the home folder as `~`, so pasted output does not name the user's account. */
export function tildePath(file: string, home: string = homedir()): string {
  if (!home || home === "/") return file
  const root = home.replace(/\/+$/, "")
  if (file === root) return "~"
  return file.startsWith(`${root}/`) ? `~${file.slice(root.length)}` : file
}

export type ConnectOptions = {
  url: string
  expect?: string
  profile?: string
  verbose?: boolean
}

export type ConnectCommand = { mode: "run"; opts: ConnectOptions } | { mode: "save"; profile: string }

export function parseConnectFlags(args: string[]): ({ ok: true } & ConnectCommand) | { ok: false; message: string } {
  const rest = [...args]
  const saveAt = rest.indexOf("--save")
  if (saveAt !== -1) {
    const name = rest[saveAt + 1]
    if (!name || name.startsWith("-") || rest.length !== 2) {
      return { ok: false, message: "usage: auspex connect --save <profile>" }
    }
    try {
      return { ok: true, mode: "save", profile: requireProfileName(name) }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }
  const expect = takeOption(rest, "--expect")
  const profile = takeOption(rest, "--profile")
  let url = takeOption(rest, "--url")
  const verbose = takeFlag(rest, "--verbose")
  if (!url && rest.length > 0 && !rest[0]!.startsWith("-")) url = rest.shift()
  const extra = unexpectedArgs(rest)
  if (extra) return { ok: false, message: extra }
  if (!url) return { ok: false, message: "connect requires the app URL: auspex connect https://app.example" }
  if (!isHttpOrHttpsUrl(url)) return { ok: false, message: "url must be an http or https URL" }
  if (!isCheckUrl(url)) return { ok: false, message: LOOPBACK_URL_ERROR }
  if (expect !== undefined && !isNonEmptyExpect(expect)) return { ok: false, message: "--expect must not be empty" }
  return { ok: true, mode: "run", opts: { url, expect, profile, verbose: verbose || undefined } }
}

/** Second call for agents (or another terminal): tell a waiting connect that the human is done. */
export async function runConnectSave(
  profile: string,
  deps: {
    isWaiting?: (profile: string) => Promise<boolean>
    signalSave?: (profile: string) => Promise<void>
  } = {},
): Promise<{ ok: boolean; message: string }> {
  // The waiting connect may be this install's or the other one's (npm vs clone).
  let waitingDir: string | undefined
  const isWaiting = deps.isWaiting ?? (async (name) => Boolean((waitingDir = await findWaitingDrain(name))))
  const signalSave = deps.signalSave ?? ((name) => signalSaveDrainIn(waitingDir!, name, "connect --save"))
  if (!(await isWaiting(profile))) {
    return {
      ok: false,
      message: `No connect is waiting for ${profile}. It may have finished or its window closed. Run connect again.`,
    }
  }
  await signalSave(profile)
  return { ok: true, message: `Save signaled for ${profile}. The running connect finishes on its own and prints the result.` }
}

/** Solari closed the browser mid-call or the SDK stripped the status (cookbook #56). Not a login result. */
const SOLARI_BROWSER_LOST = /exhausted retries|stripped the HTTP status|Target page, context or browser has been closed/i

export type ConnectOutcome = { ok: boolean; headline: string; detail: string[] }

/** Map a finished job to plain words. `ok` only when the second browser confirmed the saved login. */
export function connectOutcome(job: JobReceipt): ConnectOutcome {
  const host = hostOf(job.url)
  const words = job.expect ? `"${job.expect}"` : "your words"
  const again = "Run the same command again."
  if (job.phase === "completed" && job.ok && job.claimOkProfile === true) {
    return {
      ok: true,
      headline: `✓ Logged in to ${host}. A second browser, using only the saved login, saw ${words}.`,
      detail: [
        `Saved as profile ${job.profile}.`,
        `Next time: ${cliCommand()} check --profile ${job.profile} --url ${job.url} --expect ${quoteArg(job.expect ?? "")} --verify-with-profile`,
      ],
    }
  }
  if (job.phase === "completed" && job.ok) {
    return {
      ok: false,
      headline: `The live browser saw ${words}, but a second browser using only the saved login did not confirm it.`,
      detail: [`Do not reuse profile ${job.profile} yet. ${again}`],
    }
  }
  if (job.phase === "failed" && job.reason.includes(NO_PHONE_DOOR)) {
    return {
      ok: false,
      headline: NO_PHONE_DOOR,
      detail: [
        "That is on Solari's side. Nothing was saved or claimed.",
        "Wait a few minutes (Solari can take up to about 10 minutes to release a stuck browser), then run the same command again.",
      ],
    }
  }
  if (job.botWall && !(job.phase === "completed" && job.ok)) {
    return {
      ok: false,
      headline: `${host} showed a bot check ("Just a moment…") to the fresh cloud browser, so Auspex could not confirm the login.`,
      detail: [
        "That is the site blocking cloud browsers, not a failed sign-in. Auspex does not solve bot checks.",
        "Running it again will likely hit the same check.",
      ],
    }
  }
  if (
    job.editorSave &&
    !job.editorSave.ok &&
    (job.status === "timeout" || job.status === "waiting" || job.status === "stream-expired")
  ) {
    const code = `HTTP ${job.editorSave.status}${job.editorSave.error ? `: ${job.editorSave.error}` : ""}`
    const headline =
      job.editorSave.status >= 500
        ? `Solari could not save the login (${code}). That is on Solari's side, not your sign-in.`
        : job.editorSave.status === 409
          ? `Solari said the remote browser could not be saved right then (${code}).`
          : `Solari refused to save the login (${code}).`
    return { ok: false, headline, detail: [`Nothing was saved or claimed. ${again}`] }
  }
  switch (job.status) {
    case "stream-expired":
      return {
        ok: false,
        headline: "The five-minute sign-in window closed before Save.",
        detail: ["Solari sets that window and Auspex cannot extend it.", `${again} Save as soon as the app is on screen.`],
      }
    case "timeout":
    case "waiting":
      return { ok: false, headline: "No Save arrived in time.", detail: [again] }
    case "empty-save":
      return {
        ok: false,
        headline: "Nothing was saved. The remote browser had no login for this site yet.",
        detail: [`${again} Save only once the logged-in app is on screen.`],
      }
    case "idp-only-save":
      if (job.idpOnlyKind === "app-visible") {
        return {
          ok: false,
          headline: "The app is on screen, but only your Microsoft or Google sign-in was saved, not the app's own login.",
          detail: [
            "Signing in again will not change that for this app, so Auspex stops here instead of guessing.",
            "Why: https://github.com/IronAdamant/auspex/blob/main/RECEIPTS.md#two-truths",
          ],
        }
      }
      return {
        ok: false,
        headline: "Save happened while the Microsoft or Google sign-in page was still showing.",
        detail: [`${again} Finish signing in until the app itself is on screen, then save.`],
      }
    case "host-changed":
      return {
        ok: false,
        headline: `The remote browser ended up on a different site${job.suggestedUrl ? ` (${job.suggestedUrl})` : ""}.`,
        detail: [
          job.suggestedUrl
            ? `If that is the app you meant, run: ${cliCommand()} connect ${job.suggestedUrl}`
            : "Run connect again with the app's own address.",
        ],
      }
    case "expectMatchedPublicLanding":
      return {
        ok: false,
        headline: `${words} also appears on a public or login page, so it cannot prove you are logged in.`,
        detail: ["Run again with words that only appear inside the app (for example a menu item or your workspace name)."],
      }
    case "needsHuman":
      return {
        ok: false,
        headline: "The saved login hit a password or code screen. Auspex never types those.",
        detail: [`${again} Complete every sign-in step (tick "Stay signed in" if offered) before saving.`],
      }
    case "weak-seed":
      return {
        ok: false,
        headline: `The live browser saw ${words}, but the save is missing part of the app's login, so a second browser could not be asked to confirm it.`,
        detail: [`Nothing was claimed. ${again} Save once the app is fully loaded.`],
      }
    case "loggedOut":
      return {
        ok: false,
        headline: "A fresh browser with the saved login landed on a logged-out page.",
        detail: [`${again} Make sure the app is fully loaded before saving.`],
      }
    case "mismatch":
      return {
        ok: false,
        headline: `The saved login opened the app, but ${words} was not on the page.`,
        detail: ["Check the words (they are case-sensitive) and the URL, then run again."],
      }
    case "concurrency-limited":
      return {
        ok: false,
        headline: "Solari says too many browsers are open on this key (HTTP 429).",
        detail: ["Auspex closed the ones it opened. Wait a minute, then run again."],
      }
    case "editor-busy":
    case "profile-busy":
    case "editor-save-hung":
    case "sibling-saved":
      return {
        ok: false,
        headline: "Another Auspex command is already saving this login.",
        detail: ["Let it finish, then run again."],
      }
    case "network":
      return { ok: false, headline: "Solari or the site did not answer in time.", detail: [again] }
    default: {
      if (SOLARI_BROWSER_LOST.test(job.reason)) {
        const saved = job.seedReadiness?.solariSaveReady === true
        return {
          ok: false,
          headline: "Solari's browser closed during the check, and the SDK lost the error status (cookbook #56).",
          detail: saved
            ? [
                "Your login did save. Retry just the check once:",
                `${cliCommand()} check --profile ${job.profile} --url ${job.url} --expect ${quoteArg(job.expect ?? "")} --verify-with-profile`,
              ]
            : [`Nothing was claimed. Wait a moment, then ${again.toLowerCase()}`],
        }
      }
      const reason = (job.reason || job.status).slice(0, 200)
      return { ok: false, headline: `Stopped: ${reason}.`, detail: [again] }
    }
  }
}

function hostOf(url?: string): string {
  try {
    return url ? new URL(url).host : "the app"
  } catch {
    return url ?? "the app"
  }
}

function quoteArg(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`
}

const HUMAN_PHASES: Record<string, string> = {
  "job:mint": "Opening a cloud browser…",
  "job:await": "",
  "job:finalize": "Saving the app's own login…",
  "job:finalize-fallback": "The saved login was not enough on its own (common with Microsoft sign-in). Capturing the app's session once more…",
  "job:check": "Checking with a fresh browser that uses only the saved login…",
  "job:reap": "Closing leftover browsers…",
}

export type ConnectIo = {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean }
  stdout: NodeJS.WritableStream & { isTTY?: boolean; columns?: number }
  now?: () => number
}

export type ConnectDeps = {
  runJob: (opts: JobRunOptions) => Promise<JobReceipt>
  signalSave?: (profile: string) => Promise<void>
  qr?: (url: string) => Promise<string>
}

export async function runConnect(
  opts: ConnectOptions,
  io: ConnectIo,
  deps: ConnectDeps,
): Promise<{ ok: boolean; job?: JobReceipt; outcome?: ConnectOutcome; error?: string }> {
  const interactive = io.stdin.isTTY === true && io.stdout.isTTY === true
  if (!interactive && !opts.expect?.trim()) return { ok: false, error: CONNECT_NEEDS_EXPECT }
  const out = (line = "") => io.stdout.write(`${line}\n`)
  const now = io.now ?? Date.now
  const signalSave = deps.signalSave ?? ((profile) => signalSaveDrain(profile, undefined, "terminal"))
  const qr = deps.qr ?? ((url) => QRCode.toString(url, { type: "terminal", small: true }))
  const rl: Interface | undefined = interactive ? createInterface({ input: io.stdin, terminal: false }) : undefined
  const lines: string[] = []
  const waiters: Array<(line: string | null) => void> = []
  let inputClosed = false
  rl?.on("line", (line) => {
    const next = waiters.shift()
    if (next) next(line)
    else lines.push(line)
  })
  // Ctrl-D or a closed pipe: answer every pending and future read with null instead of hanging.
  rl?.on("close", () => {
    inputClosed = true
    for (const w of waiters.splice(0)) w(null)
  })
  const nextLine = () =>
    new Promise<string | null>((resolve) => {
      const queued = lines.shift()
      if (queued !== undefined) resolve(queued)
      else if (inputClosed) resolve(null)
      else waiters.push(resolve)
    })
  const timers: NodeJS.Timeout[] = []
  let saving = false

  try {
    let expect = opts.expect?.trim()
    while (!expect) {
      out("What words only appear once you're logged in? (for example a menu item or your workspace name)")
      io.stdout.write("› ")
      const answer = await nextLine()
      if (answer === null) return { ok: false, error: CONNECT_NEEDS_EXPECT }
      expect = answer.trim()
    }

    const onMinted = ({ profile, handoff }: { profile: string; handoff: HandoffPacket }) => {
      // Solari's fallback handoff page is a picture of Chrome with no phone keyboard. Stop now
      // instead of handing it out and waiting up to 30 minutes on it.
      if (!isPhoneDoor(handoff.mobileUrl || handoff.url)) throw new Error(NO_PHONE_DOOR)
      // Not awaited: the job waits for Save meanwhile. A failure here must not become an
      // unhandled rejection, which would end the process before any outcome is printed.
      void showDoor(profile, handoff).catch((err) => {
        out(`Could not signal Save from this terminal (${err instanceof Error ? err.message : String(err)}).`)
        out("Tap Save on the phone page instead; this command is still waiting for it.")
      })
    }
    const showDoor = async (profile: string, handoff: HandoffPacket) => {
      const link = handoff.mobileUrl || handoff.url
      out()
      out("Sign in on your phone or computer:")
      const art = await qr(link).catch(() => "")
      const width = art ? Math.max(...art.split("\n").map((l) => l.length)) : 0
      if (art && (io.stdout.columns ?? 0) >= width) out(art)
      else if (handoff.qrPath) out(`QR code image (scan it, or open it for the human): ${tildePath(handoff.qrPath)}`)
      out(link)
      out()
      const expiresMs = handoff.streamExpiresAt ? Date.parse(handoff.streamExpiresAt) : Number.NaN
      if (Number.isFinite(expiresMs)) {
        const left = Math.max(0, Math.round((expiresMs - now()) / 1000))
        const at = new Date(expiresMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        out(`You have about ${Math.floor(left / 60)} min ${left % 60} s (until ${at}).`)
        const warnIn = expiresMs - now() - 60_000
        if (warnIn > 0) {
          timers.push(
            setTimeout(() => {
              if (saving) return
              out(
                interactive
                  ? "One minute left. Press Enter as soon as the app is on screen."
                  : "One minute left. If you have not tapped Save on the phone page yet, do it now.",
              )
            }, warnIn),
          )
        }
      }
      if (!interactive) {
        out("When the app itself is on screen, tap Save on the phone page, then paste the line to your agent or just say \"saved\".")
        out(`Agent: ${cliCommand()} connect --save ${profile}`)
        return
      }
      out("When the app itself is on screen, press Enter here. (You don't need the Save button on the phone page.)")
      // Only an Enter pressed after the link is shown means Save. A spare Enter typed earlier
      // (at the words prompt) would otherwise save before the human has signed in.
      lines.length = 0
      if ((await nextLine()) === null) {
        out("Input closed. Tap Save on the phone page instead; this command is still waiting for it.")
        return
      }
      saving = true
      out("Saving…")
      await signalSave(profile)
    }

    const job = await deps.runJob({
      url: opts.url,
      expect,
      profile: opts.profile,
      wait: true,
      verifyWithProfile: true,
      onMinted,
      onProgress: (phase) => {
        const key = phase.split(" ")[0] ?? phase
        if (key === "job:finalize" || key === "job:check") saving = true
        const human = HUMAN_PHASES[key]
        if (human) out(human)
        else if (opts.verbose && human === undefined) out(`  ${phase}`)
      },
    })
    const outcome = connectOutcome(job)
    out()
    out(outcome.headline)
    for (const line of outcome.detail) out(`  ${line}`)
    try {
      out(`  Receipt: ${tildePath(jobFilePath(job.jobId))}`)
    } catch {
      // job id invalid only on early input failure; nothing to point at
    }
    return { ok: outcome.ok, job, outcome }
  } finally {
    for (const t of timers) clearTimeout(t)
    rl?.close()
  }
}
