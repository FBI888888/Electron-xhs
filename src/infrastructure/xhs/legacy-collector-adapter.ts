import { createRequire } from 'node:module'
import { getPerformancePlan } from '@domain/performance-fields'
import type { CollectionSubtaskError } from '@shared/models'

interface LegacyResult {
  success: boolean
  message?: string
  data?: Record<string, unknown> | null
}

interface LegacyBloggerApi {
  getBloggerInfo(userId: string, cookies: string): Promise<LegacyResult>
  getDataSummary(userId: string, cookies: string): Promise<LegacyResult>
  getFansSummary(userId: string, cookies: string): Promise<LegacyResult>
  getFansProfile(userId: string, cookies: string): Promise<LegacyResult>
  getRecentBrands(userId: string, cookies: string): Promise<LegacyResult>
  getCoreDataCpuv(userId: string, cookies: string): Promise<LegacyResult>
  getNotesRate(userId: string, cookies: string): Promise<LegacyResult>
  getFansHistory(userId: string, cookies: string): Promise<LegacyResult>
}

interface LegacyPerformanceApi {
  getPerformanceData(userId: string, fields: string[], cookies: string): Promise<LegacyResult>
}

const require = createRequire(import.meta.url)
const bloggerApi = require('../../main/api.js') as LegacyBloggerApi
const performanceApi = require('../../main/performanceApi.js') as LegacyPerformanceApi

const classifyError = (source: string, message = '采集失败'): CollectionSubtaskError => {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('登录') ||
    normalized.includes('cookie')
  ) {
    return { source, code: 'AUTH_EXPIRED', message, retryable: false }
  }
  if (normalized.includes('406') || normalized.includes('不可用')) {
    return { source, code: 'UNAVAILABLE', message, retryable: false }
  }
  if (normalized.includes('频') || normalized.includes('429')) {
    return { source, code: 'RATE_LIMITED', message, retryable: true }
  }
  if (
    normalized.includes('http错误: 0') ||
    normalized.includes('超时') ||
    normalized.includes('网络') ||
    normalized.includes('请求失败')
  ) {
    return { source, code: 'NETWORK', message, retryable: true }
  }
  return { source, code: 'INVALID_RESPONSE', message, retryable: false }
}

export interface CollectedProfile {
  data: Record<string, unknown>
  errors: CollectionSubtaskError[]
}

export class LegacyCollectorAdapter {
  async collect(
    userId: string,
    cookies: string,
    performanceFieldIds: string[]
  ): Promise<CollectedProfile> {
    const base = await bloggerApi.getBloggerInfo(userId, cookies)
    if (!base.success || !base.data) {
      throw classifyError('blogger', base.message || '基础信息采集失败')
    }

    const labels = getPerformancePlan(performanceFieldIds).map((field) => field.label)
    const tasks: Array<[string, Promise<LegacyResult>]> = [
      ['summary', bloggerApi.getDataSummary(userId, cookies)],
      ['performance',
        labels.length > 0
          ? performanceApi.getPerformanceData(userId, labels, cookies)
          : Promise.resolve({ success: true, data: {} })],
      ['fans-summary', bloggerApi.getFansSummary(userId, cookies)],
      ['fans-profile', bloggerApi.getFansProfile(userId, cookies)],
      ['brands', bloggerApi.getRecentBrands(userId, cookies)],
      ['cpuv', bloggerApi.getCoreDataCpuv(userId, cookies)],
      ['notes-rate', bloggerApi.getNotesRate(userId, cookies)],
      ['fans-history', bloggerApi.getFansHistory(userId, cookies)]
    ]

    const settled = await Promise.allSettled(tasks.map(([, task]) => task))
    const data: Record<string, unknown> = { ...base.data }
    const errors: CollectionSubtaskError[] = []

    settled.forEach((entry, index) => {
      const source = tasks[index]?.[0] ?? 'unknown'
      if (entry.status === 'rejected') {
        errors.push(classifyError(source, entry.reason instanceof Error ? entry.reason.message : String(entry.reason)))
        return
      }
      if (!entry.value.success) {
        errors.push(classifyError(source, entry.value.message))
        return
      }
      if (entry.value.data) Object.assign(data, entry.value.data)
    })

    return { data, errors }
  }
}