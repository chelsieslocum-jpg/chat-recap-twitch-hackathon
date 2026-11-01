# Chat Recap

Chat Recap listens to your own Twitch channel, saves chat locally, and uses your signed-in Codex CLI to group it into source-linked topic cards. When a stream ends, it builds a recap automatically. A streamer or moderator can type `!recap` during a stream to post the current top topics to chat. An OBS browser-source overlay shows the latest topics.

## Requirements

- Node.js 22.13 or newer (Node 26 is tested).
- The [Codex CLI](https://learn.chatgpt.com/docs/non-interactive-mode), signed in with `codex login`.
- A regular Twitch account with two-factor authentication enabled, and a registered app in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). No Devpost submission is needed before app registration.

No npm packages or OpenAI API key are required. The app runs locally on `127.0.0.1` and uses the signed-in user's Codex CLI. Each operator needs their own Codex login, which may have usage limits.

## Run

```sh
npm start
```

Open **http://127.0.0.1:8820**. If the port is busy, set `PORT` in your shell before starting. The app stores settings, tokens and recaps in `.private/`, which is excluded from git. Never paste a Twitch token or client secret into the app or chat.

## Connect Twitch

1. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), register an application. Copy its **Client ID**. This app uses [device-code sign-in](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), so no client secret is needed.
2. In Chat Recap, enter the Client ID and your channel name, then choose **Save app details**.
3. Choose **Connect with Twitch**, open the Twitch approval link, and enter the displayed code. Sign in as the account that will read chat and post `!recap` responses. Your own broadcaster account works; a separate bot account is optional.
4. Go live on that channel. Capture starts automatically. Going offline builds the saved recap. Open **OBS overlay** and copy its local URL into an OBS Browser Source. Keep the local app running while streaming.

The login requests `user:read:chat` and `user:write:chat`. EventSub uses a WebSocket, so this local app needs no public callback server. Reconnects and duplicate events are handled. If the app is closed while streaming, messages during the gap cannot be recovered; the saved session is marked interrupted.

## Try before connecting

Choose **Use invented sample**, then **Create session from paste** and **Build recap**. You can paste your own `viewer: message` lines. Only invented `demo_*` chat is supplied by the app. Captured and pasted messages are sent to Codex for grouping under your signed-in account.

The source gate rejects any topic whose quoted text does not appear in one of its selected source messages. Viewer counts and source cards come from the original messages. This proves quote membership, not that the topic labels are semantically correct. Review cards before sharing.

## Tests

```sh
npm test
```

Tests cover paste parsing, source rejection, distinct-viewer counting, Twitch command permissions and deduplication, and the local HTTP routes. They do not call Twitch or Codex. During development, a live OBS broadcast on the owner's channel produced one real chat message; EventSub captured it and the app generated a source-linked card after the stream ended. That verifies the basic live path, not recap quality for a busy chat.

## Built with Codex

Codex helped develop the local prototype, Twitch EventSub connection, source checks, interface, and tests. At runtime, `src/recap.mjs` calls the signed-in Codex CLI with a JSON schema to group chat. The app then checks every returned quote against the selected source messages and computes viewer counts itself. Chat text is treated as data, never as instructions. The UI design decisions are recorded in `DESIGN_BOARD.md`.

## Limits

- Only the latest 3,000 live messages are retained per stream; the latest 300 are sent to Codex for each recap.
- If Codex fails, the saved session shows a failed state and can be retried from the app.
- Twitch messages missed while this local app is offline cannot be replayed.
- A `!recap` request is limited to the broadcaster or moderators, and at most once every five minutes.
- This app is intended for a local streamer's own channel. No public hosting is included.

Twitch integration follows the official [EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events), [subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types), and [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message) documentation. Codex integration follows the official [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) guidance.
