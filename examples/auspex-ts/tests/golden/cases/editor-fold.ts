// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/editor-fold.json.
import { type GoldenCases } from "../harness.ts"
import { pickEditorCdp } from "../../../src/editor-fold.ts"

export const cases: GoldenCases = {
  "pickEditorCdp({\"wsEndpoint\":\"wss://api.getsolari.com/ws/sess-1\",\"sessionId\":\"sess-1\"})": () => pickEditorCdp(({"wsEndpoint":"wss://api.getsolari.com/ws/sess-1","sessionId":"sess-1"} as never)),
  "pickEditorCdp({\"session\":{\"cdpEndpoint\":\"wss://api.getsolari.com/cdp/sess-2\"}})": () => pickEditorCdp(({"session":{"cdpEndpoint":"wss://api.getsolari.com/cdp/sess-2"}} as never)),
  "pickEditorCdp({\"token\":\"vnc.jwt.token\",\"ready\":true})": () => pickEditorCdp(({"token":"vnc.jwt.token","ready":true} as never)),
  "pickEditorCdp({\"wsEndpoint\":\"wss://api.getsolari.com/vnc-proxy/ws?token=x\"})": () => pickEditorCdp(({"wsEndpoint":"wss://api.getsolari.com/vnc-proxy/ws?token=x"} as never)),
  "pickEditorCdp({\"editorStatus\":\"idle\"})": () => pickEditorCdp(({"editorStatus":"idle"} as never)),
}
