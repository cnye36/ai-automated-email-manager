import { readdir } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db/client'
import { campaigns, contacts, sentEmails } from '@/lib/db/schema'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import CampaignsManager, { type CampaignRow } from '@/components/CampaignsManager'
import { formatCampaignPreviewBodies } from '@/lib/email-body'

export const dynamic = 'force-dynamic'

const CAMPAIGN_DIR = path.join(process.cwd(), 'campaigns')
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xlsm'])

async function getCampaigns(): Promise<CampaignRow[]> {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.importedAt))

  return Promise.all(
    rows.map(async (campaign) => {
      const [[contactCount], [sentCount], statusRows, [coverage], [previewContact]] = await Promise.all([
        db.select({ count: count() }).from(contacts).where(eq(contacts.campaignId, campaign.id)),
        db.select({ count: count() }).from(sentEmails).where(eq(sentEmails.campaignId, campaign.id)),
        db
          .select({ status: contacts.status, count: count() })
          .from(contacts)
          .where(eq(contacts.campaignId, campaign.id))
          .groupBy(contacts.status),
        db
          .select({
            email1Complete: sql<number>`sum(case when coalesce(${contacts.email1Subject}, '') != '' and coalesce(${contacts.email1Body}, '') != '' then 1 else 0 end)`,
            email1SubjectOnly: sql<number>`sum(case when coalesce(${contacts.email1Subject}, '') != '' and coalesce(${contacts.email1Body}, '') = '' then 1 else 0 end)`,
            email1BodyOnly: sql<number>`sum(case when coalesce(${contacts.email1Subject}, '') = '' and coalesce(${contacts.email1Body}, '') != '' then 1 else 0 end)`,
            email2Complete: sql<number>`sum(case when coalesce(${contacts.email2Subject}, '') != '' and coalesce(${contacts.email2Body}, '') != '' then 1 else 0 end)`,
            email2SubjectOnly: sql<number>`sum(case when coalesce(${contacts.email2Subject}, '') != '' and coalesce(${contacts.email2Body}, '') = '' then 1 else 0 end)`,
            email2BodyOnly: sql<number>`sum(case when coalesce(${contacts.email2Subject}, '') = '' and coalesce(${contacts.email2Body}, '') != '' then 1 else 0 end)`,
            email3Complete: sql<number>`sum(case when coalesce(${contacts.email3Subject}, '') != '' and coalesce(${contacts.email3Body}, '') != '' then 1 else 0 end)`,
            email3SubjectOnly: sql<number>`sum(case when coalesce(${contacts.email3Subject}, '') != '' and coalesce(${contacts.email3Body}, '') = '' then 1 else 0 end)`,
            email3BodyOnly: sql<number>`sum(case when coalesce(${contacts.email3Subject}, '') = '' and coalesce(${contacts.email3Body}, '') != '' then 1 else 0 end)`,
          })
          .from(contacts)
          .where(eq(contacts.campaignId, campaign.id)),
        db
          .select({
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            primaryEmail: contacts.primaryEmail,
            companyName: contacts.companyName,
            email1Subject: contacts.email1Subject,
            email1Body: contacts.email1Body,
            email2Subject: contacts.email2Subject,
            email2Body: contacts.email2Body,
            email3Subject: contacts.email3Subject,
            email3Body: contacts.email3Body,
          })
          .from(contacts)
          .where(and(
            eq(contacts.campaignId, campaign.id),
            sql`coalesce(${contacts.email1Subject}, '') != ''`,
            sql`coalesce(${contacts.email1Body}, '') != ''`,
            sql`coalesce(${contacts.email2Subject}, '') != ''`,
            sql`coalesce(${contacts.email2Body}, '') != ''`,
            sql`coalesce(${contacts.email3Subject}, '') != ''`,
            sql`coalesce(${contacts.email3Body}, '') != ''`
          ))
          .limit(1),
      ])

      return {
        ...campaign,
        totalContacts: contactCount.count,
        sentEmails: sentCount.count,
        emailCoverage: [
          { step: 1, complete: Number(coverage?.email1Complete ?? 0), subjectOnly: Number(coverage?.email1SubjectOnly ?? 0), bodyOnly: Number(coverage?.email1BodyOnly ?? 0) },
          { step: 2, complete: Number(coverage?.email2Complete ?? 0), subjectOnly: Number(coverage?.email2SubjectOnly ?? 0), bodyOnly: Number(coverage?.email2BodyOnly ?? 0) },
          { step: 3, complete: Number(coverage?.email3Complete ?? 0), subjectOnly: Number(coverage?.email3SubjectOnly ?? 0), bodyOnly: Number(coverage?.email3BodyOnly ?? 0) },
        ],
        previewContact: previewContact ? {
          firstName: previewContact.firstName,
          lastName: previewContact.lastName,
          primaryEmail: previewContact.primaryEmail,
          companyName: previewContact.companyName,
          emails: formatCampaignPreviewBodies([
            { step: 1, subject: previewContact.email1Subject, body: previewContact.email1Body },
            { step: 2, subject: previewContact.email2Subject, body: previewContact.email2Body },
            { step: 3, subject: previewContact.email3Subject, body: previewContact.email3Body },
          ]),
        } : null,
        statusBreakdown: statusRows,
      }
    })
  )
}

async function getLocalFiles() {
  try {
    const entries = await readdir(CAMPAIGN_DIR, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export default async function CampaignsPage() {
  const [initialCampaigns, initialLocalFiles] = await Promise.all([getCampaigns(), getLocalFiles()])

  return (
    <CampaignsManager
      initialCampaigns={initialCampaigns}
      initialLocalFiles={initialLocalFiles}
    />
  )
}
