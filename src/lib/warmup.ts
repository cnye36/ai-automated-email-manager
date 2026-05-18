import { parseISO } from 'date-fns'
import {
  addCalendarDays,
  getSendTimezone,
  getZonedClock,
  todayInSendTimezone,
  zonedLocalToUtc,
} from './send-timezone'

const WARMUP_SCHEDULE = [
  { maxDay: 7, limit: 5 },
  { maxDay: 14, limit: 10 },
  { maxDay: 21, limit: 20 },
  { maxDay: 28, limit: 35 },
  { maxDay: Infinity, limit: 50 },
]

function parseWarmupDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { year: y, month: m, day: d }
}

function dateKey(year: number, month: number, day: number) {
  return year * 10_000 + month * 100 + day
}

function isBusinessDay(year: number, month: number, day: number, timeZone = getSendTimezone()) {
  const dow = getZonedClock(zonedLocalToUtc(year, month, day, 12, 0, 0, timeZone), timeZone).dayOfWeek
  return dow !== 0 && dow !== 6
}

/** Business days from start (inclusive) through asOf in the send timezone. Weekends do not advance the counter. */
export function getWarmupDay(warmupStartDate: string, asOf = new Date()): number {
  const start = parseWarmupDate(warmupStartDate)
  const end = getZonedClock(asOf)
  let y = start.year
  let m = start.month
  let d = start.day
  const endKey = dateKey(end.year, end.month, end.day)
  let businessDays = 0

  while (dateKey(y, m, d) <= endKey) {
    if (isBusinessDay(y, m, d)) businessDays++
    if (dateKey(y, m, d) === endKey) break
    ;({ year: y, month: m, day: d } = addCalendarDays(y, m, d, 1))
  }

  return Math.max(1, businessDays)
}

export function getDailyLimit(warmupStartDate: string, asOf = new Date()): number {
  const daysActive = getWarmupDay(warmupStartDate, asOf)
  for (const tier of WARMUP_SCHEDULE) {
    if (daysActive <= tier.maxDay) return tier.limit
  }
  return 50
}

/** Walk back N business days on the calendar (send timezone). */
export function subtractBusinessDays(
  year: number,
  month: number,
  day: number,
  businessDays: number,
): { year: number; month: number; day: number } {
  let y = year
  let m = month
  let d = day
  let remaining = businessDays

  while (remaining > 0) {
    ;({ year: y, month: m, day: d } = addCalendarDays(y, m, d, -1))
    if (isBusinessDay(y, m, d)) remaining--
  }

  return { year: y, month: m, day: d }
}

/** Start date so that getWarmupDay() === targetDay on asOf (business-day counting). */
export function warmupStartDateForTargetDay(targetDay: number, asOf = new Date()): string {
  const day = Math.max(1, Math.floor(targetDay))
  const z = getZonedClock(asOf)
  if (day <= 1) return z.dateStr

  const back = subtractBusinessDays(z.year, z.month, z.day, day - 1)
  return `${back.year}-${String(back.month).padStart(2, '0')}-${String(back.day).padStart(2, '0')}`
}

/** Today in send timezone (day 1). */
export function warmupStartDateToday(): string {
  return todayInSendTimezone()
}

export function isValidWarmupStartDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = parseISO(value)
  return !Number.isNaN(parsed.getTime())
}

export function getWarmupSchedule() {
  return WARMUP_SCHEDULE
}
