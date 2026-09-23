# Changelog

The npm package is `auspex-solari`. **Do not npm publish from an agent.** Founder publishes.

## 0.1.3 — unreleased (NEEDS-FOUNDER publish)

Tip after #61–#65 (public-landing expect, `hostChanged` remint, door IME/Save, Site-URL `stripSecret`). This release adds:

- Parseable await-login fail-closed: `stream-expired` (VNC/phone JWT), `editor-save-hung`, `profile-busy`, with remint `nextCall`.
- Door-card copy: Console Save is not fold; unique expect; `hostChanged` first-run; keep-marker collision hardened.
- Reviewer 5-minute path, blame matrix, door-card API examples, dogfood pack (`host-changed-receipt.json`).
- Official apply-path note: tagged LinkedIn/X is required; Discord is setup help only.

## 0.1.2 — 2026-09-21 (published)

npm `auspex-solari@0.1.2`. Later main commits #61–#65 are **not** in this tarball until 0.1.3 is published.

## Fail-closed / Solari-workaround labels (PR hygiene)

Use these labels on PRs when they apply (create the label in GitHub if missing):

| Label | Meaning |
| --- | --- |
| `fail-closed` | Receipt/`status` refuses a lie (`hostChanged`, `expectMatchedPublicLanding`, `stream-expired`, password fill, empty Save). |
| `solari-workaround` | Honest handling of a Solari-native limit (noVNC, editor 401, no CDP fold, 429 reap, 402 plan). |

See `.github/PULL_REQUEST_TEMPLATE.md`.
