# Security

Auspex stores saved logins on disk. Treat `~/.auspex/profiles` like a password store. The files are mode 0600. Do not commit them, do not paste them into chat, and do not attach them to a pull request.

The agent does not type passwords, one-time codes, or captcha answers. The sign-in page sends keystrokes into local Chrome and does not write those keystrokes to the log.

Logs, traces, receipts, and door access lines are scrubbed. Email addresses, JSON web tokens, key-shaped strings, and secret URL parameters are removed or marked redacted. Cookie and token fields are dropped. A screenshot of a `needsHuman` page is not saved.

Do not point Auspex at a site you are not allowed to open. Hornet Swarm, when used, keeps its own permission checks. Auspex does not bypass them.

Report a problem to the repository owner. Do not open a public issue that includes a profile file, a cookie, or a receipt excerpt from a private page.
