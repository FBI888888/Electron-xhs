import { dialog } from 'electron'
import { mkdir } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import * as XLSX from 'xlsx'
import type {
  BloggerListItem,
  CollectionSettings,
  CollectionTaskState,
  InviteItem,
  LinkConversionItem
} from '@shared/models'
import { projectCollectionRows } from '@domain/export-projection'
import { err, ok, type Result } from '@shared/result'

const saveWorkbook = async (
  title: string,
  defaultPath: string,
  rows: Record<string, unknown>[],
  sheetName: string,
  destination?: string
): Promise<Result<string | null>> => {
  let filePath = destination
  if (!filePath) {
    const selection = await dialog.showSaveDialog({
      title,
      defaultPath,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    filePath = selection.filePath
  }
  if (!filePath) return ok(null)
  if (extname(filePath).toLowerCase() !== '.xlsx') filePath += '.xlsx'

  try {
    await mkdir(dirname(filePath), { recursive: true })
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
    XLSX.writeFile(workbook, filePath)
    return ok(filePath)
  } catch (error) {
    return err('INTERNAL', error instanceof Error ? error.message : '导出失败')
  }
}

const collectionDestination = (settings: CollectionSettings): string | undefined => {
  const directory = settings.output.directory.trim()
  if (!directory) return undefined
  if (extname(directory).toLowerCase() === '.xlsx') return directory
  return join(directory, settings.output.filename || 'collected_data.xlsx')
}

const listValue = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).filter(Boolean).join('、') : ''

const linkStatusLabel: Record<LinkConversionItem['status'], string> = {
  pending: '未转换',
  running: '转换中',
  success: '成功',
  unrecognized: '未识别',
  failed: '失败'
}

const inviteStatusLabel: Record<InviteItem['status'], string> = {
  pending: '未邀约',
  running: '邀约中',
  success: '邀约成功',
  failed: '邀约失败'
}

export class ExportService {
  exportCollection(
    state: CollectionTaskState,
    settings: CollectionSettings,
    includeIncomplete = false
  ): Promise<Result<string | null>> {
    const rows = projectCollectionRows(state, settings, includeIncomplete)
    return saveWorkbook(
      '导出采集快照',
      settings.output.filename || 'collected_data.xlsx',
      rows,
      '采集数据',
      collectionDestination(settings)
    )
  }

  exportLinks(items: LinkConversionItem[]): Promise<Result<string | null>> {
    return saveWorkbook(
      '导出链接转换数据',
      'link_convert.xlsx',
      items.map((item) => ({ 状态: linkStatusLabel[item.status], 短链接: item.shortUrl, 长链接: item.longUrl, 信息: item.message ?? '' })),
      '链接转换'
    )
  }

  exportBloggers(items: BloggerListItem[]): Promise<Result<string | null>> {
    return saveWorkbook(
      '导出达人列表',
      `达人列表_${new Date().toISOString().slice(0, 10)}.xlsx`,
      items.map((item) => ({
        蒲公英主页: `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${item.userId}`,
        小红书主页: `https://www.xiaohongshu.com/user/profile/${item.userId}`,
        达人昵称: item.name,
        归属地: item.location ?? '',
        个人标签: listValue(item.raw.personalTags),
        内容标签: listValue(item.raw.featureTags),
        性别: item.raw.gender ?? '',
        粉丝数: item.fansCount ?? 0,
        '粉丝数-万': item.fansCount ? (item.fansCount / 10000).toFixed(2) : 0,
        '阅读中位数(合作)': item.raw.readMidCoop30 ?? 0,
        '互动中位数(合作)': item.raw.interMidCoop30 ?? 0,
        外溢进店中位数: item.raw.mcpuvNum30d ?? 0,
        图文报价: item.picturePrice ?? 0,
        视频报价: item.videoPrice ?? 0
      })),
      '达人列表'
    )
  }

  exportInvites(items: InviteItem[]): Promise<Result<string | null>> {
    return saveWorkbook(
      '导出邀约结果',
      `达人邀约数据_${new Date().toISOString().slice(0, 10)}.xlsx`,
      items.map((item) => ({
        邀约状态: inviteStatusLabel[item.status],
        账号昵称: item.accountNickname ?? '',
        主页url: item.profileUrl,
        合作类型: item.cooperationType,
        产品名称: item.productName,
        合作内容: item.content,
        联系方式: item.contact,
        邀约时间: item.invitedAt ?? '',
        结果信息: item.message ?? ''
      })),
      '邀约数据'
    )
  }

  exportInviteTemplate(): Promise<Result<string | null>> {
    return saveWorkbook(
      '导出邀约模板',
      `达人邀约模板_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          账号昵称: '示例昵称',
          主页url: 'https://www.xiaohongshu.com/user/profile/xxxxxxxxxxxxxxxxxxxxxxxx',
          合作类型: '图文/视频',
          产品名称: '示例产品',
          合作内容: '示例合作内容：这里填写邀约文案',
          联系方式: '示例联系方式：微信/手机号'
        }
      ],
      '模板'
    )
  }
}