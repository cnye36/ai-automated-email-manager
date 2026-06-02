import { db } from './db/client'
import { contacts, campaigns, sentEmails } from './db/schema'
import type { NewContact } from './db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import path from 'path'
import { parseSpreadsheetFile } from './spreadsheet-columns'

export interface ImportResult {
  campaignId: number
  imported: number
  skipped: number
  duplicates: number
  errors: string[]
  headers: string[]
  /** Set when all rows were skipped as duplicates — use Sync on an existing campaign instead. */
  suggestSyncCampaignId?: number
}

export async function importFile(
  filePath: string,
  campaignName: string,
  sourceFileName = path.basename(filePath),
): Promise<ImportResult> {
  const { rows: parsedRows, headers, errors } = await parseSpreadsheetFile(filePath)

  const [campaign] = await db
    .insert(campaigns)
    .values({ name: campaignName, fileName: sourceFileName })
    .returning()

  const rows: NewContact[] = parsedRows.map(({ data }) => ({
    ...data,
    campaignId: campaign.id,
    status: 'pending',
    sequenceStep: 0,
  })) as NewContact[]

  const seenEmails = new Set<string>()
  const uniqueRows: NewContact[] = []
  let inFileDeduped = 0
  for (const row of rows) {
    const email = row.primaryEmail.toLowerCase().trim()
    if (seenEmails.has(email)) {
      inFileDeduped++
    } else {
      seenEmails.add(email)
      uniqueRows.push(row)
    }
  }

  let dbDeduped = 0
  let toInsert = uniqueRows
  if (uniqueRows.length > 0) {
    const blockedEmails = new Set<string>()
    const chunkSize = 500
    const allEmails = uniqueRows.map((r) => r.primaryEmail.toLowerCase().trim())

    for (let i = 0; i < allEmails.length; i += chunkSize) {
      const batch = allEmails.slice(i, i + chunkSize)

      const existing = await db
        .select({
          primaryEmail: contacts.primaryEmail,
          status: contacts.status,
          sequenceStep: contacts.sequenceStep,
        })
        .from(contacts)
        .where(inArray(sql`lower(trim(${contacts.primaryEmail}))`, batch))

      for (const c of existing) {
        const email = c.primaryEmail.toLowerCase().trim()
        const status = c.status ?? 'pending'
        const step = c.sequenceStep ?? 0
        if (step > 0 || !['pending', 'error'].includes(status)) {
          blockedEmails.add(email)
        }
      }

      const emailed = await db
        .select({ primaryEmail: contacts.primaryEmail })
        .from(sentEmails)
        .innerJoin(contacts, eq(sentEmails.contactId, contacts.id))
        .where(inArray(sql`lower(trim(${contacts.primaryEmail}))`, batch))

      for (const row of emailed) {
        blockedEmails.add(row.primaryEmail.toLowerCase().trim())
      }
    }

    if (blockedEmails.size > 0) {
      toInsert = uniqueRows.filter((r) => {
        if (blockedEmails.has(r.primaryEmail.toLowerCase().trim())) {
          dbDeduped++
          return false
        }
        return true
      })
    }
  }

  let imported = 0
  const chunkSize = 200
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize)
    await db.insert(contacts).values(chunk)
    imported += chunk.length
  }

  const duplicates = inFileDeduped + dbDeduped

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.campaignId, campaign.id))

  await db
    .update(campaigns)
    .set({ totalContacts: countRow?.count ?? imported })
    .where(eq(campaigns.id, campaign.id))

  let suggestSyncCampaignId: number | undefined
  if (imported === 0 && dbDeduped > 0 && uniqueRows.length > 0) {
    const emailToCampaign = new Map<string, number>()
    const dupEmails = uniqueRows.map((r) => r.primaryEmail.toLowerCase().trim())
    for (let i = 0; i < dupEmails.length; i += 500) {
      const batch = dupEmails.slice(i, i + 500)
      const rows = await db
        .select({ primaryEmail: contacts.primaryEmail, campaignId: contacts.campaignId })
        .from(contacts)
        .where(inArray(sql`lower(trim(${contacts.primaryEmail}))`, batch))
      for (const row of rows) {
        if (row.campaignId != null) {
          emailToCampaign.set(row.primaryEmail.toLowerCase().trim(), row.campaignId)
        }
      }
    }
    const counts = new Map<number, number>()
    for (const email of dupEmails) {
      const cid = emailToCampaign.get(email)
      if (cid != null) counts.set(cid, (counts.get(cid) ?? 0) + 1)
    }
    let bestId: number | undefined
    let bestCount = 0
    for (const [cid, n] of counts) {
      if (n > bestCount) {
        bestCount = n
        bestId = cid
      }
    }
    if (bestId != null && bestCount >= Math.floor(dupEmails.length * 0.5)) {
      suggestSyncCampaignId = bestId
    }
  }

  return {
    campaignId: campaign.id,
    imported,
    skipped: errors.length,
    duplicates,
    errors,
    headers,
    suggestSyncCampaignId,
  }
}

export const importXlsx = importFile
