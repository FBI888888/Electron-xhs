import { describe, expect, it } from 'vitest'
import { migrateLegacyAccounts, migrateLegacySettings } from './migration'

describe('legacy migration', () => {
  it('maps legacy account fields and status', () => {
    const [account] = migrateLegacyAccounts([
      { remark: '主账号', nickName: '测试达人', cookies: 'a=1', status: '正常', today_use_count: 3 }
    ], new Date('2026-07-19T12:00:00.000Z'))
    expect(account?.nickname).toBe('测试达人')
    expect(account?.status).toBe('active')
    expect(account?.todayUseCount).toBe(3)
  })

  it('maps legacy collection settings', () => {
    const settings = migrateLegacySettings({
      local: { filename: 'snapshot.xlsx', path: 'D:/exports' },
      performance_fields: ['日常笔记-图文+视频-近30天-全流量'],
      max_count: 50,
      dual_thread: true,
      split_fans_profile: true
    })
    expect(settings.output.filename).toBe('snapshot.xlsx')
    expect(settings.concurrency).toBe(2)
    expect(settings.maxCount).toBe(50)
    expect(settings.performanceFields).toEqual(['daily.all.30d'])
  })

  it('preserves legacy concurrency up to ten workers', () => {
    expect(migrateLegacySettings({ concurrency: 8 }).concurrency).toBe(8)
    expect(migrateLegacySettings({ concurrency: 99 }).concurrency).toBe(10)
  })

  it('preserves an intentionally empty legacy field selection', () => {
    const settings = migrateLegacySettings({ performance_fields: [] })
    expect(settings.performanceFields).toEqual([])
  })
})