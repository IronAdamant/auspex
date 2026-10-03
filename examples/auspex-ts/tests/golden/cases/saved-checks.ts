// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/saved-checks.json.
import { PKG, type GoldenCases } from "../harness.ts"
import { applySavedCheckName, canonicalSavedCheckName, loadSavedChecks, resolveSavedCheck } from "../../../src/saved-checks.ts"

export const cases: GoldenCases = {
  "loadSavedChecks(PKG + \"-golden-record/auspex.yml\")": () => loadSavedChecks(PKG + "-golden-record/auspex.yml"),
  "resolveSavedCheck(\"ironadamant\", {\"ironadamant\":{\"name\":\"ironadamant\",\"url\":\"https://ironadamant.com\",\"ex...)": () => resolveSavedCheck("ironadamant", ({"ironadamant":{"name":"ironadamant","url":"https://ironadamant.com","expect":"One office job."},"checkpoint":{"name":"checkpoint","url":"https://checkpointprojects.com","expect":"Checkpoint"},"consistencyhub":{"name":"consistencyhub","url":"https://consistencyhub.io","expect":"Document Editor","profile":"consistencyhub"}} as never)),
  "resolveSavedCheck(\"Checkpoint\", {\"ironadamant\":{\"name\":\"ironadamant\",\"url\":\"https://ironadamant.com\",\"exp...)": () => resolveSavedCheck("Checkpoint", ({"ironadamant":{"name":"ironadamant","url":"https://ironadamant.com","expect":"One office job."},"checkpoint":{"name":"checkpoint","url":"https://checkpointprojects.com","expect":"Checkpoint"},"consistencyhub":{"name":"consistencyhub","url":"https://consistencyhub.io","expect":"Document Editor","profile":"consistencyhub"}} as never)),
  "resolveSavedCheck(\"checkpoint\", {\"ironadamant\":{\"name\":\"ironadamant\",\"url\":\"https://ironadamant.com\",\"exp...)": () => resolveSavedCheck("checkpoint", ({"ironadamant":{"name":"ironadamant","url":"https://ironadamant.com","expect":"One office job."},"checkpoint":{"name":"checkpoint","url":"https://checkpointprojects.com","expect":"Checkpoint"},"consistencyhub":{"name":"consistencyhub","url":"https://consistencyhub.io","expect":"Document Editor","profile":"consistencyhub"}} as never)),
  "resolveSavedCheck(\"ConsistencyHub\", {\"ironadamant\":{\"name\":\"ironadamant\",\"url\":\"https://ironadamant.com\",...)": () => resolveSavedCheck("ConsistencyHub", ({"ironadamant":{"name":"ironadamant","url":"https://ironadamant.com","expect":"One office job."},"checkpoint":{"name":"checkpoint","url":"https://checkpointprojects.com","expect":"Checkpoint"},"consistencyhub":{"name":"consistencyhub","url":"https://consistencyhub.io","expect":"Document Editor","profile":"consistencyhub"}} as never)),
  "canonicalSavedCheckName(\"Checkpoint\")": () => canonicalSavedCheckName("Checkpoint"),
  "canonicalSavedCheckName(\"ConsistencyHub\")": () => canonicalSavedCheckName("ConsistencyHub"),
  "canonicalSavedCheckName(\"ironadamant\")": () => canonicalSavedCheckName("ironadamant"),
  "applySavedCheckName({\"name\":\"consistencyhub\"})": () => applySavedCheckName(({"name":"consistencyhub"} as never)),
  "applySavedCheckName({\"name\":\"ironadamant\",\"expect\":\"Other copy\"})": () => applySavedCheckName(({"name":"ironadamant","expect":"Other copy"} as never)),
}
