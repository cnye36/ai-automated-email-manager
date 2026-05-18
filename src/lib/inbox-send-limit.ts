import { getDailyLimit } from './warmup'

/** User cap for sends per inbox per day. Null = use full warmup maximum. */
export function getEffectiveDailyLimit(
  warmupStartDate: string,
  dailySendTarget: number | null | undefined,
): number {
  const warmupMax = getDailyLimit(warmupStartDate)
  if (dailySendTarget == null) return warmupMax
  return Math.min(warmupMax, Math.max(1, Math.floor(dailySendTarget)))
}

export function isValidDailySendTarget(value: unknown, warmupMax: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const n = Math.floor(value)
  return n >= 1 && n <= warmupMax
}
