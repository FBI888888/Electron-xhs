import { useEffect, useRef, useState } from 'react'
import { Download, FileInput, Link2, LogIn, Play, Square } from 'lucide-react'
import type { LinkConversionItem } from '@shared/models'
import { extractShortLinks } from '@domain/profile-url'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useToastStore } from '@renderer/store/app-store'

export const LinksPage = () => {
  const pushToast = useToastStore((state) => state.push)
  const [source, setSource] = useState('')
  const [items, setItems] = useState<LinkConversionItem[]>([])
  const [running, setRunning] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const stopRef = useRef(false)

  useEffect(() => {
    void window.desktop.links.hasCookies().then((result) => {
      if (result.ok) setLoggedIn(result.data)
    })
    return window.desktop.links.onCookiesCaptured(() => {
      setLoggedIn(true)
      pushToast({ kind: 'success', title: '小红书已登录', message: '登录凭据已安全保存' })
    })
  }, [pushToast])

  const loadLinks = (text: string) => {
    const links = extractShortLinks(text)
    setItems(links.map((shortUrl) => ({ id: crypto.randomUUID(), shortUrl, longUrl: '', status: 'pending' })))
    pushToast({ kind: links.length ? 'success' : 'warning', title: links.length ? '链接已载入' : '未识别到短链接', message: links.length ? `共 ${links.length} 条，已自动去重` : '请粘贴 xhslink.com 短链接或分享文案' })
  }

  const loadSource = () => loadLinks(source)

  const importFile = async () => {
    const result = await window.desktop.links.importItems()
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导入失败', message: result.error.message })
      return
    }
    const text = result.data.join('\n')
    setSource(text)
    loadLinks(text)
  }

  const convertOne = async (item: LinkConversionItem): Promise<void> => {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: 'running' } : entry)))
    const result = await window.desktop.links.resolve(item.shortUrl)
    setItems((current) => current.map((entry) =>
      entry.id === item.id
        ? result.ok
          ? { ...result.data, id: item.id }
          : { ...entry, status: 'failed', message: result.error.message }
        : entry
    ))
  }

  const openLogin = async (): Promise<void> => {
    const result = await window.desktop.links.openLogin()
    if (!result.ok) {
      pushToast({ kind: 'error', title: '无法打开小红书登录', message: result.error.message })
      return
    }
    pushToast({ kind: 'info', title: '登录窗口已打开', message: '请在窗口中完成小红书登录' })
  }

  const exportItems = async (): Promise<void> => {
    const result = await window.desktop.links.export(items)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导出失败', message: result.error.message })
      return
    }
    if (result.data) pushToast({ kind: 'success', title: '导出成功', message: result.data })
  }

  const start = async () => {
    if (items.length === 0 || running) return
    setRunning(true)
    stopRef.current = false
    for (const item of items) {
      if (stopRef.current) break
      await convertOne(item)
    }
    setRunning(false)
  }

  return (
    <div className="page">
      <PageHeader title="链接转换" description="将分享短链接批量解析为稳定的达人主页链接。" actions={<><Button icon={<FileInput size={16} />} disabled={running} onClick={() => void importFile()}>文件导入</Button><Button icon={<LogIn size={16} />} onClick={() => void openLogin()}>{loggedIn ? '小红书已登录(更新)' : '小红书登录'}</Button><Button variant="primary" icon={<Play size={16} />} disabled={running || items.length === 0} onClick={() => void start()}>开始转换</Button>{running && <Button variant="danger" icon={<Square size={16} />} onClick={() => { stopRef.current = true }}>停止</Button>}<Button icon={<Download size={16} />} disabled={items.length === 0} onClick={() => void exportItems()}>导出</Button></>} />
      <div className="page-content split-workspace">
        <section className="input-panel"><div><span className="eyebrow">输入</span><h2>粘贴分享文案或短链接</h2><p>会自动提取并去重 `xhslink.com` 链接。</p></div><textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder="每行一条，或直接粘贴整段分享文案" /><Button variant="primary" icon={<Link2 size={16} />} onClick={loadSource}>载入转换列表</Button></section>
        <section className="table-panel">
          {items.length === 0 ? <EmptyState title="暂无链接" description="在左侧粘贴短链接并载入后，转换结果会显示在这里。" /> : <table className="data-table"><thead><tr><th>状态</th><th>短链接</th><th>达人主页</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><StatusBadge status={item.status} /><small>{item.message}</small></td><td><code>{item.shortUrl}</code></td><td><code>{item.longUrl || '—'}</code></td><td><button className="cell-link" disabled={running} onClick={() => void convertOne(item)}>重新转换</button></td></tr>)}</tbody></table>}
        </section>
      </div>
    </div>
  )
}