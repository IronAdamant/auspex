// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/solari.json.
import { at, type GoldenCases } from "../harness.ts"
import { findProfileId, toPlaywrightStorageState } from "../../../src/solari.ts"

export const cases: GoldenCases = {
  "findProfileId(([{\"id\":\"p1\",\"name\":\"consistencyhub\"}]), \"consistencyhub\")": at(1790991897090, () => findProfileId(([{"id":"p1","name":"consistencyhub"}] as never), "consistencyhub")),
  "findProfileId(([{\"id\":\"p1\",\"name\":\"consistencyhub\"}]), \" consistencyhub \")": at(1790991897090, () => findProfileId(([{"id":"p1","name":"consistencyhub"}] as never), "  consistencyhub  ")),
  "toPlaywrightStorageState({\"cookies\":[{\"name\":\"sid\",\"value\":\"1\",\"domain\":\"consistencyhub.io\"}],\"origins\":[{\"origi...)": at(1790991897090, () => toPlaywrightStorageState(({"cookies":[{"name":"sid","value":"1","domain":"consistencyhub.io"}],"origins":[{"origin":"https://consistencyhub.io"}]} as never))),
  "toPlaywrightStorageState({\"cookies\":[{\"name\":\"x\",\"value\":\"y\"}]})": at(1790991897091, () => toPlaywrightStorageState(({"cookies":[{"name":"x","value":"y"}]} as never))),
  "toPlaywrightStorageState({\"cookies\":[{\"name\":\"sid\",\"value\":\"1\",\"domain\":\"example.com\"}]})": at(1790991898411, () => toPlaywrightStorageState(({"cookies":[{"name":"sid","value":"1","domain":"example.com"}]} as never))),
}
