import ExcelJS from 'exceljs'
import { db } from './db/client'
import { contacts, campaigns } from './db/schema'
import type { NewContact } from './db/schema'
import { eq, sql } from 'drizzle-orm'

// Maps xlsx column headers to our DB fields
const COLUMN_MAP: Record<string, keyof NewContact> = {
  'lead_id': 'leadId',
  'first name': 'firstName',
  'last name': 'lastName',
  'title': 'title',
  'company name': 'companyName',
  'company name for emails': 'companyNameForEmails',
  'corporate phone': 'corporatePhone',
  'company phone': 'companyPhone',
  'mobile phone': 'mobilePhone',
  'primary email': 'primaryEmail',
  'last verified at': 'lastVerifiedAt',
  'seniority': 'seniority',
  'last contacted': 'lastContacted',
  '# employees': 'employees',
  'industry': 'industry',
  'person linkedin url': 'personLinkedinUrl',
  'website': 'website',
  'company linkedin url': 'companyLinkedinUrl',
  'facebook url': 'facebookUrl',
  'twitter url': 'twitterUrl',
  'city': 'city',
  'state': 'state',
  'country': 'country',
  'company address': 'companyAddress',
  'research_summary': 'researchSummary',
  'email_1_subject': 'email1Subject',
  'email_1_body': 'email1Body',
  'email_2_subject': 'email2Subject',
  'email_2_body': 'email2Body',
  'email_3_subject': 'email3Subject',
  'email_3_body': 'email3Body',
}

export interface ImportResult {
  campaignId: number
  imported: number
  skipped: number
  errors: string[]
}

export async function importXlsx(
  filePath: string,
  campaignName: string
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const worksheet = workbook.worksheets[0]
  const errors: string[] = []
  const rows: NewContact[] = []

  // Build column index map from header row
  const headerRow = worksheet.getRow(1)
  const colIndex: Record<number, keyof NewContact> = {}

  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value || '').toLowerCase().trim()
    const field = COLUMN_MAP[header]
    if (field) colIndex[colNumber] = field
  })

  // Create campaign record
  const [campaign] = await db
    .insert(campaigns)
    .values({ name: campaignName, fileName: filePath.split('/').pop() })
    .returning()

  // Parse data rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // skip header

    const contact: Partial<NewContact> & { primaryEmail?: string; campaignId: number } = { campaignId: campaign.id }

    row.eachCell((cell, colNumber) => {
      const field = colIndex[colNumber]
      if (field) {
        const val = cell.value
        // ExcelJS returns rich text objects for some cells
        const strVal =
          val === null || val === undefined
            ? null
            : typeof val === 'object' && 'richText' in (val as object)
            ? (val as { richText: { text: string }[] }).richText.map((r) => r.text).join('')
            : String(val).trim()
        ;(contact as Record<string, unknown>)[field] = strVal || null
      }
    })

    if (!contact.primaryEmail) {
      errors.push(`Row ${rowNumber}: missing primary email — skipped`)
      return
    }

    contact.status = 'pending'
    contact.sequenceStep = 0
    rows.push(contact as NewContact)
  })

  // Bulk insert in chunks of 200
  let imported = 0
  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    await db.insert(contacts).values(chunk)
    imported += chunk.length
  }

  // Update campaign contact count
  await db
    .update(campaigns)
    .set({ totalContacts: imported })
    .where(eq(campaigns.id, campaign.id))

  return {
    campaignId: campaign.id,
    imported,
    skipped: errors.length,
    errors,
  }
}
