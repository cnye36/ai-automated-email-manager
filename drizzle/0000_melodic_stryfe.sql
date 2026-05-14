CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"file_name" text,
	"imported_at" integer DEFAULT (extract(epoch from now()))::int,
	"total_contacts" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"assigned_inbox_id" text,
	"lead_id" text,
	"first_name" text,
	"last_name" text,
	"title" text,
	"company_name" text,
	"company_name_for_emails" text,
	"corporate_phone" text,
	"company_phone" text,
	"mobile_phone" text,
	"primary_email" text NOT NULL,
	"last_verified_at" text,
	"seniority" text,
	"last_contacted" text,
	"employees" text,
	"industry" text,
	"person_linkedin_url" text,
	"website" text,
	"company_linkedin_url" text,
	"facebook_url" text,
	"twitter_url" text,
	"city" text,
	"state" text,
	"country" text,
	"company_address" text,
	"research_summary" text,
	"email_1_subject" text,
	"email_1_body" text,
	"email_2_subject" text,
	"email_2_body" text,
	"email_3_subject" text,
	"email_3_body" text,
	"sequence_step" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"next_send_date" integer,
	"notes" text,
	"import_error" text,
	"created_at" integer DEFAULT (extract(epoch from now()))::int,
	"updated_at" integer DEFAULT (extract(epoch from now()))::int
);
--> statement-breakpoint
CREATE TABLE "inboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"warmup_start_date" text NOT NULL,
	"sent_today" integer DEFAULT 0,
	"last_sent_date" text,
	"total_sent" integer DEFAULT 0,
	"active" boolean DEFAULT true,
	"created_at" integer DEFAULT (extract(epoch from now()))::int
);
--> statement-breakpoint
CREATE TABLE "reply_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"sent_email_id" integer,
	"campaign_id" integer,
	"inbox_id" text NOT NULL,
	"provider_message_id" text,
	"from_address" text,
	"from_name" text,
	"subject" text,
	"received_at" integer NOT NULL,
	"disposition" text DEFAULT 'needs_review',
	"notes" text,
	"created_at" integer DEFAULT (extract(epoch from now()))::int
);
--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"inbox_id" text,
	"campaign_id" integer,
	"sequence_step" integer NOT NULL,
	"subject" text,
	"message_id" text,
	"tracking_pixel_id" text,
	"sent_at" integer,
	"opened_at" integer,
	"replied_at" integer,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_events" ADD CONSTRAINT "reply_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_events" ADD CONSTRAINT "reply_events_sent_email_id_sent_emails_id_fk" FOREIGN KEY ("sent_email_id") REFERENCES "public"."sent_emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_events" ADD CONSTRAINT "reply_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contacts_campaign_id" ON "contacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_status" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contacts_next_send_date" ON "contacts" USING btree ("next_send_date");--> statement-breakpoint
CREATE INDEX "idx_reply_events_contact_id" ON "reply_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_reply_events_inbox_id" ON "reply_events" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "idx_reply_events_received_at" ON "reply_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reply_events_unique_message" ON "reply_events" USING btree ("inbox_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "idx_sent_emails_contact_id" ON "sent_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_sent_emails_campaign_id" ON "sent_emails" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_sent_emails_tracking_pixel_id" ON "sent_emails" USING btree ("tracking_pixel_id");