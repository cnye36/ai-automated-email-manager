import { db } from './db/client'
import { contacts, campaigns, sentEmails } from './db/schema'
import type { Contact, NewContact } from './db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import {
  getProfileFields,
  getUpdatableEmailFields,
  parseSpreadsheetFile,
} from './spreadsheet-columns'

const TERMINAL_STATUSES = new Set([
  'replied',
  'interested',
  'not_interested',
  'do_not_contact',
  'bounced',
  'unsubscribed',
  'no_longer_at_company',
  'unreachable',
  'complete',
])

export interface CampaignSyncResult {
  campaignId: number
  updated: number
  inserted: number
  unchanged: number
  skippedProtected: number
  skippedDuplicateInFile: number
  skippedGlobalDuplicate: number
  notInFile: number
  errors: string[]
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

function sentStepsForContact(contactId: number, sentByContact: Map<number, Set<number>>): Set<number> {
  return sentByContact.get(contactId) ?? new Set()
}

function pickFields(
  source: Partial<NewContact>,
  fields: Array<keyof NewContact>,
): Partial<NewContact> {
  const out: Partial<NewContact> = {}
  for (const field of fields) {
    if (field in source) {
      ;(out as Record<string, unknown>)[field] = (source as Record<string, unknown>)[field] ?? null
    }
  }
  return out
}

function hasFieldUpdates(values: Partial<NewContact>): boolean {
  return Object.keys(values).length > 0
}

const ALL_EMAIL_FIELDS: Array<keyof NewContact> = [
  'email1Subject',
  'email1Body',
  'email2Subject',
  'email2Body',
  'email3Subject',
  'email3Body',
]

function hasBlockedEmailChanges(
  existing: Contact,
  rowData: Partial<NewContact>,
  sentSteps: Set<number>,
): boolean {
  const blockedFields = getUpdatableEmailFields(sentSteps)
  const blockedSet = new Set(
    ALL_EMAIL_FIELDS.filter((f) => !blockedFields.includes(f)),
  )
  for (const field of blockedSet) {
    if (!(field in rowData)) continue
    const incoming = (rowData as Record<string, unknown>)[field]
    if (incoming == null || incoming === '') continue
    const current = (existing as Record<string, unknown>)[field]
    if (String(incoming) !== String(current ?? '')) return true
  }
  return false
}

async function loadGlobalBlockedEmails(emails: string[]): Promise<Set<string>> {
  const blocked = new Set<string>()
  const chunkSize = 500

  for (let i = 0; i < emails.length; i += chunkSize) {
    const batch = emails.slice(i, i + chunkSize)

    const existing = await db
      .select({
        primaryEmail: contacts.primaryEmail,
        status: contacts.status,
        sequenceStep: contacts.sequenceStep,
        campaignId: contacts.campaignId,
      })
      .from(contacts)
      .where(inArray(sql`lower(trim(${contacts.primaryEmail}))`, batch))

    for (const c of existing) {
      const email = normalizeEmail(c.primaryEmail)
      const status = c.status ?? 'pending'
      const step = c.sequenceStep ?? 0
      if (step > 0 || !['pending', 'error'].includes(status)) {
        blocked.add(email)
      }
    }

    const emailed = await db
      .select({ primaryEmail: contacts.primaryEmail })
      .from(sentEmails)
      .innerJoin(contacts, eq(sentEmails.contactId, contacts.id))
      .where(inArray(sql`lower(trim(${contacts.primaryEmail}))`, batch))

    for (const row of emailed) {
      blocked.add(normalizeEmail(row.primaryEmail))
    }
  }

  return blocked
}

function buildUpdatePayload(
  existing: Contact,
  rowData: Partial<NewContact>,
  sentSteps: Set<number>,
): Partial<NewContact> | null {
  const terminal = TERMINAL_STATUSES.has(existing.status ?? '')
  const profileFields = getProfileFields()
  const emailFields = terminal ? [] : getUpdatableEmailFields(sentSteps)
  const allowed = [...profileFields, ...emailFields]
  const patch = pickFields(rowData, allowed)
  return hasFieldUpdates(patch) ? patch : null
}

export async function syncCampaignFromFile(
  campaignId: number,
  filePath: string,
): Promise<CampaignSyncResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found.`)
  }

  const { rows, errors } = await parseSpreadsheetFile(filePath)

  const existingContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId))

  const byEmail = new Map<string, Contact>()
  for (const c of existingContacts) {
    byEmail.set(normalizeEmail(c.primaryEmail), c)
  }

  const sentRows = await db
    .select({ contactId: sentEmails.contactId, sequenceStep: sentEmails.sequenceStep })
    .from(sentEmails)
    .where(eq(sentEmails.campaignId, campaignId))

  const sentByContact = new Map<number, Set<number>>()
  for (const row of sentRows) {
    if (!row.contactId) continue
    const set = sentByContact.get(row.contactId) ?? new Set()
    set.add(row.sequenceStep)
    sentByContact.set(row.contactId, set)
  }

  const seenInFile = new Set<string>()
  const now = Math.floor(Date.now() / 1000)

  let updated = 0
  let inserted = 0
  let unchanged = 0
  let skippedProtected = 0
  let skippedDuplicateInFile = 0
  let skippedGlobalDuplicate = 0

  const emailsToInsert = new Set<string>()

  for (const { rowNumber, data } of rows) {
    const email = normalizeEmail(data.primaryEmail)

    if (seenInFile.has(email)) {
      skippedDuplicateInFile++
      errors.push(`Row ${rowNumber}: duplicate email in file — skipped`)
      continue
    }
    seenInFile.add(email)

    const existing = byEmail.get(email)
    if (existing) {
      const terminal = TERMINAL_STATUSES.has(existing.status ?? '')
      const sentSteps = sentStepsForContact(existing.id, sentByContact)
      const patch = buildUpdatePayload(existing, data, sentSteps)
      if (!patch) {
        if (terminal && hasBlockedEmailChanges(existing, data, sentSteps)) {
          skippedProtected++
        } else {
          unchanged++
        }
        continue
      }
      await db
        .update(contacts)
        .set({ ...patch, updatedAt: now })
        .where(eq(contacts.id, existing.id))
      updated++
      continue
    }

    emailsToInsert.add(email)
  }

  if (emailsToInsert.size > 0) {
    const globalBlocked = await loadGlobalBlockedEmails([...emailsToInsert])

    for (const { rowNumber, data } of rows) {
      const email = normalizeEmail(data.primaryEmail)
      if (byEmail.has(email)) continue
      if (!emailsToInsert.has(email)) continue

      if (globalBlocked.has(email)) {
        skippedGlobalDuplicate++
        errors.push(`Row ${rowNumber}: ${data.primaryEmail} already in outreach elsewhere — skipped`)
        continue
      }

      const insertRow: NewContact = {
        ...pickFields(data, [
          ...getProfileFields(),
          'email1Subject',
          'email1Body',
          'email2Subject',
          'email2Body',
          'email3Subject',
          'email3Body',
        ]),
        campaignId,
        primaryEmail: data.primaryEmail.trim(),
        status: 'pending',
        sequenceStep: 0,
      } as NewContact

      await db.insert(contacts).values(insertRow)
      inserted++
      byEmail.set(email, { ...insertRow, id: -1 } as Contact)
    }
  }

  const notInFile = existingContacts.filter(
    (c) => !seenInFile.has(normalizeEmail(c.primaryEmail)),
  ).length

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId))

  await db
    .update(campaigns)
    .set({ totalContacts: countRow?.count ?? 0 })
    .where(eq(campaigns.id, campaignId))

  return {
    campaignId,
    updated,
    inserted,
    unchanged,
    skippedProtected,
    skippedDuplicateInFile,
    skippedGlobalDuplicate,
    notInFile,
    errors,
  }
}
