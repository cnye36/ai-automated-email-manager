/** Options for manual / dev send runs. Requires ALLOW_DEV_SEND_OVERRIDE=true on the server. */
export interface SendQueueOptions {
  dryRun?: boolean
  /** Bypass weekday/hour send window. */
  ignoreSendWindow?: boolean
  /** Ignore per-inbox warmup daily caps for this run. */
  ignoreDailyLimit?: boolean
  /** Only process these campaign IDs (must still be active in DB). */
  campaignIds?: number[]
  /** Set pending/active contacts in those campaigns to due immediately before queueing. */
  forceDueNow?: boolean
  /** Override batch size (default MAX_SENDS_PER_RUN). Dev defaults to 50. */
  maxSendsPerRun?: number
  /** Skip SMTP spacing between messages in one run. */
  skipDelays?: boolean
}

export function isDevSendOverrideAllowed(): boolean {
  return process.env.ALLOW_DEV_SEND_OVERRIDE === 'true'
}

export function parseSendQueueOptionsFromBody(body: Record<string, unknown>): SendQueueOptions | null {
  if (body.dev !== true && body.devMode !== true) return null
  if (!isDevSendOverrideAllowed()) {
    throw new Error('Dev send is disabled. Set ALLOW_DEV_SEND_OVERRIDE=true in the server environment.')
  }

  const campaignId = body.campaignId ?? body.campaignIds
  let campaignIds: number[] | undefined
  if (typeof campaignId === 'number') {
    campaignIds = [campaignId]
  } else if (Array.isArray(campaignId)) {
    campaignIds = campaignId.map((id) => Number(id)).filter((id) => Number.isFinite(id))
  } else if (typeof campaignId === 'string' && campaignId.trim()) {
    campaignIds = campaignId.split(',').map((s) => Number(s.trim())).filter((id) => Number.isFinite(id))
  }

  const envCampaign = process.env.DEV_SEND_CAMPAIGN_ID?.trim()
  if (!campaignIds?.length && envCampaign) {
    const id = Number(envCampaign)
    if (Number.isFinite(id)) campaignIds = [id]
  }

  return {
    dryRun: body.dryRun === true,
    ignoreSendWindow: body.ignoreSendWindow !== false,
    ignoreDailyLimit: body.ignoreDailyLimit !== false,
    forceDueNow: body.forceDueNow !== false,
    campaignIds,
    maxSendsPerRun:
      typeof body.maxSendsPerRun === 'number'
        ? Math.max(1, body.maxSendsPerRun)
        : Number(process.env.DEV_SEND_MAX_PER_RUN ?? 50) || 50,
    skipDelays: body.skipDelays === true || process.env.DEV_SEND_SKIP_DELAYS === 'true',
  }
}

export function getDefaultDevSendOptions(campaignId?: number): SendQueueOptions {
  if (!isDevSendOverrideAllowed()) {
    throw new Error('Dev send is disabled. Set ALLOW_DEV_SEND_OVERRIDE=true in the server environment.')
  }
  const envId = process.env.DEV_SEND_CAMPAIGN_ID?.trim()
  const id = campaignId ?? (envId ? Number(envId) : undefined)
  return {
    ignoreSendWindow: true,
    ignoreDailyLimit: true,
    forceDueNow: true,
    campaignIds: id != null && Number.isFinite(id) ? [id] : undefined,
    maxSendsPerRun: Number(process.env.DEV_SEND_MAX_PER_RUN ?? 50) || 50,
    skipDelays: process.env.DEV_SEND_SKIP_DELAYS === 'true',
  }
}
