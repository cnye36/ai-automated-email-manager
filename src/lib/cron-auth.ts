import type { NextRequest } from 'next/server'

export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET
  if (!secret) return false

  const auth = req.headers.get('authorization')
  const internalSecret = req.headers.get('x-internal-secret')

  return auth === `Bearer ${secret}` || internalSecret === secret
}
