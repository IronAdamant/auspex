// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/paths.json.
import { at, PKG, type GoldenCases } from "../harness.ts"
import { resolveStateDir, resolveStatePath, toStatePath } from "../../../src/paths.ts"

export const cases: GoldenCases = {
  "resolveStateDir({\"AUSPEX_HOME\":\"/srv/auspex\"}, \"/any\", \"/home/u\")": at(1790991898134, () => resolveStateDir(({"AUSPEX_HOME":"/srv/auspex"} as never), "/any", "/home/u")),
  "resolveStateDir({\"NODE_TEST_CONTEXT\":\"child-v8\"}, \"/any\", \"/home/u\")": at(1790991898134, () => resolveStateDir(({"NODE_TEST_CONTEXT":"child-v8"} as never), "/any", "/home/u")),
  "resolveStateDir({}, \"/home/u/.npm/_npx/abc/node_modules/auspex-solari/examples/auspex-ts\", \"/home/u\")": at(1790991898134, () => resolveStateDir(({} as never), "/home/u/.npm/_npx/abc/node_modules/auspex-solari/examples/auspex-ts", "/home/u")),
  "resolveStateDir({}, \"/code/auspex/examples/auspex-ts\", \"/home/u\")": at(1790991898134, () => resolveStateDir(({} as never), "/code/auspex/examples/auspex-ts", "/home/u")),
  "toStatePath(PKG + \"/.auspex/runs/s/screenshot.png\")": at(1790991898135, () => toStatePath(PKG + "/.auspex/runs/s/screenshot.png")),
  "toStatePath(\"/home-for-test/u/.auspex/runs/s/screenshot.png\", \"/home-for-test/u\")": at(1790991898135, () => toStatePath("/home-for-test/u/.auspex/runs/s/screenshot.png", "/home-for-test/u")),
  "resolveStatePath(\"~/.auspex/runs/s/screenshot.png\", \"/home-for-test/u\")": at(1790991898135, () => resolveStatePath("~/.auspex/runs/s/screenshot.png", "/home-for-test/u")),
  "toStatePath(\"/srv/auspex/runs/s/screenshot.png\", \"/home-for-test/u\")": at(1790991898135, () => toStatePath("/srv/auspex/runs/s/screenshot.png", "/home-for-test/u")),
  "resolveStatePath(\".auspex/runs/s/screenshot.png\")": at(1790991898135, () => resolveStatePath(".auspex/runs/s/screenshot.png")),
}
