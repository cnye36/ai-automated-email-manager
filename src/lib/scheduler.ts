import { db } from './db/client'
import { campaigns, contacts, sentEmails, inboxes, campaignInboxes } from './db/schema'
import { eq, lte, and, sql, inArray } from 'drizzle-orm'
import { sendEmail, randomDelay } from './mailer'
import { ensureEmailBodyHtmlForSend } from './email-body'
import { getEffectiveDailyLimit } from './inbox-send-limit'
import { prioritizeDueContacts } from './send-queue-priority'
import { getInboxConfigs } from './config'
import type { InboxConfig } from './config'
import { v4 as uuidv4 } from 'uuid'
import {
  addBusinessDaysToDate,
  addCalendarDays,
  getSendTimezoneLabel,
  getZonedClock,
  todayInSendTimezone,
  zonedLocalToUtc,
} from './send-timezone'
import type { SendQueueOptions } from './send-options'

/** Business days between sequence steps (Mon–Fri only; weekends are skipped). */
const SEQUENCE_DELAY_BUSINESS_DAYS = 3
const SEND_WINDOW_START_HOUR = Number(process.env.SEND_WINDOW_START_HOUR ?? 8)
const SEND_WINDOW_END_HOUR = Number(process.env.SEND_WINDOW_END_HOUR ?? 18)
const SEND_WEEKDAYS_ONLY = process.env.SEND_WEEKDAYS_ONLY !== 'false'
/** Max emails per serverless invocation (avoids Vercel timeout). Cron runs hourly to finish the daily budget. */
const MAX_SENDS_PER_RUN = Math.max(1, Number(process.env.MAX_SENDS_PER_RUN ?? 10))

export interface SendRunResult {
  sent: number
  failed: number
  skipped: number
  blockedReason?: string
  /** True when more sends were queued but deferred to the next run. */
  truncated?: boolean
  queuedThisRun?: number
  maxSendsPerRun?: number
  devMode?: boolean
  campaignIds?: number[]
  details: Array<{ contactId: number; inboxId: string; step: number; success: boolean; error?: string }>
}

export function isAllowedSendTime(date: Date): boolean {
  const { hour, dayOfWeek } = getZonedClock(date)
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (SEND_WEEKDAYS_ONLY && isWeekend) return false
  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR
}

function nextAllowedSendAt(date: Date): number {
  if (isAllowedSendTime(date)) {
    return Math.floor(date.getTime() / 1000)
  }

  const randomMinute = Math.floor(Math.random() * 45)
  const randomSecond = Math.floor(Math.random() * 60)
  let { year, month, day, hour, dayOfWeek } = getZonedClock(date)

  while (true) {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    if (SEND_WEEKDAYS_ONLY && isWeekend) {
      const add = dayOfWeek === 6 ? 2 : 1
      ;({ year, month, day } = addCalendarDays(year, month, day, add))
      dayOfWeek = 1
      hour = SEND_WINDOW_START_HOUR
      continue
    }

    if (hour < SEND_WINDOW_START_HOUR) {
      return Math.floor(
        zonedLocalToUtc(year, month, day, SEND_WINDOW_START_HOUR, randomMinute, randomSecond).getTime() / 1000,
      )
    }

    if (hour >= SEND_WINDOW_END_HOUR) {
      ;({ year, month, day } = addCalendarDays(year, month, day, 1))
      dayOfWeek = (dayOfWeek + 1) % 7
      hour = SEND_WINDOW_START_HOUR
      continue
    }

    return Math.floor(zonedLocalToUtc(year, month, day, hour, randomMinute, randomSecond).getTime() / 1000)
  }
}

export function getSendWindowSummary() {
  return {
    startHour: SEND_WINDOW_START_HOUR,
    endHour: SEND_WINDOW_END_HOUR,
    weekdaysOnly: SEND_WEEKDAYS_ONLY,
    sequenceDelayBusinessDays: SEQUENCE_DELAY_BUSINESS_DAYS,
    timezoneLabel: getSendTimezoneLabel(),
  }
}

/** Next send time after a sequence step: N business days later, snapped to the send window. */
export function nextSequenceSendAt(fromDate: Date): number {
  const afterDelay = addBusinessDaysToDate(fromDate, SEQUENCE_DELAY_BUSINESS_DAYS)
  return nextAllowedSendAt(afterDelay)
}

/**
 * Contacts that were due but not sent (budget/window limits) keep a past nextSendDate and
 * are picked up on the next run. Contacts stuck with a future nextSendDate from old
 * calendar-day math are moved forward when their business-day wait has elapsed.
 */
async function resyncActiveContactSchedules(activeCampaignIds: number[], nowDate: Date) {
  if (activeCampaignIds.length === 0) return

  const now = Math.floor(nowDate.getTime() / 1000)
  const nextSlot = nextAllowedSendAt(nowDate)

  // Overdue: due now or earlier → snap to the next allowed send window
  await db
    .update(contacts)
    .set({ nextSendDate: nextSlot, updatedAt: now })
    .where(and(
      eq(contacts.status, 'active'),
      inArray(contacts.campaignId, activeCampaignIds),
      lte(contacts.nextSendDate, now),
    ))

  // Stuck in the future: last send was long enough ago (business days) but nextSendDate not reached
  const stuck = await db
    .select({
      id: contacts.id,
      nextSendDate: contacts.nextSendDate,
      lastSentAt: sql<number>`max(${sentEmails.sentAt})`.as('last_sent_at'),
    })
    .from(contacts)
    .innerJoin(sentEmails, eq(sentEmails.contactId, contacts.id))
    .where(and(
      eq(contacts.status, 'active'),
      inArray(contacts.campaignId, activeCampaignIds),
      sql`${contacts.nextSendDate} > ${now}`,
      sql`${contacts.sequenceStep} >= 1`,
    ))
    .groupBy(contacts.id, contacts.nextSendDate)

  for (const row of stuck) {
    if (!row.lastSentAt) continue
    const dueAt = nextSequenceSendAt(new Date(row.lastSentAt * 1000))
    if (dueAt <= now) {
      await db
        .update(contacts)
        .set({ nextSendDate: nextSlot, updatedAt: now })
        .where(eq(contacts.id, row.id))
    }
  }
}

async function resetDailyCountsIfNeeded() {
  const today = todayInSendTimezone()
  await db
    .update(inboxes)
    .set({ sentToday: 0, lastSentDate: today })
    .where(sql`last_sent_date != ${today} OR last_sent_date IS NULL`)
}

async function syncInboxesFromConfig() {
  const configs = getInboxConfigs()
  for (const config of configs) {
    await db
      .insert(inboxes)
      .values({
        id: config.id,
        address: config.address,
        warmupStartDate: config.warmupStartDate,
        active: config.active,
      })
      .onConflictDoUpdate({
        target: inboxes.id,
        set: {
          address: config.address,
        },
      })
  }
}

async function getActiveInboxRuntimeConfigs(): Promise<InboxConfig[]> {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes)
  const rowMap = new Map(rows.map((row) => [row.id, row]))

  return configs.filter((config) => rowMap.get(config.id)?.active ?? config.active)
}

async function getActiveCampaignIds(onlyIds?: number[]): Promise<number[]> {
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
  let ids = rows.map((row) => row.id)
  if (onlyIds?.length) {
    const allowed = new Set(onlyIds)
    ids = ids.filter((id) => allowed.has(id))
  }
  return ids
}

/** Make test-campaign contacts sendable immediately (dev only). */
async function forceCampaignContactsDue(campaignIds: number[], now: number) {
  if (campaignIds.length === 0) return
  await db
    .update(contacts)
    .set({ nextSendDate: now, updatedAt: now })
    .where(and(
      inArray(contacts.campaignId, campaignIds),
      inArray(contacts.status, ['pending', 'active']),
    ))
}

/** Returns the inbox IDs assigned to a campaign, or null if no specific assignment (use all). */
async function getCampaignAssignedInboxIds(campaignId: number): Promise<string[] | null> {
  const rows = await db
    .select({ inboxId: campaignInboxes.inboxId })
    .from(campaignInboxes)
    .where(eq(campaignInboxes.campaignId, campaignId))
  return rows.length > 0 ? rows.map((r) => r.inboxId) : null
}

export async function buildAndRunSendQueue(
  dryRun = false,
  options?: SendQueueOptions,
): Promise<SendRunResult> {
  await syncInboxesFromConfig()
  await resetDailyCountsIfNeeded()

  const configs = await getActiveInboxRuntimeConfigs()
  const devMode = Boolean(
    options?.ignoreSendWindow || options?.ignoreDailyLimit || options?.campaignIds?.length,
  )
  const result: SendRunResult = {
    sent: 0,
    failed: 0,
    skipped: 0,
    details: [],
    devMode: devMode || undefined,
    campaignIds: options?.campaignIds,
  }
  const nowDate = new Date()
  const now = Math.floor(nowDate.getTime() / 1000)
  const today = todayInSendTimezone()
  const tzLabel = getSendTimezoneLabel()
  const maxSendsThisRun = options?.maxSendsPerRun ?? MAX_SENDS_PER_RUN

  if (!options?.ignoreSendWindow && !isAllowedSendTime(nowDate)) {
    result.blockedReason = `Outside send window (${SEND_WINDOW_START_HOUR}:00-${SEND_WINDOW_END_HOUR}:00 ${tzLabel}${SEND_WEEKDAYS_ONLY ? ', Monday-Friday' : ''})`
    return result
  }

  const activeCampaignIds = await getActiveCampaignIds(options?.campaignIds)
  if (options?.campaignIds?.length && activeCampaignIds.length === 0) {
    result.blockedReason = `No active campaigns match dev filter: ${options.campaignIds.join(', ')}`
    return result
  }

  if (options?.forceDueNow && activeCampaignIds.length > 0) {
    await forceCampaignContactsDue(activeCampaignIds, now)
  } else {
    await resyncActiveContactSchedules(activeCampaignIds, nowDate)
  }

  // Build per-inbox budget
  const budgets = new Map<string, number>()
  for (const config of configs) {
    const [row] = await db.select().from(inboxes).where(eq(inboxes.id, config.id))
    const warmupStart = row?.warmupStartDate ?? config.warmupStartDate
    const limit = getEffectiveDailyLimit(warmupStart, row?.dailySendTarget)
    const sentSoFar = row?.sentToday ?? 0
    const remaining = options?.ignoreDailyLimit
      ? 9999
      : Math.max(0, limit - sentSoFar)
    if (remaining > 0) budgets.set(config.id, remaining)
  }

  const totalBudget = Array.from(budgets.values()).reduce((a, b) => a + b, 0)
  if (totalBudget === 0) {
    console.log('All inboxes at daily limit.')
    return result
  }

  // 1. Activate pending contacts that haven't started yet (assign to inbox)
  const inboxIds = configs.map((c) => c.id)
  const pendingContacts =
    activeCampaignIds.length === 0
      ? []
      : await db
          .select()
          .from(contacts)
          .where(and(
            eq(contacts.status, 'pending'),
            inArray(contacts.campaignId, activeCampaignIds),
          ))
          .limit(totalBudget)

  // Round-robin assign — respects per-campaign inbox restrictions
  // Build a per-campaign queue so each campaign cycles through its own assigned inboxes
  const campaignInboxQueues = new Map<number, string[]>()
  for (const contact of pendingContacts) {
    const cid = contact.campaignId!
    if (!campaignInboxQueues.has(cid)) {
      const assigned = await getCampaignAssignedInboxIds(cid)
      // Filter to only active inboxes with remaining budget
      const eligible = (assigned ?? inboxIds).filter((id) => (budgets.get(id) ?? 0) > 0)
      campaignInboxQueues.set(cid, eligible.length > 0 ? [...eligible] : [...inboxIds])
    }

    const queue = campaignInboxQueues.get(cid)!
    if (queue.length === 0) continue
    const inboxId = queue[0]
    queue.push(queue.shift()!)
    const activateAt = options?.ignoreSendWindow ? now : nextAllowedSendAt(nowDate)
    await db
      .update(contacts)
      .set({ status: 'active', assignedInboxId: inboxId, nextSendDate: activateAt, updatedAt: now })
      .where(eq(contacts.id, contact.id))
  }

  // 2. Get contacts due to send (active, nextSendDate <= now, campaign not paused)
  const due =
    activeCampaignIds.length === 0
      ? []
      : await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.status, 'active'),
              lte(contacts.nextSendDate, now),
              inArray(contacts.campaignId, activeCampaignIds),
            ),
          )

  // Group by assigned inbox
  const byInbox = new Map<string, typeof due>()
  for (const contact of due) {
    const id = contact.assignedInboxId || inboxIds[0]
    if (!byInbox.has(id)) byInbox.set(id, [])
    byInbox.get(id)!.push(contact)
  }

  // Per-inbox capped lists (follow-ups first, then new leads), then round-robin across inboxes.
  const perInboxQueues = new Map<string, typeof due>()
  for (const inboxId of inboxIds) {
    const contactList = prioritizeDueContacts(byInbox.get(inboxId) ?? [])
    const budget = budgets.get(inboxId) || 0
    const slice = contactList.slice(0, budget)
    if (slice.length > 0) {
      perInboxQueues.set(inboxId, [...slice])
    }
  }

  const sendQueue: Array<{ inboxId: string; contact: (typeof due)[0] }> = []
  while (true) {
    let progressed = false
    for (const inboxId of inboxIds) {
      const q = perInboxQueues.get(inboxId)
      if (!q?.length) continue
      sendQueue.push({ inboxId, contact: q.shift()! })
      progressed = true
    }
    if (!progressed) break
  }

  // 3. Send (interleaved across inboxes; delay between each step in the merged queue)
  const batch = sendQueue.slice(0, maxSendsThisRun)
  result.queuedThisRun = sendQueue.length
  result.maxSendsPerRun = maxSendsThisRun
  result.truncated = sendQueue.length > batch.length

  for (let i = 0; i < batch.length; i++) {
    const { inboxId, contact } = batch[i]!
    const step = (contact.sequenceStep ?? 0) + 1

    let subject: string | null = null
    let body: string | null = null

    if (step === 1) { subject = contact.email1Subject; body = contact.email1Body }
    else if (step === 2) { subject = contact.email2Subject; body = contact.email2Body }
    else if (step === 3) { subject = contact.email3Subject; body = contact.email3Body }

    if (!subject || !body || !contact.primaryEmail) {
      result.skipped++
    } else {
      const trackingPixelId = uuidv4()

      if (!dryRun) {
        const htmlBody = await ensureEmailBodyHtmlForSend(body)

        const sendResult = await sendEmail({
          inboxId,
          to: contact.primaryEmail,
          subject,
          html: htmlBody,
          trackingPixelId,
        })

        const sentNow = Math.floor(Date.now() / 1000)
        const nextSendDate = step < 3
          ? nextSequenceSendAt(new Date(sentNow * 1000))
          : null

        await db.insert(sentEmails).values({
          contactId: contact.id,
          inboxId,
          campaignId: contact.campaignId,
          sequenceStep: step,
          subject,
          messageId: sendResult.messageId,
          trackingPixelId,
          sentAt: sentNow,
          error: sendResult.error,
        })

        const newStatus = !sendResult.success
          ? 'error'
          : step >= 3
          ? 'complete'
          : 'active'

        await db
          .update(contacts)
          .set({
            sequenceStep: step,
            status: newStatus,
            nextSendDate,
            updatedAt: sentNow,
          })
          .where(eq(contacts.id, contact.id))

        if (sendResult.success) {
          await db
            .update(inboxes)
            .set({
              sentToday: sql`sent_today + 1`,
              totalSent: sql`total_sent + 1`,
              lastSentDate: today,
            })
            .where(eq(inboxes.id, inboxId))

          result.sent++
        } else {
          result.failed++
        }

        result.details.push({
          contactId: contact.id,
          inboxId,
          step,
          success: sendResult.success,
          error: sendResult.error,
        })
      } else {
        result.sent++
        result.details.push({ contactId: contact.id, inboxId, step, success: true })
      }
    }

    if (!dryRun && !options?.skipDelays && i < batch.length - 1) {
      await randomDelay()
    }
  }

  return result
}
