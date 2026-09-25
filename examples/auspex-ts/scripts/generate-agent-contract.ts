/** Stamp the door/await contract into AGENTS.md, the package AGENTS.md, and llms.txt. */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  AWAIT_LOGIN_BEGIN,
  AWAIT_LOGIN_END,
  DOOR_AWAIT_BEGIN,
  DOOR_AWAIT_END,
  agentsAwaitLoginBullet,
  agentsFoldBullet,
  llmsDoorAwaitBlock,
  replaceMarked,
} from "../src/door-await-contract.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, "..")
const repo = path.resolve(pkg, "../..")

function ensureMarked(text: string, begin: string, end: string, body: string, legacyStart: string): string {
  if (text.includes(begin)) return replaceMarked(text, begin, end, body)
  const at = text.indexOf(legacyStart)
  if (at < 0) throw new Error(`missing legacy start: ${legacyStart.slice(0, 48)}`)
  const lineEnd = text.indexOf("\n", at)
  if (lineEnd < 0) throw new Error(`legacy block has no newline: ${legacyStart.slice(0, 48)}`)
  return `${text.slice(0, at)}${begin}\n${body.trim()}\n${end}${text.slice(lineEnd)}`
}

function stampAgents(file: string): void {
  let text = readFileSync(file, "utf8")
  text = ensureMarked(text, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END, agentsFoldBullet(), "- `editorSave` 200")
  text = ensureMarked(
    text,
    AWAIT_LOGIN_BEGIN,
    AWAIT_LOGIN_END,
    agentsAwaitLoginBullet(),
    "- `auspex_await_login`",
  )
  writeFileSync(file, text)
}

function stampLlms(file: string): void {
  let text = readFileSync(file, "utf8")
  const legacy =
    "- Save returned 200 but could not refresh in-tab session storage, and the jar already includes the app host."
  if (!text.includes(DOOR_AWAIT_BEGIN)) {
    const at = text.indexOf(legacy)
    if (at < 0) throw new Error("llms.txt missing the door/await lines")
    const second = text.indexOf("\n- Cookies exist but", at)
    if (second < 0) throw new Error("llms.txt missing the weakSeed line after the door/await lines")
    text = `${text.slice(0, at)}${DOOR_AWAIT_BEGIN}\n${llmsDoorAwaitBlock()}\n${DOOR_AWAIT_END}${text.slice(second)}`
  } else {
    text = replaceMarked(text, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END, llmsDoorAwaitBlock())
  }
  writeFileSync(file, text)
}

export function generateAgentContract(): string[] {
  const agents = [path.join(repo, "AGENTS.md"), path.join(pkg, "AGENTS.md")]
  const llms = path.join(repo, "llms.txt")
  for (const file of agents) stampAgents(file)
  stampLlms(llms)
  return [...agents, llms]
}

const thisFile = fileURLToPath(import.meta.url)
if (path.resolve(process.argv[1] ?? "") === thisFile) {
  for (const file of generateAgentContract()) process.stdout.write(`stamped ${file}\n`)
}
