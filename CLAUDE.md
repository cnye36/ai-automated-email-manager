# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run daily        # Run the daily send script manually (tsx, loads .env.local)
npm run db:push      # Push schema changes to SQLite via Drizzle
npm run db:studio    # Open Drizzle Studio (DB GUI)
```

There are no automated tests.

## Architecture

This is a **cold email outreach platform** — a Next.js 16 app (App Router) with a SQLite database (via Drizzle ORM + better-sqlite3) and a standalone daily job script.

### Data flow

1. **Import**: Upload an `.xlsx` file via the UI (`/api/import`). [src/lib/importer.ts](src/lib/importer.ts) parses rows using `exceljs` and bulk-inserts contacts (status=`pending`) into the DB, grouped under a campaign.
2. **Schedule**: `npm run daily` (or `POST /api/send` with `x-internal-secret` header) calls [src/lib/scheduler.ts](src/lib/scheduler.ts), which:
   - Syncs `config/inboxes.json` → `inboxes` table
   - Resets per-inbox `sent_today` counts if it's a new day
   - Round-robins `pending` contacts across active inboxes, marks them `active`
   - Sends emails for contacts whose `nextSendDate` is due, advancing through a 3-email sequence (steps 1→2→3, with `SEQUENCE_DELAY_DAYS=3` days between each)
   - Inserts a row into `sent_emails` for every attempt
3. **Tracking**: A 1×1 pixel at `/api/track/[id]` sets `openedAt` on the `sent_emails` row.
4. **Replies**: IMAP polling via [src/lib/imap.ts](src/lib/imap.ts) matches incoming `In-Reply-To`/`References` headers against stored `messageId` values; marks contacts `replied` and stops their sequence.

### Inbox warmup

[src/lib/warmup.ts](src/lib/warmup.ts) calculates a per-inbox daily send limit based on how many days since `warmupStartDate` (days 1-7: 5/day → days 8-14: 10/day → days 15-21: 20/day → days 22-28: 35/day → day 29+: 50/day).

### Key directories

- [src/lib/](src/lib/) — all business logic (no React): `config.ts`, `db/`, `importer.ts`, `imap.ts`, `mailer.ts`, `scheduler.ts`, `warmup.ts`
- [src/app/api/](src/app/api/) — Next.js Route Handlers: `campaigns`, `check-replies`, `contacts`, `import`, `inboxes`, `send`, `stats`, `track/[id]`
- [src/app/](src/app/) — UI pages: `/` (dashboard), `/campaigns`, `/contacts`, `/inboxes`
- [src/scripts/daily-run.ts](src/scripts/daily-run.ts) — standalone Node script run via `npm run daily`; check-replies then send-queue

### Configuration

**Inbox credentials** live in [config/inboxes.json](config/inboxes.json) (never in the DB). The schema is defined by `InboxConfig` in [src/lib/config.ts](src/lib/config.ts). `getInboxConfigs()` caches the file in memory; call `reloadInboxConfigs()` after edits.

**Environment variables** (set in `.env.local`):

| Variable | Purpose |
|---|---|
| `DB_PATH` | Path to SQLite file (default: `./data/campaigns.db`) |
| `REPLY_TO_EMAIL` | Reply-to address on all outgoing emails |
| `TRACKING_BASE_URL` | Base URL for open-tracking pixel (e.g. `https://track.ai-automatedhq.com`) |
| `INBOXES_CONFIG_PATH` | Override path for `inboxes.json` |
| `INTERNAL_API_SECRET` | Bearer secret for `POST /api/send` and `POST /api/check-replies` |

### Database

SQLite at `data/campaigns.db`. Tables auto-created on first run (raw `CREATE TABLE IF NOT EXISTS` in [src/lib/db/client.ts](src/lib/db/client.ts)). Schema types are in [src/lib/db/schema.ts](src/lib/db/schema.ts).

Contact `status` lifecycle: `pending` → `active` → `complete` | `replied` | `bounced` | `unsubscribed` | `error`

`sequenceStep` tracks which email has been sent (0=none, 1=email1 sent, 2=email2 sent, 3=complete).
