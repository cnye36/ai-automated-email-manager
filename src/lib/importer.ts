import ExcelJS from 'exceljs'
import { db } from './db/client'
import { contacts, campaigns } from './db/schema'
import type { NewContact } from './db/schema'
import { eq } from 'drizzle-orm'
import path from 'path'

// Maps xlsx column headers to our DB fields
const COLUMN_MAP: Record<string, keyof NewContact> = {
  'lead_id': 'leadId',
  'lead id': 'leadId',
  'first name': 'firstName',
  'firstname': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'title': 'title',
  'company name': 'companyName',
  'company': 'companyName',
  'company name for emails': 'companyNameForEmails',
  'corporate phone': 'corporatePhone',
  'company phone': 'companyPhone',
  'mobile phone': 'mobilePhone',
  'primary email': 'primaryEmail',
  'email': 'primaryEmail',
  'email address': 'primaryEmail',
  'work email': 'primaryEmail',
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
  'research summary': 'researchSummary',
  'email_1_subject': 'email1Subject',
  'email 1 subject': 'email1Subject',
  'email1 subject': 'email1Subject',
  'first email subject': 'email1Subject',
  'email_1_body': 'email1Body',
  'email 1 body': 'email1Body',
  'email1 body': 'email1Body',
  'first email body': 'email1Body',
  'email_2_subject': 'email2Subject',
  'email 2 subject': 'email2Subject',
  'email2 subject': 'email2Subject',
  'second email subject': 'email2Subject',
  'email_2_body': 'email2Body',
  'email 2 body': 'email2Body',
  'email2 body': 'email2Body',
  'second email body': 'email2Body',
  'email_3_subject': 'email3Subject',
  'email 3 subject': 'email3Subject',
  'email3 subject': 'email3Subject',
  'third email subject': 'email3Subject',
  'email_3_body': 'email3Body',
  'email 3 body': 'email3Body',
  'email3 body': 'email3Body',
  'third email body': 'email3Body',
}

export interface ImportResult {
  campaignId: number
  imported: number
  skipped: number
  errors: string[]
  headers: string[]
}

function normalizeHeader(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((r) => r.text).join('').trim() || null
    }
    if ('text' in value) return String(value.text).trim() || null
    if ('result' in value) return String(value.result ?? '').trim() || null
  }
  return String(value).trim() || null
}

export async function importFile(
  filePath: string,
  campaignName: string,
  sourceFileName = path.basename(filePath)
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook()
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.csv') {
    await workbook.csv.readFile(filePath)
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    await workbook.xlsx.readFile(filePath)
  } else {
    throw new Error('Unsupported file type. Upload a .csv, .xlsx, or .xlsm file.')
  }

  const worksheet = workbook.worksheets[0]
  const errors: string[] = []
  const rows: NewContact[] = []
  const headers: string[] = []

  // Build column index map from header row
  const headerRow = worksheet.getRow(1)
  const colIndex: Record<number, keyof NewContact> = {}

  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value)
    headers.push(header)
    const field = COLUMN_MAP[header]
    if (field) colIndex[colNumber] = field
  })

  if (!Object.values(colIndex).includes('primaryEmail')) {
    throw new Error('No email column found. Expected a header like "Primary Email", "Email", or "Work Email".')
  }

  // Create campaign record
  const [campaign] = await db
    .insert(campaigns)
    .values({ name: campaignName, fileName: sourceFileName })
    .returning()

  // Parse data rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // skip header

    const contact: Partial<NewContact> & { primaryEmail?: string; campaignId: number } = { campaignId: campaign.id }

    row.eachCell((cell, colNumber) => {
      const field = colIndex[colNumber]
      if (field) {
        const strVal = cellToString(cell.value)
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
    headers,
  }
}

export const importXlsx = importFile
