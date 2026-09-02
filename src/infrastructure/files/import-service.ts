import { dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import type { InviteItem } from '@shared/models'
import { err, ok, type Result } from '@shared/result'

export class ImportService {
  async importFirstColumn(): Promise<Result<string[]>> {
    const selection = await dialog.showOpenDialog({
      title: '导入数据',
      properties: ['openFile'],
      filters: [
        { name: '支持的文件', extensions: ['xlsx', 'xls', 'txt'] },
        { name: 'Excel', extensions: ['xlsx', 'xls'] },
        { name: '文本', extensions: ['txt'] }
      ]
    })
    const filePath = selection.filePaths[0]
    if (!filePath) return ok([])

    try {
      if (filePath.toLowerCase().endsWith('.txt')) {
        const text = await readFile(filePath, 'utf8')
        return ok(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
      }

      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
      if (!sheet) return err('INVALID_INPUT', 'Excel 中没有可读取的工作表')
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
      return ok(
        rows
          .map((row) => (Array.isArray(row) ? String(row[0] ?? '').trim() : ''))
          .filter(Boolean)
      )
    } catch (error) {
      return err('INVALID_INPUT', error instanceof Error ? error.message : '文件读取失败')
    }
  }

  async importInvites(): Promise<Result<InviteItem[]>> {
    const selection = await dialog.showOpenDialog({
      title: '导入达人邀约数据',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
    })
    const filePath = selection.filePaths[0]
    if (!filePath) return ok([])

    try {
      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
      if (!sheet) return err('INVALID_INPUT', 'Excel 中没有可读取的工作表')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      return ok(
        rows
          .map((row) => ({
            id: randomUUID(),
            accountNickname: String(row['账号昵称'] ?? '').trim(),
            profileUrl: String(row['主页url'] ?? '').trim(),
            cooperationType: String(row['合作类型'] ?? '').trim(),
            productName: String(row['产品名称'] ?? '').trim(),
            content: String(row['合作内容'] ?? '').trim(),
            contact: String(row['联系方式'] ?? '').trim(),
            status: 'pending' as const
          }))
          .filter((item) => item.profileUrl)
      )
    } catch (error) {
      return err('INVALID_INPUT', error instanceof Error ? error.message : '邀约文件读取失败')
    }
  }
}