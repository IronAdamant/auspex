// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/stream-deadline.json.
import { type GoldenCases } from "../harness.ts"
import { awaitStreamPlan, deadStreamCheckResult, shouldRefuseDeadStreamSession } from "../../../src/stream-deadline.ts"

export const cases: GoldenCases = {
  "awaitStreamPlan({\"saveEditor\":true,\"streamExpiresAt\":\"2026-09-24T03:23:22.000Z\",\"timeoutMs\":1800000,\"no...)": () => awaitStreamPlan(({"saveEditor":true,"streamExpiresAt":"2026-09-24T03:23:22.000Z","timeoutMs":1800000,"nowMs":1790220082000,"defaultTimeoutMs":1800000} as never)),
  "awaitStreamPlan({\"saveEditor\":true,\"streamExpiresAt\":\"2026-09-24T03:22:42.000Z\",\"timeoutMs\":1800000,\"no...)": () => awaitStreamPlan(({"saveEditor":true,"streamExpiresAt":"2026-09-24T03:22:42.000Z","timeoutMs":1800000,"nowMs":1790220082000,"defaultTimeoutMs":1800000} as never)),
  "awaitStreamPlan({\"saveEditor\":true,\"streamExpiresAt\":\"2026-09-24T03:21:21.000Z\",\"timeoutMs\":1800000,\"no...)": () => awaitStreamPlan(({"saveEditor":true,"streamExpiresAt":"2026-09-24T03:21:21.000Z","timeoutMs":1800000,"nowMs":1790220082000,"defaultTimeoutMs":1800000} as never)),
  "awaitStreamPlan({\"saveEditor\":false,\"streamExpiresAt\":\"2026-09-24T03:22:42.000Z\",\"timeoutMs\":1800000,\"n...)": () => awaitStreamPlan(({"saveEditor":false,"streamExpiresAt":"2026-09-24T03:22:42.000Z","timeoutMs":1800000,"nowMs":1790220082000,"defaultTimeoutMs":1800000} as never)),
  "shouldRefuseDeadStreamSession({\"streamExpiresAt\":\"2026-09-24T03:21:21.000Z\",\"nowMs\":1790220082000})": () => shouldRefuseDeadStreamSession(({"streamExpiresAt":"2026-09-24T03:21:21.000Z","nowMs":1790220082000} as never)),
  "shouldRefuseDeadStreamSession({\"streamExpiresAt\":\"2026-09-24T03:21:21.000Z\",\"nowMs\":1790220082000,\"seed\":{\"sizeBytes\"...)": () => shouldRefuseDeadStreamSession(({"streamExpiresAt":"2026-09-24T03:21:21.000Z","nowMs":1790220082000,"seed":{"sizeBytes":0}} as never)),
  "shouldRefuseDeadStreamSession({\"streamExpiresAt\":\"2026-09-24T03:21:21.000Z\",\"nowMs\":1790220082000,\"seed\":{\"sizeBytes\"...) #2": () => shouldRefuseDeadStreamSession(({"streamExpiresAt":"2026-09-24T03:21:21.000Z","nowMs":1790220082000,"seed":{"sizeBytes":128}} as never)),
  "shouldRefuseDeadStreamSession({\"streamExpiresAt\":\"2026-09-24T03:23:22.000Z\",\"nowMs\":1790220082000})": () => shouldRefuseDeadStreamSession(({"streamExpiresAt":"2026-09-24T03:23:22.000Z","nowMs":1790220082000} as never)),
  "deadStreamCheckResult({\"url\":\"https://app.example\",\"expect\":\"Workspace ready\",\"profile\":\"app-example\"})": () => deadStreamCheckResult(({"url":"https://app.example","expect":"Workspace ready","profile":"app-example"} as never)),
}
