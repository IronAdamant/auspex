import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { parseArgv, USAGE } from "../src/cli.ts"
import {
  AUSPEX_CONTRACT,
  ONE_CHECK_PAGE_ACTIONS,
  PAGE_ACTION_CEILING,
} from "../src/contract.ts"
import { runPageActions } from "../src/page-actions.ts"
import { CHECK_DESCRIPTION } from "../src/tool-copy.ts"
import { auspexCheckInputObject, auspexCheckInputSchema } from "../src/tool-schema.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function optionalString(schema: z.ZodTypeAny, label: string): void {
  assert.ok(schema instanceof z.ZodOptional, `${label} is optional`)
  const inner = schema.unwrap()
  assert.ok(inner instanceof z.ZodString, `${label} is one string`)
  assert.equal(inner instanceof z.ZodArray, false, `${label} is not a list`)
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading)
  assert.ok(start >= 0, `missing ${heading}`)
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}

test("check contract is one fill string and one click string", () => {
  assert.equal(PAGE_ACTION_CEILING.fillsPerCheck, 1)
  assert.equal(PAGE_ACTION_CEILING.clicksPerCheck, 1)
  const check = AUSPEX_CONTRACT.find((row) => row.cmd === "check")
  assert.ok(check)
  const fills = check.fields.filter((field) => field.json === "fill")
  const clicks = check.fields.filter((field) => field.json === "click")
  assert.equal(fills.length, 1)
  assert.equal(clicks.length, 1)
  assert.equal(fills[0]?.kind, "string")
  assert.equal(clicks[0]?.kind, "string")
  assert.equal(fills[0]?.flag, "--fill")
  assert.equal(clicks[0]?.flag, "--click")
  for (const name of ["sessionId", "resume", "continueSession", "fills", "clicks"]) {
    assert.equal(
      check.fields.some((field) => field.json === name),
      false,
      `${name} would continue a page into the next check`,
    )
  }
})

test("MCP check schema refuses a list of fills or clicks", () => {
  optionalString(auspexCheckInputObject.shape.fill, "fill")
  optionalString(auspexCheckInputObject.shape.click, "click")
  assert.ok((auspexCheckInputObject.shape.fill.description ?? "").includes(ONE_CHECK_PAGE_ACTIONS))
  // Said once on fill and once in the tool description; every session pays for each repeat.
  assert.equal((auspexCheckInputObject.shape.click.description ?? "").includes(ONE_CHECK_PAGE_ACTIONS), false)
  assert.ok(CHECK_DESCRIPTION.includes(ONE_CHECK_PAGE_ACTIONS))
  assert.ok(USAGE.includes(ONE_CHECK_PAGE_ACTIONS))

  const base = { url: "https://example.com", expect: "Example Domain", allowPageActions: true }
  const one = auspexCheckInputSchema.safeParse({ ...base, fill: "#q", value: "hi", click: "button.go" })
  assert.equal(one.success, true)
  const manyFills = auspexCheckInputSchema.safeParse({ ...base, fill: ["#a", "#b"], value: "hi" })
  assert.equal(manyFills.success, false)
  const manyClicks = auspexCheckInputSchema.safeParse({ ...base, click: ["button.open", "button.save"] })
  assert.equal(manyClicks.success, false)
})

test("parseArgv refuses a second fill or a second click", () => {
  const one = parseArgv([
    "check",
    "https://example.com",
    "--expect",
    "Example Domain",
    "--fill",
    "#q",
    "--value",
    "hi",
    "--click",
    "button.go",
  ])
  assert.equal(one.status, "ok")
  if (one.status === "ok" && one.command.cmd === "check") {
    assert.equal(one.command.opts.fill, "#q")
    assert.equal(one.command.opts.click, "button.go")
    assert.equal(typeof one.command.opts.fill, "string")
    assert.equal(typeof one.command.opts.click, "string")
  }

  const secondFill = parseArgv([
    "check",
    "https://example.com",
    "--expect",
    "Example Domain",
    "--fill",
    "#a",
    "--value",
    "one",
    "--fill",
    "#b",
  ])
  assert.equal(secondFill.status, "error")
  if (secondFill.status === "error") {
    assert.match(secondFill.message, /unexpected arguments/)
    assert.match(secondFill.message, /--fill/)
  }

  const secondClick = parseArgv([
    "check",
    "https://example.com",
    "--expect",
    "Example Domain",
    "--click",
    "button.open",
    "--click",
    "button.save",
  ])
  assert.equal(secondClick.status, "error")
  if (secondClick.status === "error") {
    assert.match(secondClick.message, /unexpected arguments/)
    assert.match(secondClick.message, /--click/)
  }
})

test("runPageActions runs one fill and one click", async () => {
  let text = ""
  const fills: string[] = []
  const clicks: string[] = []
  const page = {
    waitForSelector: async () => undefined,
    locator: (sel: string) => ({
      fill: async (value: string) => {
        fills.push(`${sel}=${value}`)
        text = value
      },
      click: async () => {
        clicks.push(sel)
      },
    }),
    evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> =>
      ({ password: false, contentEditable: false, text, present: true }) as R,
  }
  const out = await runPageActions(page, { fill: "#q", value: "hi", click: "button.go" })
  assert.deepEqual(fills, ["#q=hi"])
  assert.deepEqual(clicks, ["button.go"])
  assert.equal(out.filled, "#q")
  assert.equal(out.clicked, "button.go")
})

