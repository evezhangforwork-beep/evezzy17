# Local reading journal

## Enable

```sh
npm run build
READING_HISTORY_DIR="$HOME/.local/share/tarot-history" npm run start:http -- --host 127.0.0.1
```

Open `http://127.0.0.1:3000/draw/`. Use the same absolute history directory on every
restart. Use one server process per directory; concurrent writers from multiple
processes are not supported. No additional dependency or model API is required.

## Workflow

1. Draw and reveal cards as before. Completed spread, custom, daily and moon
   readings are archived automatically when history is enabled; preparing a deck
   alone does not create an entry.
2. Choose **Copy reading** to copy a compact summary containing the question,
   spread and ordered positions, draw date, cards and orientations. It excludes
   private session/draw identifiers. Clipboard denial falls back to a selectable
   text box. The page does not link to or send data to an external AI provider.
3. Open **History & reflection** from setup or the fully revealed result. Search
   by question, spread or card name; open a record or select two for comparison.
   Opening history does not restart an in-progress table. Interpretations saved
   by earlier app versions remain readable, but new interpretations cannot be
   pasted or saved from the page.

Failed card archive writes can be retried while the same server remains alive,
without redrawing. Copy the result elsewhere before restarting a failing server.

## Storage and privacy

Each reading has one versioned JSON file. Writes use a private temporary file and
rename; newly created directories are owner-only (0700), files are owner-only
(0600). Invalid files produce an error instead of being silently replaced. The
archive is separate from expiring sessions: there is no 24-hour expiry or fixed
record cap, and rebuilding the app or clearing browser storage does not remove it.
Large archives are loaded in full, so this is intended for personal local use.

History contains personal questions and any legacy interpretations as
**unencrypted text**.
Do not put it in a public checkout or shared folder. Users of the same local
server can read this archive; it is not a multi-user account system. Bind to
loopback and optionally set `MCP_AUTH_TOKEN`. All history endpoints inherit the
server's bearer authentication and rate limits, additionally reject non-loopback
hosts/peers and cross-origin browser requests, and use `Cache-Control: no-store`.
No content is sent to an external AI provider by the page.

History applies only to readings completed while enabled. Earlier unsaved
readings are not automatically recoverable. A manually recovered record can
leave `reading.timestamp` empty when the original time is unknown; the UI labels
that explicitly rather than inventing a draw time. `savedAt` is the archive time.

## Backup

Use **Export backup** for a versioned JSON bundle containing all cards and any
legacy notes.
You can also back up the entire `READING_HISTORY_DIR` directory while the server
is stopped. Restore that directory before starting the server again. Keep
backups private. The UI does not currently provide bundle import or deletion.

## Local HTTP API

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/history` | Enabled status and newest-first summaries |
| GET | `/api/history/export` | Versioned bundle with full readings and notes |
| GET | `/api/history/:readingId` | One complete entry |
| POST | `/api/history/:readingId/retry` | Retry an unsaved result from this server's memory; body `{}` |
| POST | `/api/history/:readingId/interpretations` | Append `{ "source": "DeepSeek", "text": "..." }` |

The interpretation endpoint remains for backward compatibility with older local
clients, but the current page does not expose it. Source is required and limited
to 100 characters; text is required and limited to 100,000 characters. Invalid
inputs return 400, missing records 404, disabled record operations 503, and
storage failures 500. No history mutation is exposed as a model-callable MCP tool.
Copying is also available in the embedded App when the host permits clipboard
access; browsing history uses the local HTTP page.
