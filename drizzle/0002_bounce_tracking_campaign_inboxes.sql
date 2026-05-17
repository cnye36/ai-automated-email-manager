-- Migration: bounce tracking + campaign-inbox assignment
-- Applied manually via Supabase SQL Editor on 2026-05-16

-- 1. Add bounce tracking to sent_emails
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS bounced_at integer;
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS bounce_reason text;

-- 2. Add bounce counter to inboxes
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS bounce_count integer DEFAULT 0;

-- 3. New indexes for performance
CREATE INDEX IF NOT EXISTS idx_sent_emails_inbox_id ON sent_emails(inbox_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_message_id ON sent_emails(message_id);

-- 4. Campaign-to-inbox assignment table
CREATE TABLE IF NOT EXISTS campaign_inboxes (
  campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  inbox_id text NOT NULL,
  PRIMARY KEY (campaign_id, inbox_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_inboxes_campaign_id ON campaign_inboxes(campaign_id);
