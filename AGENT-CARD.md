# Auspex card

Proof that an agent saw a web page. Local Chrome. No cloud browser. No password in the agent's hands.

```bash
cargo build --release
./target/release/auspex check https://ironadamant.com --expect "Web app testing, in plain English."
./target/release/auspex check --name ironadamant
./target/release/auspex login --url https://app.example
./target/release/auspex prove --profile app-example --url https://app.example/board --expect "Card landed"
./target/release/auspex summary
./target/release/auspex mcp
```

Stdout is one JSON object. `ok`, `claimOk`, and `claimOkProfile` are three answers. Reuse a saved login only when `claimOkProfile` is true. `prove` exits 0 only when `proved` is true.

The person signs in at `handoff.url`. The agent does not type. Full rules: [AGENTS.md](AGENTS.md).
