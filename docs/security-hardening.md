# Local security hardening

These changes work with the existing Happy mobile app and hosted server. They
do not change the encrypted RPC wire format or require a mobile release.

## Changes

- Every daemon control HTTP endpoint requires a random per-start bearer token.
  It stays in the local daemon state file and is redacted from diagnostics.
  Browser `Origin` headers and unexpected `Host` headers are rejected before
  request bodies are processed. Local clients refuse redirects and never fall
  back to unauthenticated HTTP when upgrading an older daemon.
- RPC handlers are not invoked if encrypted parameters fail authentication.
  This also covers parameterless actions such as stopping the daemon.
- Remote session environment overrides use an allowlist for provider settings
  and `TMUX_SESSION_NAME`. Runtime injection variables such as `NODE_OPTIONS`,
  `PATH`, `HOME`, `CODEX_HOME`, and Happy's own configuration are rejected.
  Trusted environment inherited from your terminal is preserved. Custom
  profiles that pass other variables must configure them locally instead.
- Happy's data and log directories use mode `0700`; credentials, settings,
  session encryption state, daemon state, and new log files use `0600` on Unix.
  Existing private files have their permissions repaired when opened. Private
  file access rejects symlinks and hardlinks. `HAPPY_HOME_DIR` must be a dedicated
  directory, not the filesystem root or your home directory. Windows users
  continue to rely on the directory's Windows ACLs.
- Detailed debug logging requires `DEBUG` to be enabled. Structured credentials,
  authorization headers, environment overrides, and common secret assignments
  are redacted before formatting, truncation, or remote delivery. Remote logging
  requires an explicit `1` or `true` flag. Debug output can still contain private
  conversation content; redaction cannot identify every arbitrary secret.
- Session file paths are checked against canonical symlink destinations,
  including the existing parents of a new destination. Dangling links fail
  closed. Logout removes credentials and machine identity without recursively
  deleting a user-selected data directory.
- Vulnerable dependencies with compatible fixes are updated in the manifests
  and lockfile. Transitive version constraints live in the workspace's pnpm
  overrides. They are used when installing this checkout with pnpm. The unused
  `ai` CLI dependency is removed.

## Install the patched CLI

From the repository root:

```sh
pnpm install
pnpm --filter happy cli:install
happy daemon status
```

The install command builds the CLI, links the global `happy` command to this
checkout, and restarts the daemon. Keep the checkout in place. Existing older
CLI processes should be restarted so their local control client has the token
support. The security changes take effect in the installed daemon after restart.

## Remaining boundaries

Paired clients intentionally have powerful machine RPCs, including shell
execution. This patch does not turn that remote administration feature into a
workspace sandbox. Canonical path checks also are not protection against every
concurrent filesystem race from another process running as the same user.

The existing encrypted format does not authenticate the RPC method name or
provide durable replay protection. Full protection needs a coordinated protocol
change in the mobile/web client and CLI. The hosted service's handling of
optional connected provider credentials and third-party voice processing is
also unchanged.

Old logs are not deleted or scrubbed by this patch. A clean dependency scan is
not a guarantee that the application or bundled agents are free of
vulnerabilities; dependencies without compatible fixes require separate review.

The CLI dependency tree still includes `deepmerge-ts@7.1.5` through Happy
Terminal's Drizzle/Prisma peers. Its recursive-merge denial-of-service advisory
([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)) requires
version 8, a major upgrade. This patch does not force that upgrade into Prisma.
This scan result alone does not establish a remotely reachable exploit in Happy.

## Validation

The CLI's full unit suite, including regression tests for authentication,
encrypted request failure, environment injection, symlinks, credential modes,
logout, and logging, passes. The CLI type check and production build pass.
Tests use isolated Happy data; no real account integration tests, global
installation, or live daemon restart are part of this validation. Windows ACLs
have not been tested.
