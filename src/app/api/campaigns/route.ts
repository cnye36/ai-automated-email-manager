import { NextRequest, NextResponse } from 'next/server'
import { formatCampaignPreviewBodies } from '@/lib/email-body'
import { db } from '@/lib/db/client'
import { campaigns, contacts, replyEvents, sentEmails, campaignInboxes } from '@/lib/db/schema'
import { getRemainingContactCount, getSendingLabel, isCampaignLive } from '@/lib/campaign-status'
import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.importedAt))

  const enriched = await Promise.all(
    rows.map(async (campaign) => {
      const [[contactCount], [sentCount], [openCount], [replyCount], [bounceCount], statusRows, [coverage], [previewContact], assignedInboxRows] = await Promise.all([
        db.select({ count: count() }).from(contacts).where(eq(contacts.campaignId, campaign.id)),
        db.select({ count: count() }).from(sentEmails).where(eq(sentEmails.campaignId, campaign.id)),
        db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.campaignId, campaign.id), isNotNull(sentEmails.openedAt))),
        db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.campaignId, campaign.id), isNotNull(sentEmails.repliedAt))),
        db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.campaignId, campaign.id), isNotNull(sentEmails.bouncedAt))),
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
        db.select({ inboxId: campaignInboxes.inboxId }).from(campaignInboxes).where(eq(campaignInboxes.campaignId, campaign.id)),
      ])

      const totalSent = sentCount.count
      return {
        ...campaign,
        totalContacts: contactCount.count,
        sentEmails: totalSent,
        openCount: openCount.count,
        replyCount: replyCount.count,
        bounceCount: bounceCount.count,
        openRate: totalSent > 0 ? ((openCount.count / totalSent) * 100).toFixed(1) : '0.0',
        replyRate: totalSent > 0 ? ((replyCount.count / totalSent) * 100).toFixed(1) : '0.0',
        bounceRate: totalSent > 0 ? ((bounceCount.count / totalSent) * 100).toFixed(1) : '0.0',
        assignedInboxIds: assignedInboxRows.map((r) => r.inboxId),
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
        remainingContacts: getRemainingContactCount(statusRows),
        isLive: isCampaignLive(campaign.active, statusRows),
        sendingLabel: getSendingLabel(campaign.active, statusRows),
      }
    })
  )

  return NextResponse.json(enriched)
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const campaignId = Number(body.campaignId)
    const active = body.active

    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return NextResponse.json({ error: 'Invalid campaignId' }, { status: 400 })
    }
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }

    const [updated] = await db
      .update(campaigns)
      .set({ active })
      .where(eq(campaigns.id, campaignId))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Update campaign error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')

    if (campaignId) {
      const id = Number(campaignId)
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'Invalid campaignId' }, { status: 400 })
      }

      await db.delete(replyEvents).where(eq(replyEvents.campaignId, id))
      await db.delete(sentEmails).where(eq(sentEmails.campaignId, id))
      await db.delete(contacts).where(eq(contacts.campaignId, id))
      await db.delete(campaigns).where(eq(campaigns.id, id))

      return NextResponse.json({ ok: true })
    }

    await db.delete(replyEvents)
    await db.delete(sentEmails)
    await db.delete(contacts)
    await db.delete(campaigns)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete campaigns error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
