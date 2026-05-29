import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { campaigns, contacts, sentEmails } from './db/schema'
import type { Contact, SentEmail } from './db/schema'
import {
  EXPORT_CONTACT_FIELDS,
  STATS_EXPORT_HEADERS,
  writeWorkbookToBuffer,
} from './spreadsheet-columns'

function formatUnix(ts: number | null | undefined): string {
  if (!ts) return ''
  try {
    return format(new Date(ts * 1000), 'yyyy-MM-dd HH:mm')
  } catch {
    return ''
  }
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

type StepSent = { sentAt: number | null; openedAt: number | null }

function buildSentByStep(rows: SentEmail[]): Map<number, StepSent> {
  const map = new Map<number, StepSent>()
  for (const row of rows) {
    const step = row.sequenceStep
    const existing = map.get(step)
    if (!existing || (row.sentAt ?? 0) > (existing.sentAt ?? 0)) {
      map.set(step, { sentAt: row.sentAt, openedAt: row.openedAt })
    }
  }
  return map
}

function statsRow(
  contact: Contact,
  sentByStep: Map<number, StepSent>,
  allSent: SentEmail[],
): Record<(typeof STATS_EXPORT_HEADERS)[number], string | number> {
  const s1 = sentByStep.get(1)
  const s2 = sentByStep.get(2)
  const s3 = sentByStep.get(3)
  const bounced = allSent.find((s) => s.bouncedAt)
  const repliedAt = allSent.find((s) => s.repliedAt)?.repliedAt

  return {
    app_contact_id: contact.id,
    status: contact.status ?? 'pending',
    sequence_step: contact.sequenceStep ?? 0,
    assigned_inbox: contact.assignedInboxId ?? '',
    next_send_at: formatUnix(contact.nextSendDate),
    email_1_sent_at: formatUnix(s1?.sentAt),
    email_1_opened: yesNo(!!s1?.openedAt),
    email_2_sent_at: formatUnix(s2?.sentAt),
    email_2_opened: yesNo(!!s2?.openedAt),
    email_3_sent_at: formatUnix(s3?.sentAt),
    email_3_opened: yesNo(!!s3?.openedAt),
    replied: yesNo(contact.status === 'replied' || !!repliedAt),
    replied_at: formatUnix(repliedAt),
    bounced: yesNo(contact.status === 'bounced' || !!bounced),
    bounce_reason: bounced?.bounceReason ?? '',
  }
}

export async function exportCampaignToWorkbook(campaignId: number): Promise<{
  workbook: ExcelJS.Workbook
  fileName: string
  rowCount: number
}> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found.`)
  }

  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId))
    .orderBy(contacts.id)

  const sentRows = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.campaignId, campaignId))

  const sentByContactId = new Map<number, SentEmail[]>()
  for (const row of sentRows) {
    if (!row.contactId) continue
    const list = sentByContactId.get(row.contactId) ?? []
    list.push(row)
    sentByContactId.set(row.contactId, list)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ai-automated-email-manager'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('contacts', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const headers = [
    ...EXPORT_CONTACT_FIELDS.map((c) => c.header),
    ...STATS_EXPORT_HEADERS,
  ]
  sheet.addRow(headers)

  for (const contact of contactRows) {
    const allSent = sentByContactId.get(contact.id) ?? []
    const sentByStep = buildSentByStep(allSent)
    const stats = statsRow(contact, sentByStep, allSent)

    const values: Array<string | number> = []
    for (const col of EXPORT_CONTACT_FIELDS) {
      const val = contact[col.field]
      values.push(val == null ? '' : String(val))
    }
    for (const key of STATS_EXPORT_HEADERS) {
      values.push(stats[key])
    }
    sheet.addRow(values)
  }

  const safeName = campaign.name.replace(/[^\w.-]+/g, '_').slice(0, 80) || `campaign-${campaignId}`
  const fileName = `${safeName}-export-${campaignId}.xlsx`

  return { workbook, fileName, rowCount: contactRows.length }
}

export async function exportCampaignToBuffer(
  campaignId: number,
  format: 'xlsx' | 'csv' = 'xlsx',
): Promise<{ buffer: Buffer; fileName: string; rowCount: number }> {
  const { workbook, fileName, rowCount } = await exportCampaignToWorkbook(campaignId)
  const baseName = fileName.replace(/\.xlsx$/i, '')
  const outName = format === 'csv' ? `${baseName}.csv` : fileName
  const buffer = await writeWorkbookToBuffer(workbook, format)
  return { buffer, fileName: outName, rowCount }
}
