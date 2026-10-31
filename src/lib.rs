//! Auspex: proof that an agent saw a web page.
//!
//! The browser, the plain fetch, and the saved-login browser each answer on
//! their own. `ok` is not `claimOk` and not `claimOkProfile`.

pub mod base64util;
pub mod browser;
pub mod cdp;
pub mod checkflow;
pub mod chrome;
pub mod cli;
pub mod door;
pub mod hornet;
pub mod httpfetch;
pub mod jsonutil;
pub mod logbook;
pub mod mcp;
pub mod profile;
pub mod receipt_build;
pub mod saved;
pub mod scrub;
pub mod sha1;
pub mod state;
pub mod textmatch;
pub mod verdict;
pub mod ws;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SCHEMA_VERSION: i64 = 1;
