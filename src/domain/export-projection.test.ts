import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './migration'
import { getPerformanceExportHeaders, projectCollectionRows } from './export-projection'
import type { CollectionTaskState } from '@shared/models'

const state: CollectionTaskState = {
  id: 'task-1',
  status: 'completed',
  total: 1,
  completed: 1,
  succeeded: 1,
  failed: 0,
  targets: [
    {
      id: 'target-1',
      userId: 'abc123',
      pgyUrl: 'https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/abc123',
      xhsUrl: 'https://www.xiaohongshu.com/user/profile/abc123',
      nickname: '测试达人',
      healthLevel: 4,
      status: 'completed',
      statusText: '已完成',
      collectedAt: '2026-07-19T12:00:00.000Z',
      errors: [],
      snapshot: {
        schemaVersion: 1,
        userId: 'abc123',
        capturedAt: '2026-07-19T12:00:00.000Z',
        accountId: 'account-1',
        data: {
          name: '测试达人',
          fansCount: 12345,
          '粉丝画像-性别分布': '男10.00%，女90.00%',
          '数据表现-日常笔记-图文+视频-近30天-全流量-笔记数': 8
        }
      }
    }
  ]
}

describe('legacy-compatible export projection', () => {
  it('keeps performance column order and cooperation-only column', () => {
    expect(getPerformanceExportHeaders('日常笔记-图文+视频-近30天-全流量')).not.toContain(
      '数据表现-日常笔记-图文+视频-近30天-全流量-外溢进店中位数'
    )
    expect(getPerformanceExportHeaders('合作笔记-图文+视频-近30天-全流量')).toContain(
      '数据表现-合作笔记-图文+视频-近30天-全流量-外溢进店中位数'
    )
  })

  it('projects legacy headers and split fan profile columns', () => {
    const [row] = projectCollectionRows(state, {
      ...DEFAULT_SETTINGS,
      performanceFields: ['daily.all.30d'],
      splitFansProfile: true
    })
    expect(row?.['博主主页']).toBe(state.targets[0]?.pgyUrl)
    expect(row?.['粉丝数量（万）']).toBe('1.23w')
    expect(row?.['数据表现-日常笔记-图文+视频-近30天-全流量-笔记数']).toBe(8)
    expect(row?.['粉丝画像-性别分布-男']).toBe('10.00%')
    expect(row?.['粉丝画像-性别分布-女']).toBe('90.00%')
  })
})