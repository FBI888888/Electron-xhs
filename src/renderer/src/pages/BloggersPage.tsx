import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, Play, Square, Trash2 } from 'lucide-react'
import type { BloggerListItem } from '@shared/models'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

const listValue = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).filter(Boolean).join('、') : '—'

export const BloggersPage = () => {
  const license = useAppStore((state) => state.license)
  const accounts = useAppStore((state) => state.accounts.filter((account) => account.status === 'active'))
  const pushToast = useToastStore((state) => state.push)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [maxPages, setMaxPages] = useState(20)
  const [captured, setCaptured] = useState(false)
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<BloggerListItem[]>([])
  const stopRef = useRef(false)

  useEffect(() => {
    const unsubscribe = window.desktop.bloggers.onRequestCaptured(() => {
      setCaptured(true)
      pushToast({ kind: 'success', title: '筛选条件已捕获', message: '现在可以批量获取达人列表' })
    })
    return () => {
      unsubscribe()
      void window.desktop.bloggers.closeBrowser()
    }
  }, [pushToast])

  const selectAccount = async (nextAccountId: string): Promise<void> => {
    stopRef.current = true
    await window.desktop.bloggers.closeBrowser()
    setCaptured(false)
    setAccountId(nextAccountId)
  }

  const openBrowser = async (): Promise<void> => {
    if (!accountId) return
    setCaptured(false)
    const result = await window.desktop.bloggers.openBrowser(accountId)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '无法打开博主广场', message: result.error.message })
      return
    }
    pushToast({ kind: 'info', title: '博主广场已打开', message: '请执行一次筛选以捕获查询条件' })
  }

  const openDetail = async (item: BloggerListItem): Promise<void> => {
    if (!accountId) return
    const result = await window.desktop.bloggers.openDetail(
      accountId,
      `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${item.userId}`
    )
    if (!result.ok) pushToast({ kind: 'error', title: '无法打开达人详情', message: result.error.message })
  }

  const fetchAll = async (): Promise<void> => {
    if (!captured || running) return
    setRunning(true)
    stopRef.current = false
    const byId = new Map(items.map((item) => [item.userId, item]))
    let consecutiveEmptyPages = 0

    for (let page = 1; page <= maxPages && !stopRef.current; page += 1) {
      let result: Awaited<ReturnType<typeof window.desktop.bloggers.fetchPage>> | null = null
      for (let attempt = 1; attempt <= 3 && !stopRef.current; attempt += 1) {
        result = await window.desktop.bloggers.fetchPage(page)
        if (result.ok) break
        if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      if (!result?.ok) {
        consecutiveEmptyPages += 1
        pushToast({
          kind: 'warning',
          title: `第 ${page} 页获取失败`,
          message: result?.error.message ?? '请求失败，已跳过当前页'
        })
        if (consecutiveEmptyPages >= 5) break
        continue
      }

      let pageItems = result.data.items
      let pageTotal = result.data.total
      for (let retry = 1; pageItems.length === 0 && retry <= 2 && !stopRef.current; retry += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000))
        const retried = await window.desktop.bloggers.fetchPage(page)
        if (retried.ok) {
          pageItems = retried.data.items
          pageTotal = retried.data.total
        }
      }

      if (pageItems.length === 0) {
        consecutiveEmptyPages += 1
        if (consecutiveEmptyPages >= 5) break
        continue
      }

      consecutiveEmptyPages = 0
      pageItems.forEach((item) => byId.set(item.userId, item))
      setItems([...byId.values()])
      if (pageTotal > 0 && byId.size >= pageTotal) break
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
    setRunning(false)
  }

  const exportItems = async (): Promise<void> => {
    const result = await window.desktop.bloggers.export(items)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导出失败', message: result.error.message })
      return
    }
    if (result.data) pushToast({ kind: 'success', title: '导出成功', message: result.data })
  }

  if (!license || !['VVIP', 'SVIP'].includes(license.memberLevel)) {
    return (
      <div className="page">
        <PageHeader title="达人库" description="达人列表为 VVIP 与 SVIP 功能。" />
        <div className="page-content">
          <EmptyState title="当前授权不包含达人库" description="升级到 VVIP 或 SVIP 后可使用筛选捕获与批量导出。" />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="达人库"
        description="复用博主广场中的筛选条件，批量获取并导出达人列表。"
        actions={
          <>
            <select className="compact-select" value={accountId} onChange={(event) => void selectAccount(event.target.value)}>
              <option value="">选择账号</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.remark || account.nickname}</option>)}
            </select>
            <Button icon={<ExternalLink size={16} />} disabled={!accountId} onClick={() => void openBrowser()}>打开博主广场</Button>
            <label className="compact-number">页数<input type="number" min={1} max={500} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} /></label>
            <Button variant="primary" icon={<Play size={16} />} disabled={!captured || running} onClick={() => void fetchAll()}>开始获取</Button>
            {running && <Button variant="danger" icon={<Square size={16} />} onClick={() => { stopRef.current = true }}>停止</Button>}
            <Button icon={<Trash2 size={16} />} disabled={items.length === 0 || running} onClick={() => setItems([])}>清空</Button>
            <Button icon={<Download size={16} />} disabled={items.length === 0} onClick={() => void exportItems()}>导出</Button>
          </>
        }
      />
      <div className="page-content">
        <div className="capture-hint"><span className={captured ? 'capture-dot capture-dot--ready' : 'capture-dot'} />{captured ? '已捕获筛选请求' : '打开博主广场并执行一次筛选，软件会自动捕获查询条件'}</div>
        <section className="table-panel">
          {items.length === 0 ? (
            <EmptyState title="暂无达人数据" description="捕获筛选条件后开始获取，数据会按达人 ID 自动去重。" />
          ) : (
            <table className="data-table">
              <thead><tr><th>达人</th><th>归属地</th><th>个人标签</th><th>内容标签</th><th>性别</th><th>粉丝数</th><th>阅读中位数(合作)</th><th>互动中位数(合作)</th><th>外溢进店中位数</th><th>图文报价</th><th>视频报价</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.userId}>
                    <td><button className="cell-link" onClick={() => void openDetail(item)}>{item.name || item.userId}</button><small>{item.userId}</small></td>
                    <td>{item.location || '—'}</td>
                    <td>{listValue(item.raw.personalTags)}</td>
                    <td>{listValue(item.raw.featureTags)}</td>
                    <td>{String(item.raw.gender ?? '—')}</td>
                    <td>{item.fansCount?.toLocaleString() || '—'}<small>{item.fansCount ? `${(item.fansCount / 10000).toFixed(2)} 万` : ''}</small></td>
                    <td>{String(item.raw.readMidCoop30 ?? '—')}</td>
                    <td>{String(item.raw.interMidCoop30 ?? '—')}</td>
                    <td>{String(item.raw.mcpuvNum30d ?? '—')}</td>
                    <td>{item.picturePrice || '—'}</td>
                    <td>{item.videoPrice || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}