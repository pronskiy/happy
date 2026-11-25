# Local security hardening

Upstream Happy CLI 1.2.7 added control-server authentication, rejection of
failed RPC decryption, private file modes, and a logout that no longer deletes
the data directory. This fork adds the hardening upstream does not have yet.
None of it changes the RPC wire format or needs a mobile release.

## Changes

- Remote session environment overrides use an allowlist for provider settings
  and `TMUX_SESSION_NAME`. Runtime injection variables such as `NODE_OPTIONS`,
  `PATH`, `HOME`, `CODEX_HOME`, and Happy's own configuration are rejected.
  Trusted environment inherited from your terminal is preserved. Custom
  profiles that pass other variables must configure them locally instead.
- Session file paths are checked against canonical symlink destinations,
  including the existing parents of a new destination. Dangling links fail
  closed.
- Detailed debug logging requires `DEBUG` to be enabled. Structured credentials,
  authorization headers, environment overrides, and common secret assignments
  are redacted before formatting, truncation, or remote delivery. Remote logging
  requires an explicit `1` or `true` flag. New log files use mode `0600`. Debug
  output can still contain private conversation content; redaction cannot
  identify every arbitrary secret.
- The Codex `auth.json` written for a spawned session uses mode `0600`.
- Vulnerable dependencies with compatible fixes are updated in the manifests
  and lockfile. Transitive version constraints live in the workspace's pnpm
  overrides. The unused `ai` CLI dependency is removed.

## Remaining boundaries

Paired clients intentionally have powerful machine RPCs, including shell
execution. The environment allowlist does not turn that remote administration
feature into a sandbox. Canonical path checks are not protection against every
concurrent filesystem race from another process running as the same user.

The encrypted RPC format does not authenticate the method name or provide
replay protection. Fixing that needs a coordinated change in the apps and CLI.

`deepmerge-ts@7.1.5` remains in the tree through Prisma. Its advisory
([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx))
needs a major upgrade that this fork does not force.
