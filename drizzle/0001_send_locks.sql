CREATE TABLE IF NOT EXISTS "send_locks" (
  "id" text PRIMARY KEY NOT NULL,
  "locked_at" integer NOT NULL,
  "expires_at" integer NOT NULL
);
