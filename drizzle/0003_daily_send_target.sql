-- Per-inbox manual daily send target (null = use full warmup max)
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS daily_send_target integer;
