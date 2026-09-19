# Discord `#showcase` packet

Aron posts this from the personal Discord (nickname **Iron Adamant**). The agent does not post.

Do not paste live API keys, `.env`, unredacted dashboards, live session ids, or promo codes. The `slr_live_…` line is an ellipsis placeholder.

jsDelivr is the live watch URL. Do not hero a GitHub Pages URL until it 200s and the replay plays.

## Post

```
Auspex — agent web eyes that stay honest on auth-gated SaaS.

Watch (no clone, no key):
https://ironadamant.com/auspex/
Replay only: https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html

Two different sites. The video is ironadamant.com (public marketing, no login) so anyone can watch. The logged-in product is ConsistencyHub: blurred still + receipt (ok=true, claimOk=false anonymous skipped, claimOkProfile=true). We do not publish a live login recording.

Repo (cookbook fork, current HEAD): https://github.com/IronAdamant/auspex

Try it:
git clone https://github.com/IronAdamant/auspex.git && cd auspex && npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"

MCP: npx auspex-mcp
```
