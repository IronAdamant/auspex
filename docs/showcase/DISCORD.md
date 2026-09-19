# Discord `#showcase` packet

Aron posts this from the personal Discord (nickname **Iron Adamant**). The agent does not post.

Do not paste live API keys, `.env`, unredacted dashboards, live session ids, or promo codes. The `slr_live_…` line is an ellipsis placeholder.

Watch URL is GitHub Pages (`https://ironadamant.com/auspex/`). The player is ConsistencyHub + Microsoft with emails and passwords stripped. Do not hero jsDelivr `replay.html`: it is served as `text/plain`, so the browser prints the source.

## Post

```
Auspex — agent web eyes that stay honest on auth-gated SaaS.

Watch (no clone, no key):
https://ironadamant.com/auspex/
Player (not the jsDelivr source dump): https://ironadamant.com/auspex/demo/replay.html

The video is consistencyhub.io: Sign in with Microsoft, then the empty Microsoft box. Emails and passwords are stripped. Nobody typed them. The logged-in dashboard is a blurred still + receipt (ok=true, claimOk=false anonymous skipped, claimOkProfile=true). We do not publish a logged-in recording.

Repo (cookbook fork, current HEAD): https://github.com/IronAdamant/auspex

Try it:
git clone https://github.com/IronAdamant/auspex.git && cd auspex && npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"

MCP: npx auspex-mcp
```
