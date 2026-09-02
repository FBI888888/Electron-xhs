export type BusinessType = 'daily' | 'cooperation'
export type NoteType = 'all' | 'picture' | 'video'
export type DateRange = '30d' | '90d'

export interface PerformanceFieldDefinition {
  id: string
  label: string
  business: BusinessType
  noteType: NoteType
  dateRange: DateRange
  params: {
    business: 0 | 1
    noteType: 1 | 2 | 3
    dateType: 1 | 2
    advertiseSwitch: 1
  }
}

const noteTypeParam = { all: 3, picture: 1, video: 2 } as const
const dateTypeParam = { '30d': 1, '90d': 2 } as const

const labelPart = {
  business: { daily: '日常笔记', cooperation: '合作笔记' },
  noteType: { all: '图文+视频', picture: '图文', video: '视频' },
  dateRange: { '30d': '近30天', '90d': '近90天' }
} as const

const defineField = (
  business: BusinessType,
  noteType: NoteType,
  dateRange: DateRange
): PerformanceFieldDefinition => ({
  id: `${business}.${noteType}.${dateRange}`,
  label: `${labelPart.business[business]}-${labelPart.noteType[noteType]}-${labelPart.dateRange[dateRange]}-全流量`,
  business,
  noteType,
  dateRange,
  params: {
    business: business === 'daily' ? 0 : 1,
    noteType: noteTypeParam[noteType],
    dateType: dateTypeParam[dateRange],
    advertiseSwitch: 1
  }
})

export const PERFORMANCE_FIELDS = (['daily', 'cooperation'] as const).flatMap((business) =>
  (['30d', '90d'] as const).flatMap((dateRange) =>
    (['all', 'picture', 'video'] as const).map((noteType) =>
      defineField(business, noteType, dateRange)
    )
  )
)

export const getPerformancePlan = (selectedIds: string[]): PerformanceFieldDefinition[] => {
  const selected = new Set(selectedIds)
  return PERFORMANCE_FIELDS.filter((field) => selected.has(field.id) || selected.has(field.label))
}