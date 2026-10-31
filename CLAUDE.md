# Auspex

Read [AGENT-CARD.md](AGENT-CARD.md), then [AGENTS.md](AGENTS.md), before driving a check or a login.

The program is Rust. `cargo test` and `cargo clippy --all-targets -- -D warnings` must pass. There are no third-party crates. Do not add one.

The agent does not type a password. `ok` is not `claimOk` and not `claimOkProfile`.
