# Voice — Bring Your Own ElevenLabs Agent

How to run the voice assistant against your own ElevenLabs agent instead of
Happy Cloud's. No code changes, no server env, no subscription — your
ElevenLabs account pays for the minutes.

For the architecture behind this, see `voice-architecture.md`. For the paid
(Happy Cloud) path and its limits, see `paid-voice.md`.

## Why this path exists

By default the app asks Happy Cloud (`api.cluster-fluster.com`) for a
conversation token, which it mints with the server-side `ELEVENLABS_API_KEY`
and gates at 20 min free / 5 h subscribed. The production agent is set to
"authorized only", so a fork cannot reach it without that server.

BYO mode (`packages/happy-app/sources/realtime/RealtimeSession.ts:51-64`)
skips the server entirely: when both `voiceCustomAgentId` and
`voiceBypassToken` settings are set, the client connects straight to
ElevenLabs with just an `agentId`.

The tradeoff: the bypass branch does **not** send `systemPrompt` or
`firstMessage`. Your agent must carry its prompt in the ElevenLabs dashboard.

## 1. Create the agent

elevenlabs.io → Agents → Create agent, blank template. Pick a voice, LLM and
default language on the agent itself.

## 2. System prompt

Paste `VOICE_SYSTEM_PROMPT_BASE` from
`packages/happy-app/sources/realtime/voiceSystemPrompt.ts` into the agent's
prompt, then append:

```
# Conversation history so far
{{initialConversationContext}}
```

`initialConversationContext` and `sessionId` arrive as dynamic variables
(`sources/realtime/RealtimeVoiceSession.tsx`, `dynamicVariables`). Declare both
on the agent with empty defaults.

The base prompt also tells the agent to call `skip_turn`, an ElevenLabs
built-in — enable it in the agent's system tools.

## 3. Client tools

Declare both as **Client tools** (not webhooks), with `Wait for response` on.
Names and parameter names must match `sources/realtime/realtimeClientTools.ts`
exactly, or the agent's calls are dropped.

| Tool | Parameters |
|---|---|
| `sendMessageToSession` | `sessionId` (string, required), `message` (string, required) |
| `processPermissionRequest` | `requestId` (string, required), `decision` (string, required, one of `allow` / `deny`) |

`processPermissionRequest` does not take a session id — the client finds which
session owns the request by scanning `agentState.requests`.

## 4. Security tab

- **Authentication: off.** Bypass mode sends only the agent id — no signed URL,
  no server-minted token. With authentication on, the connection fails.
- **Overrides → `language`: on**, if you plan to set Settings → Voice →
  Preferred Language. The client always passes `overrides.agent.language`, and
  ElevenLabs errors on an override for a field that isn't allowed. On
  `Auto-detect` (the default) the field is `undefined` and nothing is sent.
- No other overrides are needed; prompt and first message are not sent in
  bypass mode.

## 5. Turn it on in the app

Settings → Voice → **Bring Your Own Agent** → **ElevenLabs Agent ID**, paste
the id. **Direct Connection** flips on by itself — `settings/voice.tsx` calls
`setVoiceBypassToken(trimmed !== null)` when the id is saved. Both are synced
settings, so other devices pick them up.

Settings → Server → "Use Custom Server for Voice" is irrelevant here; bypass
returns before that toggle is read.

## Verifying

Tap the mic in a session composer and grant microphone access (the first
session fails silently without it). Then:

- Logs show `[Voice] Bypassing token, custom agent ID: <id>`. If you see
  `[Voice] fetchVoiceCredentials response:` instead, `voiceBypassToken` is off.
- The status bar reads `connected`.
- "Happy, send to the session: hello" → a message with `source: 'voice'` lands
  in the chat. That exercises `sendMessageToSession`.
- Approve a pending permission request by voice to exercise
  `processPermissionRequest`.
- ElevenLabs → Conversations shows the call with its duration.

## Failure modes

| Symptom | Cause |
|---|---|
| `voiceServiceUnavailable` immediately | agent authentication is on |
| Connects but the agent says nothing | no prompt in the dashboard — bypass does not supply one |
| Agent talks but never sends | client tool names or parameter names differ from the code |
| Override error | a language is selected but the `language` override isn't allowed |

## Related

- `voice-architecture.md` — integration, session routing, context batching, VAD
- `paid-voice.md` — the Happy Cloud path, limits and paywall flows
