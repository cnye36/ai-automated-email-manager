import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'campaigns.db')

const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Create all tables on first run — idempotent
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    file_name TEXT,
    imported_at INTEGER DEFAULT (unixepoch()),
    total_contacts INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inboxes (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    warmup_start_date TEXT NOT NULL,
    sent_today INTEGER DEFAULT 0,
    last_sent_date TEXT,
    total_sent INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    assigned_inbox_id TEXT,
    lead_id TEXT,
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    company_name TEXT,
    company_name_for_emails TEXT,
    corporate_phone TEXT,
    company_phone TEXT,
    mobile_phone TEXT,
    primary_email TEXT NOT NULL,
    last_verified_at TEXT,
    seniority TEXT,
    last_contacted TEXT,
    employees TEXT,
    industry TEXT,
    person_linkedin_url TEXT,
    website TEXT,
    company_linkedin_url TEXT,
    facebook_url TEXT,
    twitter_url TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    company_address TEXT,
    research_summary TEXT,
    email_1_subject TEXT,
    email_1_body TEXT,
    email_2_subject TEXT,
    email_2_body TEXT,
    email_3_subject TEXT,
    email_3_body TEXT,
    sequence_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    next_send_date INTEGER,
    notes TEXT,
    import_error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sent_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    inbox_id TEXT,
    campaign_id INTEGER REFERENCES campaigns(id),
    sequence_step INTEGER NOT NULL,
    subject TEXT,
    message_id TEXT,
    tracking_pixel_id TEXT,
    sent_at INTEGER,
    opened_at INTEGER,
    replied_at INTEGER,
    error TEXT
  );
`)
