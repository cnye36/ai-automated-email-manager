import { boolean, index, integer, pgTable, primaryKey, serial, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  fileName: text('file_name'),
  importedAt: integer('imported_at').default(sql`(extract(epoch from now()))::int`),
  totalContacts: integer('total_contacts').default(0),
  active: boolean('active').default(true),
})

export const sendLocks = pgTable('send_locks', {
  id: text('id').primaryKey(),
  lockedAt: integer('locked_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

export const inboxes = pgTable('inboxes', {
  id: text('id').primaryKey(),
  address: text('address').notNull(),
  warmupStartDate: text('warmup_start_date').notNull(),
  sentToday: integer('sent_today').default(0),
  lastSentDate: text('last_sent_date'),
  totalSent: integer('total_sent').default(0),
  bounceCount: integer('bounce_count').default(0),
  active: boolean('active').default(true),
  createdAt: integer('created_at').default(sql`(extract(epoch from now()))::int`),
})

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  assignedInboxId: text('assigned_inbox_id'),

  leadId: text('lead_id'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  title: text('title'),
  companyName: text('company_name'),
  companyNameForEmails: text('company_name_for_emails'),
  corporatePhone: text('corporate_phone'),
  companyPhone: text('company_phone'),
  mobilePhone: text('mobile_phone'),
  primaryEmail: text('primary_email').notNull(),
  lastVerifiedAt: text('last_verified_at'),
  seniority: text('seniority'),
  lastContacted: text('last_contacted'),
  employees: text('employees'),
  industry: text('industry'),
  personLinkedinUrl: text('person_linkedin_url'),
  website: text('website'),
  companyLinkedinUrl: text('company_linkedin_url'),
  facebookUrl: text('facebook_url'),
  twitterUrl: text('twitter_url'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  companyAddress: text('company_address'),
  researchSummary: text('research_summary'),

  email1Subject: text('email_1_subject'),
  email1Body: text('email_1_body'),
  email2Subject: text('email_2_subject'),
  email2Body: text('email_2_body'),
  email3Subject: text('email_3_subject'),
  email3Body: text('email_3_body'),

  sequenceStep: integer('sequence_step').default(0),
  status: text('status').default('pending'),
  nextSendDate: integer('next_send_date'),
  notes: text('notes'),
  importError: text('import_error'),

  createdAt: integer('created_at').default(sql`(extract(epoch from now()))::int`),
  updatedAt: integer('updated_at').default(sql`(extract(epoch from now()))::int`),
}, (table) => [
  index('idx_contacts_campaign_id').on(table.campaignId),
  index('idx_contacts_status').on(table.status),
  index('idx_contacts_next_send_date').on(table.nextSendDate),
])

export const sentEmails = pgTable('sent_emails', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id),
  inboxId: text('inbox_id'),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  sequenceStep: integer('sequence_step').notNull(),
  subject: text('subject'),
  messageId: text('message_id'),
  trackingPixelId: text('tracking_pixel_id'),
  sentAt: integer('sent_at'),
  openedAt: integer('opened_at'),
  repliedAt: integer('replied_at'),
  bouncedAt: integer('bounced_at'),
  bounceReason: text('bounce_reason'),
  error: text('error'),
}, (table) => [
  index('idx_sent_emails_contact_id').on(table.contactId),
  index('idx_sent_emails_campaign_id').on(table.campaignId),
  index('idx_sent_emails_tracking_pixel_id').on(table.trackingPixelId),
  index('idx_sent_emails_inbox_id').on(table.inboxId),
  index('idx_sent_emails_message_id').on(table.messageId),
])

export const replyEvents = pgTable('reply_events', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id),
  sentEmailId: integer('sent_email_id').references(() => sentEmails.id),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  inboxId: text('inbox_id').notNull(),
  providerMessageId: text('provider_message_id'),
  fromAddress: text('from_address'),
  fromName: text('from_name'),
  subject: text('subject'),
  receivedAt: integer('received_at').notNull(),
  disposition: text('disposition').default('needs_review'),
  notes: text('notes'),
  createdAt: integer('created_at').default(sql`(extract(epoch from now()))::int`),
}, (table) => [
  index('idx_reply_events_contact_id').on(table.contactId),
  index('idx_reply_events_inbox_id').on(table.inboxId),
  index('idx_reply_events_received_at').on(table.receivedAt),
  uniqueIndex('idx_reply_events_unique_message').on(table.inboxId, table.providerMessageId),
])

export const campaignInboxes = pgTable('campaign_inboxes', {
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  inboxId: text('inbox_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.inboxId] }),
  index('idx_campaign_inboxes_campaign_id').on(table.campaignId),
])

export type Campaign = typeof campaigns.$inferSelect
export type Inbox = typeof inboxes.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type SentEmail = typeof sentEmails.$inferSelect
export type ReplyEvent = typeof replyEvents.$inferSelect
export type CampaignInbox = typeof campaignInboxes.$inferSelect
export type NewContact = typeof contacts.$inferInsert
