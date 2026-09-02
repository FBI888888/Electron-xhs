import { describe, expect, it } from 'vitest'
import { getPerformancePlan, PERFORMANCE_FIELDS } from './performance-fields'

const LEGACY_PARAMS = {
  '日常笔记-图文+视频-近30天-全流量': { business: 0, noteType: 3, dateType: 1, advertiseSwitch: 1 },
  '日常笔记-图文-近30天-全流量': { business: 0, noteType: 1, dateType: 1, advertiseSwitch: 1 },
  '日常笔记-视频-近30天-全流量': { business: 0, noteType: 2, dateType: 1, advertiseSwitch: 1 },
  '日常笔记-图文+视频-近90天-全流量': { business: 0, noteType: 3, dateType: 2, advertiseSwitch: 1 },
  '日常笔记-图文-近90天-全流量': { business: 0, noteType: 1, dateType: 2, advertiseSwitch: 1 },
  '日常笔记-视频-近90天-全流量': { business: 0, noteType: 2, dateType: 2, advertiseSwitch: 1 },
  '合作笔记-图文+视频-近30天-全流量': { business: 1, noteType: 3, dateType: 1, advertiseSwitch: 1 },
  '合作笔记-图文-近30天-全流量': { business: 1, noteType: 1, dateType: 1, advertiseSwitch: 1 },
  '合作笔记-视频-近30天-全流量': { business: 1, noteType: 2, dateType: 1, advertiseSwitch: 1 },
  '合作笔记-图文+视频-近90天-全流量': { business: 1, noteType: 3, dateType: 2, advertiseSwitch: 1 },
  '合作笔记-图文-近90天-全流量': { business: 1, noteType: 1, dateType: 2, advertiseSwitch: 1 },
  '合作笔记-视频-近90天-全流量': { business: 1, noteType: 2, dateType: 2, advertiseSwitch: 1 }
} as const

describe('performance field DSL', () => {
  it('defines all business/note/date combinations', () => {
    expect(PERFORMANCE_FIELDS).toHaveLength(12)
    expect(new Set(PERFORMANCE_FIELDS.map((field) => field.id)).size).toBe(12)
  })

  it('accepts both stable ids and legacy labels', () => {
    const field = PERFORMANCE_FIELDS[0]
    expect(field).toBeDefined()
    expect(getPerformancePlan([field!.id])).toEqual([field])
    expect(getPerformancePlan([field!.label])).toEqual([field])
  })

  it('keeps every legacy label and request parameter unchanged', () => {
    expect(Object.keys(LEGACY_PARAMS)).toEqual(PERFORMANCE_FIELDS.map((field) => field.label))
    PERFORMANCE_FIELDS.forEach((field) => {
      expect(field.params).toEqual(LEGACY_PARAMS[field.label as keyof typeof LEGACY_PARAMS])
    })
  })
})