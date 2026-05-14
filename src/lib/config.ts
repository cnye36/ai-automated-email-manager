import fs from 'fs'
import path from 'path'

export interface InboxConfig {
  id: string
  address: string
  smtpHost: string
  smtpPort: number
  username: string
  password: string
  imapHost: string
  imapPort: number
  warmupStartDate: string
  active: boolean
}

let _cache: InboxConfig[] | null = null

export function getInboxConfigs(): InboxConfig[] {
  if (_cache) return _cache

  if (process.env.INBOXES_JSON) {
    _cache = JSON.parse(process.env.INBOXES_JSON) as InboxConfig[]
    return _cache
  }

  const configPath = process.env.INBOXES_CONFIG_PATH
    ? path.resolve(process.env.INBOXES_CONFIG_PATH)
    : path.join(process.cwd(), 'config', 'inboxes.json')
  const raw = fs.readFileSync(configPath, 'utf-8')
  _cache = JSON.parse(raw) as InboxConfig[]
  return _cache
}

export function getInboxConfig(id: string): InboxConfig | undefined {
  return getInboxConfigs().find((i) => i.id === id)
}

export function getActiveInboxConfigs(): InboxConfig[] {
  return getInboxConfigs().filter((i) => i.active)
}

// Call this after editing inboxes.json to reload
export function reloadInboxConfigs() {
  _cache = null
}
