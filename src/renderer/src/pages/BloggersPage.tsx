import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, Pause, Play, Square, Trash2 } from 'lucide-react'
import type { BloggerListItem } from '@shared/models'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

const listValue = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).filter(Boolean).join('、') : '—'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

type FetchPhase = 'idle' | 'running' | 'paused' | 'stopped' | 'completed'

interface FetchProgress {
  page: number
  total: number
  count: number
  message: string
}

const phaseStatus = (phase: FetchPhase): string => {
  if (phase === 'running') return 'running'
  if (phase === 'paused') return 'paused'
  if (phase === 'stopped') return 'cancelled'
  if (phase === 'completed') return 'completed'
  return 'idle'
}

const formatProgress = (page: number, count: number, total: number, prefix = ''): string => {
  const parts = [`第 ${page} 页`, `已获取 ${count} 人`]
  if (total > 0) parts.push(`共约 ${total} 人`)
  return `${prefix}${parts.join(' · ')}`
}

export const BloggersPage = () => {
  const license = useAppStore((state) => state.license)
  const accounts = useAppStore((state) => state.accounts).filter((account) => account.status === 'active')
  const pushToast = useToastStore((state) => state.push)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [maxPages, setMaxPages] = useState(500)
  const [captured, setCaptured] = useState(false)
  const [phase, setPhase] = useState<FetchPhase>('idle')
  const [progress, setProgress] = useState<FetchProgress>({ page: 0, total: 0, count: 0, message: '' })
  const [items, setItems] = useState<BloggerListItem[]>([])
  const stopRef = useRef(false)
  const pauseRef = useRef(false)
  const busy = phase === 'running' || phase === 'paused'
  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.count / progress.total) * 100))
    : maxPages > 0
      ? Math.min(100, Math.round((progress.page / maxPages) * 100))
      : 0

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

  const waitIfPaused = async (): Promise<void> => {
    while (pauseRef.current && !stopRef.current) await sleep(200)
  }

  const selectAccount = async (nextAccountId: string): Promise<void> => {
    stopRef.current = true
    pauseRef.current = false
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
    if (!captured || busy) return
    setPhase('running')
    stopRef.current = false
    pauseRef.current = false
    const byId = new Map(items.map((item) => [item.userId, item]))
    let consecutiveEmptyPages = 0
    let lastTotal = 0
    setProgress({ page: 0, total: 0, count: byId.size, message: '正在开始获取…' })

    for (let page = 1; page <= maxPages && !stopRef.current; page += 1) {
      await waitIfPaused()
      if (stopRef.current) break
      setProgress({
        page,
        total: lastTotal,
        count: byId.size,
        message: formatProgress(page, byId.size, lastTotal)
      })

      let result: Awaited<ReturnType<typeof window.desktop.bloggers.fetchPage>> | null = null
      for (let attempt = 1; attempt <= 3 && !stopRef.current; attempt += 1) {
        result = await window.desktop.bloggers.fetchPage(page)
        if (result.ok) break
        if (attempt < 3) await sleep(2000)
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
        await sleep(3000)
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
      lastTotal = pageTotal
      pageItems.forEach((item) => byId.set(item.userId, item))
      setItems([...byId.values()])
      setProgress({
        page,
        total: pageTotal,
        count: byId.size,
        message: formatProgress(page, byId.size, pageTotal)
      })
      if (pageTotal > 0 && byId.size >= pageTotal) break
      await waitIfPaused()
      if (stopRef.current) break
      await sleep(500)
    }

    const stopped = stopRef.current
    setPhase(stopped ? 'stopped' : 'completed')
    setProgress((current) => ({
      ...current,
      message: stopped
        ? `已停止 · ${formatProgress(current.page, current.count, current.total)}`
        : `获取完成 · ${formatProgress(current.page, current.count, current.total)}`
    }))
  }

  const pauseFetch = (): void => {
    if (phase !== 'running') return
    pauseRef.current = true
    setPhase('paused')
    setProgress((current) => ({
      ...current,
      message: formatProgress(current.page, current.count, current.total, '已暂停 · ')
    }))
  }

  const resumeFetch = (): void => {
    if (phase !== 'paused') return
    pauseRef.current = false
    setPhase('running')
    setProgress((current) => ({
      ...current,
      message: formatProgress(current.page, current.count, current.total)
    }))
  }

  const stopFetch = (): void => {
    stopRef.current = true
    pauseRef.current = false
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
        <PageHeader title="达人列表" description="达人列表为 VVIP 与 SVIP 功能。" />
        <div className="page-content">
          <EmptyState title="当前授权不包含达人列表" description="升级到 VVIP 或 SVIP 后可使用筛选捕获与批量导出。" />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="达人列表"
        description="复用博主广场中的筛选条件，批量获取并导出达人列表。"
        actions={
          <>
            <select className="compact-select" value={accountId} onChange={(event) => void selectAccount(event.target.value)}>
              <option value="">选择账号</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.remark || account.nickname}</option>)}
            </select>
            <Button icon={<ExternalLink size={16} />} disabled={!accountId} onClick={() => void openBrowser()}>打开博主广场</Button>
            <label className="compact-number">页数<input type="number" min={1} max={500} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} /></label>
            <Button variant="primary" icon={<Play size={16} />} disabled={!captured || busy} onClick={() => void fetchAll()}>开始获取</Button>
            {phase === 'running' && <Button icon={<Pause size={16} />} onClick={pauseFetch}>暂停</Button>}
            {phase === 'paused' && <Button variant="primary" icon={<Play size={16} />} onClick={resumeFetch}>继续</Button>}
            {busy && <Button variant="danger" icon={<Square size={16} />} onClick={stopFetch}>停止</Button>}
            <Button icon={<Trash2 size={16} />} disabled={items.length === 0 || busy} onClick={() => { setItems([]); setProgress({ page: 0, total: 0, count: 0, message: '' }); setPhase('idle') }}>清空</Button>
            <Button icon={<Download size={16} />} disabled={items.length === 0} onClick={() => void exportItems()}>导出</Button>
          </>
        }
      />
      <div className="page-content">
        <div className="capture-hint"><span className={captured ? 'capture-dot capture-dot--ready' : 'capture-dot'} />{captured ? '已捕获筛选请求' : '打开博主广场并执行一次筛选，软件会自动捕获查询条件'}</div>
        {progress.message && (
          <section className="task-strip">
            <div><span>获取进度</span><StatusBadge status={phaseStatus(phase)} /></div>
            <div className="task-strip__progress"><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><strong>{percent}%</strong></div>
            <div className="task-strip__stats"><span>{progress.message}</span></div>
          </section>
        )}
        <section className="table-panel">
          {items.length === 0 ? (
            <EmptyState title="暂无达人数据" description="捕获筛选条件后开始获取，数据会按达人 ID 自动去重。" />
          ) : (
            <table className="data-table">
              <thead><tr><th>达人</th><th>蒲公英主页</th><th>小红书主页</th><th>归属地</th><th>个人标签</th><th>内容标签</th><th>性别</th><th>粉丝数</th><th>阅读中位数(合作)</th><th>互动中位数(合作)</th><th>外溢进店中位数</th><th>图文报价</th><th>视频报价</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.userId}>
                    <td>
                      <div className="person-cell">
                        {item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span className="avatar-fallback">{(item.name || item.userId).slice(0, 1)}</span>}
                        <div>
                          <button className="cell-link" onClick={() => void openDetail(item)}>{item.name || item.userId}</button>
                          <small>{item.userId}</small>
                        </div>
                      </div>
                    </td>
                    <td><code>https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/{item.userId}</code></td>
                    <td><code>https://www.xiaohongshu.com/user/profile/{item.userId}</code></td>
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
