// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/await-fail.json.
import { type GoldenCases } from "../harness.ts"
import { editorSaveHungGuide, isEditorSaveInfraStatus, isProfileBusyMessage, profileBusyAwaitGuide, profileSaveWaitTimeoutMs, streamExpiredGuide } from "../../../src/await-fail.ts"

export const cases: GoldenCases = {
  "streamExpiredGuide(\"app-example\")": () => streamExpiredGuide("app-example"),
  "isEditorSaveInfraStatus(502)": () => isEditorSaveInfraStatus(502),
  "profileSaveWaitTimeoutMs({\"timeoutMs\":1800000,\"streamExpired\":false,\"editorHung\":false,\"editorSaveInfra5xx\":true...)": () => profileSaveWaitTimeoutMs(({"timeoutMs":1800000,"streamExpired":false,"editorHung":false,"editorSaveInfra5xx":true,"preflight":"proceed","streamWaitTimeoutMs":1800000} as never)),
  "streamExpiredGuide(\"app-example\", {\"editorSaveStatus\":502})": () => streamExpiredGuide("app-example", ({"editorSaveStatus":502} as never)),
  "isEditorSaveInfraStatus(503)": () => isEditorSaveInfraStatus(503),
  "streamExpiredGuide(\"app-example\", {\"editorSaveStatus\":503})": () => streamExpiredGuide("app-example", ({"editorSaveStatus":503} as never)),
  "isEditorSaveInfraStatus(504)": () => isEditorSaveInfraStatus(504),
  "streamExpiredGuide(\"app-example\", {\"editorSaveStatus\":504})": () => streamExpiredGuide("app-example", ({"editorSaveStatus":504} as never)),
  "isEditorSaveInfraStatus(200)": () => isEditorSaveInfraStatus(200),
  "isEditorSaveInfraStatus(401)": () => isEditorSaveInfraStatus(401),
  "isEditorSaveInfraStatus(409)": () => isEditorSaveInfraStatus(409),
  "isEditorSaveInfraStatus(0)": () => isEditorSaveInfraStatus(0),
  "profileSaveWaitTimeoutMs({\"timeoutMs\":1800000,\"streamExpired\":false,\"editorHung\":false,\"editorSaveInfra5xx\":fals...)": () => profileSaveWaitTimeoutMs(({"timeoutMs":1800000,"streamExpired":false,"editorHung":false,"editorSaveInfra5xx":false,"preflight":"proceed","streamWaitTimeoutMs":1800000} as never)),
  "profileSaveWaitTimeoutMs({\"streamExpired\":false,\"editorHung\":false,\"editorSaveInfra5xx\":false,\"preflight\":\"low\",...)": () => profileSaveWaitTimeoutMs(({"streamExpired":false,"editorHung":false,"editorSaveInfra5xx":false,"preflight":"low","streamWaitTimeoutMs":90000} as never)),
  "profileSaveWaitTimeoutMs({\"timeoutMs\":1800000,\"streamExpired\":true,\"editorHung\":false,\"editorSaveInfra5xx\":false...)": () => profileSaveWaitTimeoutMs(({"timeoutMs":1800000,"streamExpired":true,"editorHung":false,"editorSaveInfra5xx":false,"preflight":"proceed","streamWaitTimeoutMs":1800000} as never)),
  "profileSaveWaitTimeoutMs({\"timeoutMs\":2000,\"streamExpired\":false,\"editorHung\":false,\"editorSaveInfra5xx\":true,\"p...)": () => profileSaveWaitTimeoutMs(({"timeoutMs":2000,"streamExpired":false,"editorHung":false,"editorSaveInfra5xx":true,"preflight":"proceed","streamWaitTimeoutMs":1800000} as never)),
  "profileSaveWaitTimeoutMs({\"timeoutMs\":1800000,\"streamExpired\":false,\"editorHung\":false,\"editorSaveInfra5xx\":fals...) #2": () => profileSaveWaitTimeoutMs(({"timeoutMs":1800000,"streamExpired":false,"editorHung":false,"editorSaveInfra5xx":false,"editorSaveCompletedFailure":true,"preflight":"proceed","streamWaitTimeoutMs":1800000} as never)),
  "streamExpiredGuide(\"app-example\", {\"editorSaveStatus\":401})": () => streamExpiredGuide("app-example", ({"editorSaveStatus":401} as never)),
  "editorSaveHungGuide(\"app-example\")": () => editorSaveHungGuide("app-example"),
  "profileBusyAwaitGuide(\"app-example\")": () => profileBusyAwaitGuide("app-example"),
  "isProfileBusyMessage(\"profile app-example is locked by another Auspex process (refusing to save over it). Do...)": () => isProfileBusyMessage("profile app-example is locked by another Auspex process (refusing to save over it). Do not retry in a loop."),
  "isProfileBusyMessage(\"connect-failed\")": () => isProfileBusyMessage("connect-failed"),
}
