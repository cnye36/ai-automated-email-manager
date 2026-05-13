import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  fileName: text('file_name'),
  importedAt: integer('imported_at').default(sql`(unixepoch())`),
  totalContacts: integer('total_contacts').default(0),
  active: integer('active', { mode: 'boolean' }).default(true),
})

export const inboxes = sqliteTable('inboxes', {
  id: text('id').primaryKey(),
  address: text('address').notNull(),
  warmupStartDate: text('warmup_start_date').notNull(),
  sentToday: integer('sent_today').default(0),
  lastSentDate: text('last_sent_date'),
  totalSent: integer('total_sent').default(0),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
})

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  assignedInboxId: text('assigned_inbox_id'),

  // From xlsx
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

  // Email sequence content (pre-written in xlsx)
  email1Subject: text('email_1_subject'),
  email1Body: text('email_1_body'),
  email2Subject: text('email_2_subject'),
  email2Body: text('email_2_body'),
  email3Subject: text('email_3_subject'),
  email3Body: text('email_3_body'),

  // Sequence tracking
  sequenceStep: integer('sequence_step').default(0), // 0=not started, 1=email1 sent, 2=email2 sent, 3=complete
  status: text('status').default('pending'), // pending | active | replied | bounced | unsubscribed | complete | error
  nextSendDate: integer('next_send_date'), // unix timestamp
  notes: text('notes'),
  importError: text('import_error'),

  createdAt: integer('created_at').default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').default(sql`(unixepoch())`),
})

export const sentEmails = sqliteTable('sent_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').references(() => contacts.id),
  inboxId: text('inbox_id'),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  sequenceStep: integer('sequence_step').notNull(), // 1, 2, or 3
  subject: text('subject'),
  messageId: text('message_id'), // SMTP Message-ID for IMAP reply matching
  trackingPixelId: text('tracking_pixel_id'), // UUID for open tracking
  sentAt: integer('sent_at'),
  openedAt: integer('opened_at'),
  repliedAt: integer('replied_at'),
  error: text('error'),
})

export type Campaign = typeof campaigns.$inferSelect
export type Inbox = typeof inboxes.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type SentEmail = typeof sentEmails.$inferSelect
export type NewContact = typeof contacts.$inferInsert
