// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/job-wake.json.
import { type GoldenCases } from "../harness.ts"
import { scrubJobValue } from "../../../src/job-wake.ts"

export const cases: GoldenCases = {
  "scrubJobValue({\"password\":\"hunter2\",\"token\":\"slr_live_abcdefghij\",\"sessionId\":\"sess-1\",\"excerpt\":\"sec...)": () => scrubJobValue(({"password":"hunter2","token":"slr_live_abcdefghij","sessionId":"sess-1","excerpt":"secret page","next":"email user@example.com","nextCall":{"tool":"auspex_job","jobId":"job-1","profile":"app-example"}} as never)),
}
