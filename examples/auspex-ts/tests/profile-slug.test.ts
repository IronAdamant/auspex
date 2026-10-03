import assert from "node:assert/strict"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"
import {
  LOGIN_PROFILE_OR_URL_ERROR,
  PROFILE_SLUG_ERROR,
  PROFILE_SLUG_MAX,
  derivedProfileNext,
  profileSlugFromHost,
  profileSlugFromUrl,
  resolveLoginProfile,
} from "../src/profile-slug.ts"
import { auspexLoginInputSchema } from "../src/tool-schema.ts"

test("a profile name can never be a path (it names local editor-save and Save files)", async () => {
  const { requireProfileName, profileNameSchema, PROFILE_NAME_PATH_ERROR } = await import("../src/profile-slug.ts")
  const { editorSavePath } = await import("../src/profiles.ts")
  for (const bad of ["../../package", "a/b", "a\\b", "..\\..\\x", "a\nb", "a\u0000b"]) {
    assert.throws(() => requireProfileName(bad), { message: PROFILE_NAME_PATH_ERROR }, JSON.stringify(bad))
    assert.equal(profileNameSchema.safeParse(bad).success, false, JSON.stringify(bad))
  }
  assert.throws(() => editorSavePath("../../package"), { message: PROFILE_NAME_PATH_ERROR })
  for (const good of ["consistencyhub-io", "app-example-com", "my profile", "app.example.com", "..."]) {
    assert.equal(requireProfileName(good), good)
    assert.equal(profileNameSchema.safeParse(good).success, true, good)
  }
})
