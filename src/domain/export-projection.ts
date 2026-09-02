import type { CollectionSettings, CollectionTaskState } from '@shared/models'
import { getPerformancePlan } from './performance-fields'

const BASE_HEADERS = [
  '博主主页',
  '达人 ID',
  '蒲公英主页',
  '小红书主页',
  '昵称',
  '健康等级',
  '性别',
  '小红书号',
  '地理位置',
  '粉丝数量',
  '粉丝数量（万）',
  '获赞与收藏',
  '获赞与收藏（万）',
  '个人标签',
  '近期合作品牌',
  '合作报价-图文笔记',
  '合作报价-视频笔记',
  '合作报价-最低报价',
  '签约机构',
  '内容标签',
  '合作行业',
  '发布笔记',
  '内容类目',
  '数据更新时间',
  '数据概览-笔记数据-日常笔记-曝光中位数',
  '数据概览-笔记数据-日常笔记-阅读中位数',
  '数据概览-笔记数据-日常笔记-互动中位数',
  '数据概览-笔记数据-日常笔记-曝光中位数-同行对比',
  '数据概览-笔记数据-日常笔记-阅读中位数-同行对比',
  '数据概览-笔记数据-日常笔记-互动中位数-同行对比',
  '数据概览-笔记数据-合作笔记-曝光中位数',
  '数据概览-合作笔记-阅读中位数',
  '数据概览-笔记数据-合作笔记-互动中位数',
  '数据概览-笔记数据-预估CPM(图文)',
  '数据概览-笔记数据-预估CPM(视频)',
  '数据概览-笔记数据-预估CPM(图文)-同行对比',
  '数据概览-笔记数据-预估CPM(视频)-同行对比',
  '数据概览-笔记数据-预估阅读单价(图文)',
  '数据概览-笔记数据-预估阅读单价(视频)',
  '数据概览-笔记数据-预估阅读单价(图文)-同行对比',
  '数据概览-笔记数据-预估阅读单价(视频)-同行对比',
  '数据概览-笔记数据-预估互动单价(图文)',
  '数据概览-笔记数据-预估互动单价(视频)',
  '数据概览-笔记数据-预估外溢进店单价(图文)',
  '数据概览-笔记数据-预估外溢进店单价(视频)',
  '笔记数据-合作笔记-图文+视频-近30天-全流量-外溢进店单价',
  '笔记数据-合作笔记-图文+视频-近90天-全流量-外溢进店单价',
  '近7天活跃天数',
  '邀约48小时回复率',
  '粉丝量变化幅度',
  '头像',
  '博主优势',
  '特色标签',
  '商业笔记数',
  '下一健康等级',
  '近30天涨粉数',
  '近30天涨粉率',
  '预估阅读UV下限',
  '预估阅读UV上限',
  '预估人群覆盖率下限',
  '预估人群覆盖率上限',
  '近90天商家实收',
  '48小时邀约回复率',
  '近30天合作曝光中位数',
  '近30天预估CPUV',
  '近30天合作笔记数',
  '近30天直播场次',
  '近90天平均GMV',
  '场均观看人数',
  '服装行业图文报价',
  '服装行业视频报价',
  '买手权限',
  '优质达人',
  '图文阅读中位数',
  '图文互动中位数',
  '视频阅读中位数',
  '视频互动中位数',
  '合作行业名称',
  '邀约次数',
  '图文案例数',
  '视频案例数',
  '是否易合作',
  '百赞笔记占比',
  '千赞笔记占比',
  '视频完播率',
  '图文3秒阅读率',
  '点赞中位数',
  '收藏中位数',
  '评论中位数',
  '分享中位数',
  '曝光来源-发现页',
  '曝光来源-搜索',
  '曝光来源-关注',
  '近90天百赞笔记占比',
  '近90天千赞笔记占比',
  '近90天视频完播率',
  '近90天图文3秒阅读率',
  '近90天点赞中位数',
  '近90天收藏中位数',
  '近90天评论中位数',
  '近90天分享中位数',
  '近90天曝光来源-发现页',
  '近90天曝光来源-搜索',
  '近90天曝光来源-关注',
  '近30日粉丝增量',
  '近30日粉丝增量幅度',
  '近60日粉丝增量',
  '近60日粉丝增量幅度'
] as const

const FANS_METRIC_HEADERS = [
  '粉丝指标-粉丝增量',
  '粉丝指标-粉丝量变化幅度',
  '粉丝指标-活跃粉丝占比',
  '粉丝指标-阅读粉丝占比',
  '粉丝指标-互动粉丝占比',
  '粉丝指标-下单粉丝占比',
  '粉丝指标-涨粉优于同行',
  '粉丝指标-活跃粉丝数',
  '粉丝指标-活跃优于同行',
  '粉丝指标-互动粉丝数',
  '粉丝指标-互动优于同行',
  '粉丝指标-阅读粉丝数',
  '粉丝指标-阅读优于同行',
  '粉丝指标-下单粉丝数'
] as const

const FANS_PROFILE_HEADERS = [
  '粉丝画像-性别分布',
  '粉丝画像-年龄分布',
  '粉丝画像-地域分布-按省份',
  '粉丝画像-地域分布-按城市',
  '粉丝画像-用户设备分布',
  '粉丝画像-用户兴趣'
] as const

const valueOrBlank = (value: unknown): unknown => value || ''

const formatWanW = (value: unknown): string => {
  if (value === '' || value === null || value === undefined) return ''
  const number = Number(value)
  return Number.isFinite(number) ? `${(number / 10000).toFixed(2)}w` : ''
}

export const getPerformanceExportHeaders = (label: string): string[] => {
  const prefix = `数据表现-${label}`
  const headers = [
    `${prefix}-笔记数`,
    `${prefix}-内容类目及占比`,
    `${prefix}-曝光中位数`,
    `${prefix}-阅读中位数`,
    `${prefix}-互动中位数`,
    `${prefix}-中位点赞量`,
    `${prefix}-中位收藏量`,
    `${prefix}-中位评论量`,
    `${prefix}-中位分享量`,
    `${prefix}-中位关注量`,
    `${prefix}-互动率`,
    `${prefix}-图文3秒阅读率`,
    `${prefix}-千赞笔记比例`,
    `${prefix}-百赞笔记比例`,
    `${prefix}-预估CPM`,
    `${prefix}-预估阅读单价`,
    `${prefix}-预估互动单价`
  ]
  if (label.startsWith('合作笔记-')) headers.push(`${prefix}-外溢进店中位数`)
  return headers.concat(
    `${prefix}-阅读量来源-发现页`,
    `${prefix}-阅读量来源-搜索页`,
    `${prefix}-阅读量来源-关注页`,
    `${prefix}-阅读量来源-博主个人页`,
    `${prefix}-阅读量来源-附近页`,
    `${prefix}-阅读量来源-其他`,
    `${prefix}-曝光量来源-发现页`,
    `${prefix}-曝光量来源-搜索页`,
    `${prefix}-曝光量来源-关注页`,
    `${prefix}-曝光量来源-博主个人页`,
    `${prefix}-曝光量来源-附近页`,
    `${prefix}-曝光量来源-其他`
  )
}

const parseProfileValues = (value: unknown): Array<[string, string]> => {
  if (typeof value !== 'string') return []
  return value
    .split(/[，,]/)
    .map((part) => part.trim().match(/^(.+?)\s*(\d+(?:\.\d+)?%)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match?.[1] && match[2]))
    .map((match) => [match[1]!.trim(), match[2]!] as [string, string])
}

const getSplitProfileHeaders = (state: CollectionTaskState): string[] =>
  FANS_PROFILE_HEADERS.flatMap((header) => {
    const names = new Set<string>()
    state.targets.forEach((target) => {
      parseProfileValues(target.snapshot?.data[header]).forEach(([name]) => names.add(name))
    })
    return [...names].sort().map((name) => `${header}-${name}`)
  })

const baseValues = (
  target: CollectionTaskState['targets'][number],
  data: Record<string, unknown>
): unknown[] => [
  target.pgyUrl,
  target.userId,
  target.pgyUrl,
  target.xhsUrl,
  valueOrBlank(data.name),
  data.currentLevel ?? '',
  valueOrBlank(data.gender),
  valueOrBlank(data.redId),
  valueOrBlank(data.location),
  data.fansCount || 0,
  formatWanW(data.fansCount),
  data.likeCollectCountInfo || 0,
  formatWanW(data.likeCollectCountInfo),
  valueOrBlank(data.personalTags),
  valueOrBlank(data.recentBrands),
  data.picturePrice || 0,
  data.videoPrice || 0,
  data.lowerPrice || 0,
  valueOrBlank(data.noteSign),
  valueOrBlank(data.contentTags),
  valueOrBlank(data.tradeType),
  valueOrBlank(data.noteNumber),
  valueOrBlank(data.noteType),
  valueOrBlank(data.dateKey),
  valueOrBlank(data.daily_mAccumImpNum),
  valueOrBlank(data.daily_mValidRawReadFeedNum),
  valueOrBlank(data.daily_mEngagementNum),
  valueOrBlank(data.daily_mAccumImpCompare),
  valueOrBlank(data.daily_mValidRawReadFeedCompare),
  valueOrBlank(data.daily_mEngagementNumCompare),
  valueOrBlank(data.coop_mAccumImpNum),
  valueOrBlank(data.coop_mValidRawReadFeedNum),
  valueOrBlank(data.coop_mEngagementNum),
  valueOrBlank(data.estimatePictureCpm),
  valueOrBlank(data.estimateVideoCpm),
  valueOrBlank(data.estimatePictureCpmCompare),
  valueOrBlank(data.estimateVideoCpmCompare),
  valueOrBlank(data.picReadCost),
  valueOrBlank(data.videoReadCostV2),
  valueOrBlank(data.picReadCostCompare),
  valueOrBlank(data.videoReadCostCompare),
  valueOrBlank(data.estimatePictureEngageCost),
  valueOrBlank(data.estimateVideoEngageCost),
  valueOrBlank(data.estimatePictureCpuv),
  valueOrBlank(data.estimateVideoCpuv),
  valueOrBlank(data['笔记数据-合作笔记-图文+视频-近30天-全流量-外溢进店单价']),
  valueOrBlank(data['笔记数据-合作笔记-图文+视频-近90天-全流量-外溢进店单价']),
  valueOrBlank(data.activeDayInLast7),
  valueOrBlank(data.responseRate),
  valueOrBlank(data.fans30GrowthBeyondRate),
  valueOrBlank(data['头像']),
  valueOrBlank(data['博主优势']),
  valueOrBlank(data['特色标签']),
  valueOrBlank(data['商业笔记数']),
  valueOrBlank(data['下一健康等级']),
  valueOrBlank(data['近30天涨粉数']),
  valueOrBlank(data['近30天涨粉率']),
  valueOrBlank(data['预估阅读UV下限']),
  valueOrBlank(data['预估阅读UV上限']),
  valueOrBlank(data['预估人群覆盖率下限']),
  valueOrBlank(data['预估人群覆盖率上限']),
  valueOrBlank(data['近90天商家实收']),
  valueOrBlank(data['48小时邀约回复率']),
  valueOrBlank(data['近30天合作曝光中位数']),
  valueOrBlank(data['近30天预估CPUV']),
  valueOrBlank(data['近30天合作笔记数']),
  valueOrBlank(data['近30天直播场次']),
  valueOrBlank(data['近90天平均GMV']),
  valueOrBlank(data['场均观看人数']),
  valueOrBlank(data['服装行业图文报价']),
  valueOrBlank(data['服装行业视频报价']),
  valueOrBlank(data['买手权限']),
  valueOrBlank(data['优质达人']),
  valueOrBlank(data['图文阅读中位数']),
  valueOrBlank(data['图文互动中位数']),
  valueOrBlank(data['视频阅读中位数']),
  valueOrBlank(data['视频互动中位数']),
  valueOrBlank(data['合作行业名称']),
  valueOrBlank(data['邀约次数']),
  valueOrBlank(data['图文案例数']),
  valueOrBlank(data['视频案例数']),
  valueOrBlank(data['是否易合作']),
  valueOrBlank(data['百赞笔记占比']),
  valueOrBlank(data['千赞笔记占比']),
  valueOrBlank(data['视频完播率']),
  valueOrBlank(data['图文3秒阅读率']),
  valueOrBlank(data['点赞中位数']),
  valueOrBlank(data['收藏中位数']),
  valueOrBlank(data['评论中位数']),
  valueOrBlank(data['分享中位数']),
  valueOrBlank(data['曝光来源-发现页']),
  valueOrBlank(data['曝光来源-搜索']),
  valueOrBlank(data['曝光来源-关注']),
  valueOrBlank(data['近90天百赞笔记占比']),
  valueOrBlank(data['近90天千赞笔记占比']),
  valueOrBlank(data['近90天视频完播率']),
  valueOrBlank(data['近90天图文3秒阅读率']),
  valueOrBlank(data['近90天点赞中位数']),
  valueOrBlank(data['近90天收藏中位数']),
  valueOrBlank(data['近90天评论中位数']),
  valueOrBlank(data['近90天分享中位数']),
  valueOrBlank(data['近90天曝光来源-发现页']),
  valueOrBlank(data['近90天曝光来源-搜索']),
  valueOrBlank(data['近90天曝光来源-关注']),
  valueOrBlank(data['近30日粉丝增量']),
  valueOrBlank(data['近30日粉丝增量幅度']),
  valueOrBlank(data['近60日粉丝增量']),
  valueOrBlank(data['近60日粉丝增量幅度'])
]

export const projectCollectionRows = (
  state: CollectionTaskState,
  settings: CollectionSettings,
  includeIncomplete = false
): Record<string, unknown>[] => {
  const performanceHeaders = getPerformancePlan(settings.performanceFields).flatMap((field) =>
    getPerformanceExportHeaders(field.label)
  )
  const profileHeaders = settings.splitFansProfile
    ? getSplitProfileHeaders(state)
    : [...FANS_PROFILE_HEADERS]
  const headers = [...BASE_HEADERS, ...performanceHeaders, ...FANS_METRIC_HEADERS, ...profileHeaders, '采集时间']

  return state.targets
    .filter((target) => includeIncomplete || Boolean(target.snapshot))
    .map((target) => {
      const data = target.snapshot?.data ?? {}
      const performanceValues = performanceHeaders.map((header) => valueOrBlank(data[header]))
      const metricValues = FANS_METRIC_HEADERS.map((header) => valueOrBlank(data[header]))
      const profileValues = settings.splitFansProfile
        ? profileHeaders.map((header) => {
            const source = FANS_PROFILE_HEADERS.find((candidate) => header.startsWith(`${candidate}-`))
            if (!source) return ''
            const name = header.slice(source.length + 1)
            return parseProfileValues(data[source]).find(([entry]) => entry === name)?.[1] ?? ''
          })
        : FANS_PROFILE_HEADERS.map((header) => valueOrBlank(data[header]))
      const values = [
        ...baseValues(target, data),
        ...performanceValues,
        ...metricValues,
        ...profileValues,
        target.collectedAt ? new Date(target.collectedAt).toLocaleString('zh-CN') : ''
      ]
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    })
}