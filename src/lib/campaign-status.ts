export type StatusRow = { status: string | null; count: number }

export function countByStatus(rows: StatusRow[], status: string) {
  return rows.find((r) => r.status === status)?.count ?? 0
}

/** Contacts still in the outreach pipeline (not finished). */
export function getRemainingContactCount(rows: StatusRow[]) {
  return countByStatus(rows, 'pending') + countByStatus(rows, 'active')
}

/** Campaign is sending via cron while it has work left and is not paused. */
export function isCampaignLive(active: boolean | null, statusBreakdown: StatusRow[]) {
  return active !== false && getRemainingContactCount(statusBreakdown) > 0
}

export function getSendingLabel(active: boolean | null, statusBreakdown: StatusRow[]) {
  if (active === false) return 'Paused'
  if (getRemainingContactCount(statusBreakdown) === 0) return 'Complete'
  return 'Live'
}
