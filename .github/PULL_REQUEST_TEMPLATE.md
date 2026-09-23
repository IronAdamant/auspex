## Summary

<!-- What changed and why. Stay Solari-native. No password typing. -->

## Labels (check if they apply)

- [ ] `fail-closed` — refuses a lie (reason/`status`, empty Save, password fill, host/expect edges)
- [ ] `solari-workaround` — honest handling of a Solari-native limit (noVNC, 401 editor, no CDP, 429, 402)

## Checklist

- [ ] Tests for touched code
- [ ] Dist is CI-built (`npm run build:mcp`); do not commit `examples/auspex-ts/dist/`
- [ ] No `.env` / `SOLARI_API_KEY` / `.auspex/` committed
- [ ] Did not npm publish (founder publishes `auspex-solari`)
