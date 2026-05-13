import { differenceInDays, parseISO, startOfDay } from 'date-fns'

const WARMUP_SCHEDULE = [
  { maxDay: 7, limit: 5 },
  { maxDay: 14, limit: 10 },
  { maxDay: 21, limit: 20 },
  { maxDay: 28, limit: 35 },
  { maxDay: Infinity, limit: 50 },
]

export function getDailyLimit(warmupStartDate: string): number {
  const start = startOfDay(parseISO(warmupStartDate))
  const today = startOfDay(new Date())
  const daysActive = differenceInDays(today, start) + 1

  for (const tier of WARMUP_SCHEDULE) {
    if (daysActive <= tier.maxDay) return tier.limit
  }
  return 50
}

export function getWarmupDay(warmupStartDate: string): number {
  const start = startOfDay(parseISO(warmupStartDate))
  const today = startOfDay(new Date())
  return differenceInDays(today, start) + 1
}

export function getWarmupSchedule() {
  return WARMUP_SCHEDULE
}
