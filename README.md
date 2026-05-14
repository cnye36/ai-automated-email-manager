# AI Automated Email Manager

A **cold email outreach** app: import leads from a spreadsheet, assign them across multiple SMTP inboxes with warmup limits, send a **3-step** sequence with delays, track opens, and stop sequences when replies arrive (IMAP).

Built with **Next.js 16** (App Router), **React 19**, **SQLite** via **Drizzle ORM** + **better-sqlite3**, and a small **standalone daily script** you can run from cron.

---

## Features

- **Campaign import** — Upload `.xlsx`; rows become `contacts` under a campaign with per-lead subjects/bodies for three emails.
- **Multi-inbox sending** — Credentials live in `config/inboxes.json` (not in the DB). Scheduler syncs inboxes, round-robins pending contacts, and respects per-inbox caps.
- **Warmup** — Daily send cap rises by calendar days since `warmupStartDate`: days 1–7 → 5, 8–14 → 10, 15–21 → 20, 22–28 → 35, day 29+ → 50 (see `src/lib/warmup.ts`).
- **Sequence** — Three emails per contact; **3 days** between steps (`SEQUENCE_DELAY_DAYS` in `src/lib/scheduler.ts`).
- **Open tracking** — 1×1 pixel at `/api/track/[id]` updates `sent_emails.openedAt`.
- **Reply detection** — IMAP polling matches `In-Reply-To` / `References` to stored SMTP `Message-ID`; contact moves to `replied` and the sequence stops.

---

## Prerequisites

- **Node.js** — Use a version compatible with your **pnpm** install. Next.js 16 and this toolchain are typically run on **Node 20+**; **pnpm 11** expects **Node ≥ 22.13** (older Node will fail with errors like missing `node:sqlite` inside pnpm itself).
- **pnpm** — [pnpm](https://pnpm.io/) is the assumed package manager.

---

## Setup

### 1. Clone and install

```bash
pnpm install
```

If pnpm reports **ignored build scripts** for `better-sqlite3`, `esbuild`, `sharp`, etc., approve them so native modules compile:

```bash
pnpm approve-builds
pnpm install
```

### 2. Environment variables

Create **`.env.local`** in the project root (see also `.gitignore`). Typical variables:

| Variable | Purpose |
|----------|---------|
| `DB_PATH` | SQLite file path (default: `./data/campaigns.db`) |
| `INTERNAL_API_SECRET` | Shared secret for `POST /api/send` and `POST /api/check-replies` (header `x-internal-secret`) |
| `NEXT_PUBLIC_INTERNAL_SECRET` | Same value as `INTERNAL_API_SECRET` if you use the dashboard “run send” control (it is exposed to the browser — use only in trusted environments) |
| `REPLY_TO_EMAIL` | Reply-To on outbound mail |
| `TRACKING_BASE_URL` | Origin used in open-tracking pixel URLs (e.g. your deployed site) |
| `INBOXES_CONFIG_PATH` | Optional absolute path to inboxes JSON instead of `config/inboxes.json` |

The daily script loads `.env.local` via:

`pnpm run daily` → `tsx --env-file=.env.local src/scripts/daily-run.ts`

### 3. Inbox configuration

`config/inboxes.json` is **gitignored**. Create it locally with an array of objects:

| Field | Description |
|-------|-------------|
| `id` | Stable string ID (synced to DB) |
| `address` | From / SMTP identity email |
| `smtpHost` / `smtpPort` | Outbound SMTP |
| `username` / `password` | SMTP auth |
| `imapHost` / `imapPort` | IMAP for reply polling |
| `warmupStartDate` | ISO date string (e.g. `2026-05-13`) — start of warmup calendar |
| `active` | Whether this inbox participates in sending |

After edits, the app reloads config on process restart; in code, `reloadInboxConfigs()` clears the in-memory cache.

### 4. Database

SQLite file is created under `data/` when the app or scripts first use the DB. Drizzle:

```bash
pnpm run db:push    # apply schema to SQLite
pnpm run db:studio  # optional Drizzle Studio GUI
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Next.js dev server (e.g. http://localhost:3000) |
| `pnpm run build` | Production build |
| `pnpm run start` | Start production server |
| `pnpm run lint` | ESLint |
| `pnpm run daily` | Run reply check, then send queue (for cron) |
| `pnpm run db:push` | Push Drizzle schema to SQLite |
| `pnpm run db:studio` | Open Drizzle Studio |

There are **no automated tests** in this repo.

---

## App routes (UI)

- **`/`** — Dashboard stats, inbox warmup summary, send trigger (when configured).
- **`/contacts`** — Contacts list / management.
- **`/inboxes`** — Inbox-oriented UI tied to synced data.

---

## HTTP API (automation)

Protected routes expect header **`x-internal-secret: <INTERNAL_API_SECRET>`**.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/send` | Run scheduler / send queue. JSON body optional: `{ "dryRun": true }` |
| `POST` | `/api/check-replies` | IMAP reply scan |
| `GET` | `/api/track/[id]` | Open-tracking pixel |

Other routes under `src/app/api/` support the UI (import, contacts, stats, inboxes, etc.).

---

## Architecture (short)

| Area | Role |
|------|------|
| `src/lib/importer.ts` | Parse `.xlsx`, bulk-insert contacts |
| `src/lib/scheduler.ts` | Sync inboxes, assign contacts, send due steps, write `sent_emails` |
| `src/lib/mailer.ts` | SMTP send + tracking pixel injection |
| `src/lib/imap.ts` | Reply matching across inboxes |
| `src/lib/warmup.ts` | Per-inbox daily caps |
| `src/lib/db/` | Drizzle schema + client |
| `src/scripts/daily-run.ts` | Cron-friendly entry: check replies → send queue |

Contact **`status`** lifecycle includes: `pending` → `active` → `complete` | `replied` | `bounced` | `unsubscribed` | `error`. **`sequenceStep`**: `0` = none sent, `1`–`2` = progress, `3` = sequence complete.

---

## Security notes

- Treat **`config/inboxes.json`** as secrets; keep it out of version control (already in `.gitignore`).
- Prefer **`INTERNAL_API_SECRET`** only on the server; avoid exposing it via public env vars unless you accept the risk for a private dashboard.

---

## License

Private project (`"private": true` in `package.json`). Add a license file if you open-source it.
