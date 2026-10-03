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

