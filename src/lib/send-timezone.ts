const DEFAULT_SEND_TIMEZONE = 'America/Los_Angeles'

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function getSendTimezone(): string {
  const configured = process.env.SEND_TIMEZONE?.trim()
  return configured || DEFAULT_SEND_TIMEZONE
}

export function getSendTimezoneLabel(timeZone = getSendTimezone()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
  } catch {
    return timeZone
  }
}

export interface ZonedClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  dayOfWeek: number
  dateStr: string
}

export function getZonedClock(date: Date, timeZone = getSendTimezone()): ZonedClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)
  let hour = Number(map.hour)
  if (hour === 24) hour = 0

  return {
    year,
    month,
    day,
    hour,
    minute: Number(map.minute),
    dayOfWeek: WEEKDAY_TO_INDEX[map.weekday ?? 'Sun'] ?? 0,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

export function todayInSendTimezone(date = new Date()): string {
  return getZonedClock(date).dateStr
}

/** Unix seconds at midnight in the send timezone for the given instant's calendar day. */
export function startOfTodayInSendTimezone(date = new Date()): number {
  const { year, month, day } = getZonedClock(date)
  return Math.floor(zonedLocalToUtc(year, month, day, 0, 0, 0).getTime() / 1000)
}

export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone = getSendTimezone(),
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second)

  for (let i = 0; i < 6; i++) {
    const z = getZonedClock(new Date(guess), timeZone)
    const targetDayKey = year * 10_000 + month * 100 + day
    const actualDayKey = z.year * 10_000 + z.month * 100 + z.day
    let diffMs = 0

    if (actualDayKey !== targetDayKey) {
      diffMs = (targetDayKey - actualDayKey) * 86_400_000
    } else {
      const targetMinutes = hour * 60 + minute
      const actualMinutes = z.hour * 60 + z.minute
      diffMs = (targetMinutes - actualMinutes) * 60_000 + (second - (i === 0 ? 0 : 0)) * 1000
    }

    if (diffMs === 0) break
    guess += diffMs
  }

  return new Date(guess)
}

export function addCalendarDays(year: number, month: number, day: number, days: number) {
  const dt = new Date(Date.UTC(year, month - 1, day + days))
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  }
}

/** Advance a zoned calendar date by N weekdays (Mon–Fri). Skips Sat/Sun. */
export function addBusinessDays(
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
    ;({ year: y, month: m, day: d } = addCalendarDays(y, m, d, 1))
    const probe = zonedLocalToUtc(y, m, d, 12, 0, 0)
    const dow = getZonedClock(probe).dayOfWeek
    if (dow !== 0 && dow !== 6) remaining--
  }

  return { year: y, month: m, day: d }
}

/** Unix seconds for the same local time on a date N business days after `from`. */
export function addBusinessDaysToDate(from: Date, businessDays: number, timeZone = getSendTimezone()): Date {
  const z = getZonedClock(from, timeZone)
  const target = addBusinessDays(z.year, z.month, z.day, businessDays)
  return zonedLocalToUtc(target.year, target.month, target.day, z.hour, z.minute, 0, timeZone)
}
