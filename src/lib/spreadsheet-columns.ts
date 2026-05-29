import ExcelJS from 'exceljs'
import path from 'path'
import type { NewContact } from './db/schema'

/** Maps normalized spreadsheet headers → contact DB fields */
export const CONTACT_COLUMN_MAP: Record<string, keyof NewContact> = {
  lead_id: 'leadId',
  'lead id': 'leadId',
  'first name': 'firstName',
  firstname: 'firstName',
  'last name': 'lastName',
  lastname: 'lastName',
  title: 'title',
  'company name': 'companyName',
  company: 'companyName',
  'company name for emails': 'companyNameForEmails',
  'corporate phone': 'corporatePhone',
  'company phone': 'companyPhone',
  'mobile phone': 'mobilePhone',
  'primary email': 'primaryEmail',
  email: 'primaryEmail',
  'email address': 'primaryEmail',
  'work email': 'primaryEmail',
  'last verified at': 'lastVerifiedAt',
  seniority: 'seniority',
  'last contacted': 'lastContacted',
  '# employees': 'employees',
  industry: 'industry',
  'person linkedin url': 'personLinkedinUrl',
  website: 'website',
  'company linkedin url': 'companyLinkedinUrl',
  'facebook url': 'facebookUrl',
  'twitter url': 'twitterUrl',
  city: 'city',
  state: 'state',
  country: 'country',
  'company address': 'companyAddress',
  research_summary: 'researchSummary',
  'research summary': 'researchSummary',
  email_1_subject: 'email1Subject',
  'email 1 subject': 'email1Subject',
  'email1 subject': 'email1Subject',
  'first email subject': 'email1Subject',
  email_1_body: 'email1Body',
  'email 1 body': 'email1Body',
  'email1 body': 'email1Body',
  'first email body': 'email1Body',
  email_2_subject: 'email2Subject',
  'email 2 subject': 'email2Subject',
  'email2 subject': 'email2Subject',
  'second email subject': 'email2Subject',
  email_2_body: 'email2Body',
  'email 2 body': 'email2Body',
  'email2 body': 'email2Body',
  'second email body': 'email2Body',
  email_3_subject: 'email3Subject',
  'email 3 subject': 'email3Subject',
  'email3 subject': 'email3Subject',
  'third email subject': 'email3Subject',
  email_3_body: 'email3Body',
  'email 3 body': 'email3Body',
  'email3 body': 'email3Body',
  'third email body': 'email3Body',
}

/** Export / sync stats columns — never written back to contact fields on sync */
export const STATS_EXPORT_HEADERS = [
  'app_contact_id',
  'status',
  'sequence_step',
  'assigned_inbox',
  'next_send_at',
  'email_1_sent_at',
  'email_1_opened',
  'email_2_sent_at',
  'email_2_opened',
  'email_3_sent_at',
  'email_3_opened',
  'replied',
  'replied_at',
  'bounced',
  'bounce_reason',
] as const

const STATS_HEADER_SET = new Set(
  STATS_EXPORT_HEADERS.map((h) => normalizeHeader(h)),
)

/** Column order for exports (lead fields then emails then stats) */
export const EXPORT_CONTACT_FIELDS: Array<{ field: keyof NewContact; header: string }> = [
  { field: 'leadId', header: 'lead_id' },
  { field: 'firstName', header: 'first_name' },
  { field: 'lastName', header: 'last_name' },
  { field: 'title', header: 'title' },
  { field: 'companyName', header: 'company_name' },
  { field: 'companyNameForEmails', header: 'company_name_for_emails' },
  { field: 'corporatePhone', header: 'corporate_phone' },
  { field: 'companyPhone', header: 'company_phone' },
  { field: 'mobilePhone', header: 'mobile_phone' },
  { field: 'primaryEmail', header: 'primary_email' },
  { field: 'lastVerifiedAt', header: 'last_verified_at' },
  { field: 'seniority', header: 'seniority' },
  { field: 'lastContacted', header: 'last_contacted' },
  { field: 'employees', header: 'employees' },
  { field: 'industry', header: 'industry' },
  { field: 'personLinkedinUrl', header: 'person_linkedin_url' },
  { field: 'website', header: 'website' },
  { field: 'companyLinkedinUrl', header: 'company_linkedin_url' },
  { field: 'facebookUrl', header: 'facebook_url' },
  { field: 'twitterUrl', header: 'twitter_url' },
  { field: 'city', header: 'city' },
  { field: 'state', header: 'state' },
  { field: 'country', header: 'country' },
  { field: 'companyAddress', header: 'company_address' },
  { field: 'researchSummary', header: 'research_summary' },
  { field: 'email1Subject', header: 'email_1_subject' },
  { field: 'email1Body', header: 'email_1_body' },
  { field: 'email2Subject', header: 'email_2_subject' },
  { field: 'email2Body', header: 'email_2_body' },
  { field: 'email3Subject', header: 'email_3_subject' },
  { field: 'email3Body', header: 'email_3_body' },
]

const PROFILE_FIELDS: Array<keyof NewContact> = [
  'leadId',
  'firstName',
  'lastName',
  'title',
  'companyName',
  'companyNameForEmails',
  'corporatePhone',
  'companyPhone',
  'mobilePhone',
  'lastVerifiedAt',
  'seniority',
  'lastContacted',
  'employees',
  'industry',
  'personLinkedinUrl',
  'website',
  'companyLinkedinUrl',
  'facebookUrl',
  'twitterUrl',
  'city',
  'state',
  'country',
  'companyAddress',
  'researchSummary',
  'notes',
]

const EMAIL_FIELDS_BY_STEP: Array<Array<keyof NewContact>> = [
  ['email1Subject', 'email1Body'],
  ['email2Subject', 'email2Body'],
  ['email3Subject', 'email3Body'],
]

export function normalizeHeader(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cellToString(value: ExcelJS.CellValue): string | null {
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

export function isStatsHeader(header: string): boolean {
  return STATS_HEADER_SET.has(normalizeHeader(header))
}

export function getProfileFields(): Array<keyof NewContact> {
  return [...PROFILE_FIELDS]
}

export function getUpdatableEmailFields(sentSteps: Set<number>): Array<keyof NewContact> {
  const fields: Array<keyof NewContact> = []
  for (let step = 1; step <= 3; step++) {
    if (!sentSteps.has(step)) {
      fields.push(...EMAIL_FIELDS_BY_STEP[step - 1]!)
    }
  }
  return fields
}

export interface ParsedSpreadsheetRow {
  rowNumber: number
  data: Partial<NewContact> & { primaryEmail: string }
}

export interface ParseSpreadsheetResult {
  rows: ParsedSpreadsheetRow[]
  headers: string[]
  errors: string[]
}

export async function parseSpreadsheetFile(filePath: string): Promise<ParseSpreadsheetResult> {
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
  if (!worksheet) {
    throw new Error('Spreadsheet has no worksheets.')
  }

  const errors: string[] = []
  const rows: ParsedSpreadsheetRow[] = []
  const headers: string[] = []
  const colIndex: Record<number, keyof NewContact> = {}

  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value)
    headers.push(header)
    if (isStatsHeader(header)) return
    const field = CONTACT_COLUMN_MAP[header]
    if (field) colIndex[colNumber] = field
  })

  if (!Object.values(colIndex).includes('primaryEmail')) {
    throw new Error('No email column found. Expected a header like "Primary Email", "Email", or "Work Email".')
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const data: Partial<NewContact> & { primaryEmail?: string } = {}

    row.eachCell((cell, colNumber) => {
      const field = colIndex[colNumber]
      if (field) {
        const strVal = cellToString(cell.value)
        ;(data as Record<string, unknown>)[field] = strVal || null
      }
    })

    if (!data.primaryEmail) {
      errors.push(`Row ${rowNumber}: missing primary email — skipped`)
      return
    }

    rows.push({
      rowNumber,
      data: data as ParsedSpreadsheetRow['data'],
    })
  })

  return { rows, headers, errors }
}

export async function writeWorkbookToBuffer(
  workbook: ExcelJS.Workbook,
  format: 'xlsx' | 'csv',
): Promise<Buffer> {
  if (format === 'csv') {
    const buffer = await workbook.csv.writeBuffer()
    return Buffer.from(buffer)
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
