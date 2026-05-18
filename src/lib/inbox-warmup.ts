/** Prefer DB-stored warmup start (UI edits); fall back to config/inboxes.json. */
export function resolveWarmupStartDate(_inboxId: string, dbDate: string | null | undefined, configDate: string): string {
  return dbDate ?? configDate
}
