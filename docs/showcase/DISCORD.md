# Discord `#showcase` packet

Aron posts this from the personal Discord (nickname **Iron Adamant**). The agent does not post.

Do not paste live API keys, `.env`, unredacted dashboards, live session ids, or promo codes. The `slr_live_…` line is an ellipsis placeholder.

Watch URL is GitHub Pages (`https://ironadamant.com/auspex/`). The player is ConsistencyHub + Microsoft with emails and passwords stripped. Do not hero jsDelivr `replay.html`: it is served as `text/plain`, so the browser prints the source.

Phone still: not in the paste yet. After the live phone test, attach that screenshot with the image button on the right of the composer, beside the watch-page shot. Do not claim the still before it exists.

## Post

```
Auspex. Agent web eyes that stay honest on auth-gated SaaS.

Watch (no clone, no key):
https://ironadamant.com/auspex/
Player (not the jsDelivr source dump): https://ironadamant.com/auspex/demo/replay.html

On the watch page the blurred dashboard is above the player. The player is the Microsoft sign-in wall, with emails and passwords stripped.

The video is consistencyhub.io: Sign in with Microsoft, then the empty Microsoft box. Emails and passwords are stripped. Nobody typed them. The logged-in dashboard is a blurred still + receipt (ok=true, claimOk=false anonymous skipped, claimOkProfile=true). We do not publish a logged-in recording.

Phone sign-in uses the phone's own browser. npx auspex-solari login prints the link. The page has a real text field, so the software keyboard opens, and the keys go into cloud Chrome. Tap Save, paste the copied line into chat, then await-login --save-editor. Solari's picture of Chrome will not open a phone keyboard.

Repo (cookbook fork, current HEAD): https://github.com/IronAdamant/auspex

Try it:
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com
npx auspex-solari check --name ironadamant
npx auspex-solari check https://example.com --expect "Example Domain"

MCP: npx -p auspex-solari auspex-mcp
```
