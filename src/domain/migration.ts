import type { Account, CollectionConcurrency, CollectionSettings } from '@shared/models'
import { PERFORMANCE_FIELDS } from './performance-fields'

export const DEFAULT_SETTINGS: CollectionSettings = {
  schemaVersion: 1,
  output: {
    filename: 'collected_data.xlsx',
    directory: ''
  },
  performanceFields: PERFORMANCE_FIELDS.map((field) => field.id),
  maxCount: 9999,
  concurrency: 2,
  throttleMs: 500,
  splitFansProfile: false
}

const legacyStatus = (value: unknown): Account['status'] => {
  if (value === '正常') return 'active'
  if (value === '失效') return 'expired'
  if (value === '检查中') return 'checking'
  return 'unchecked'
}

export const migrateLegacyAccounts = (value: unknown, now = new Date()): Account[] => {
  if (!Array.isArray(value)) return []
  const timestamp = now.toISOString()

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `legacy-account-${index + 1}`,
      remark: typeof item.remark === 'string' ? item.remark : '',
      nickname:
        typeof item.nickname === 'string'
          ? item.nickname
          : typeof item.nickName === 'string'
            ? item.nickName
            : '',
      cookies: typeof item.cookies === 'string' ? item.cookies : '',
      status:
        typeof item.status === 'string' &&
        ['unchecked', 'checking', 'active', 'expired', 'error'].includes(item.status)
          ? (item.status as Account['status'])
          : legacyStatus(item.status),
      email: typeof item.email === 'string' ? item.email : undefined,
      password: typeof item.password === 'string' ? item.password : undefined,
      lastUseDate:
        typeof item.lastUseDate === 'string'
          ? item.lastUseDate
          : typeof item.last_use_date === 'string'
            ? item.last_use_date
            : undefined,
      todayUseCount:
        typeof item.todayUseCount === 'number'
          ? item.todayUseCount
          : typeof item.today_use_count === 'number'
            ? item.today_use_count
            : 0,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : timestamp,
      updatedAt: timestamp
    }))
}

const legacyConcurrency = (input: Record<string, any>): CollectionConcurrency => {
  const configured = Number(input.concurrency)
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.max(1, Math.min(10, Math.trunc(configured))) as CollectionConcurrency
  }
  return input.dual_thread === true ? 2 : 1
}

export const migrateLegacySettings = (value: unknown): CollectionSettings => {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS
  const input = value as Record<string, any>
  if (input.schemaVersion === 1 && input.output) return input as CollectionSettings

  const legacyFields = Array.isArray(input.performance_fields) ? input.performance_fields : null
  const selected = PERFORMANCE_FIELDS.filter((field) =>
    legacyFields?.some((legacy: unknown) => legacy === field.id || legacy === field.label)
  ).map((field) => field.id)

  return {
    ...DEFAULT_SETTINGS,
    output: {
      filename: input.local?.filename || DEFAULT_SETTINGS.output.filename,
      directory: input.local?.path || ''
    },
    performanceFields: legacyFields === null ? DEFAULT_SETTINGS.performanceFields : selected,
    maxCount: Number(input.max_count) > 0 ? Number(input.max_count) : DEFAULT_SETTINGS.maxCount,
    concurrency: legacyConcurrency(input),
    throttleMs:
      Number(input.throttle_ms) >= 0 ? Number(input.throttle_ms) : DEFAULT_SETTINGS.throttleMs,
    splitFansProfile: input.split_fans_profile === true
  }
}