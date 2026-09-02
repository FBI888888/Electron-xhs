import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FileInput, FileOutput, Pause, Play, Plus, Square } from 'lucide-react'
import type { InviteItem } from '@shared/models'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

export const InvitesPage = () => {
  const license = useAppStore((state) => state.license)
  const accounts = useAppStore((state) => state.accounts).filter((account) => account.status === 'active')
  const setAccounts = useAppStore((state) => state.setAccounts)
  const pushToast = useToastStore((state) => state.push)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [profileUrl, setProfileUrl] = useState('')
  const [captured, setCaptured] = useState(false)
  const [items, setItems] = useState<InviteItem[]>([])
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const stopRef = useRef(false)
  const pausedRef = useRef(false)

  useEffect(
    () =>
      window.desktop.invites.onRequestCaptured(() => {
        setCaptured(true)
        setItems((current) =>
          current.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  status: 'success',
                  message: '手动邀约已完成',
                  invitedAt: new Date().toISOString()
                }
              : item
          )
        )
        pushToast({
          kind: 'success',
          title: '邀约模板已捕获',
          message: '后续邀约将复用本次填写的模板字段'
        })
      }),
    [pushToast]
  )

  const add = () => {
    if (!profileUrl.trim()) return
    setItems((current) => [...current, { id: crypto.randomUUID(), profileUrl: profileUrl.trim(), cooperationType: '图文合作', productName: '', content: '', contact: '', status: 'pending' }])
    setProfileUrl('')
  }

  const update = (id: string, patch: Partial<InviteItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const importItems = async () => {
    const result = await window.desktop.invites.importItems()
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导入失败', message: result.error.message })
      return
    }
    setItems(result.data)
    setCaptured(false)
    pushToast({ kind: 'success', title: '导入成功', message: `已导入 ${result.data.length} 条邀约数据` })
  }

  const exportTemplate = async () => {
    const result = await window.desktop.invites.exportTemplate()
    if (!result.ok) {
      pushToast({ kind: 'error', title: '模板导出失败', message: result.error.message })
      return
    }
    if (result.data) pushToast({ kind: 'success', title: '模板已导出', message: result.data })
  }

  const openTemplate = async () => {
    const first = items[0]
    if (!accountId || !first) return
    const result = await window.desktop.invites.openBrowser(accountId, first.profileUrl)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '无法打开邀约窗口', message: result.error.message })
      return
    }
    pushToast({ kind: 'info', title: '邀约窗口已打开', message: '请手动完成首条邀约以捕获请求模板' })
  }

  const exportItems = async (): Promise<void> => {
    const result = await window.desktop.invites.export(items)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导出失败', message: result.error.message })
      return
    }
    if (result.data) pushToast({ kind: 'success', title: '导出成功', message: result.data })
  }

  const start = async () => {
    if (!captured || !accountId || running) return
    const selectedAccount = accounts.find((account) => account.id === accountId)
    setRunning(true)
    setPaused(false)
    stopRef.current = false
    pausedRef.current = false
    for (const item of items.filter((entry) => entry.status !== 'success')) {
      if (stopRef.current) break
      while (pausedRef.current && !stopRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 100))
      }
      if (stopRef.current) break
      const requestItem = {
        ...item,
        accountNickname: selectedAccount?.nickname || selectedAccount?.remark || item.accountNickname
      }
      update(item.id, { status: 'running', message: '邀约中' })
      let result = await window.desktop.invites.send(requestItem, accountId)
      if (!result.ok && result.error.code !== 'RATE_LIMITED' && !stopRef.current) {
        update(item.id, { status: 'running', message: '首次失败，正在重试' })
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        result = await window.desktop.invites.send(requestItem, accountId)
      }

      if (!result.ok && result.error.code !== 'RATE_LIMITED' && !stopRef.current) {
        const latestAccount = useAppStore.getState().accounts.find((account) => account.id === accountId)
        if (!latestAccount?.hasCredentials) {
          update(item.id, {
            status: 'failed',
            message: `${result.error.message}；账号未保存密码，无法自动更新 Cookies`
          })
          pushToast({
            kind: 'error',
            title: '邀约已停止',
            message: '账号请求连续失败，且未保存密码，无法自动更新 Cookies'
          })
          stopRef.current = true
          break
        }

        update(item.id, { status: 'running', message: '正在自动更新账号 Cookies' })
        const refreshed = await window.desktop.accounts.refresh(accountId)
        if (!refreshed.ok) {
          update(item.id, { status: 'failed', message: `Cookies 更新失败：${refreshed.error.message}` })
          pushToast({ kind: 'error', title: '邀约已停止', message: refreshed.error.message })
          stopRef.current = true
          break
        }
        setAccounts([
          ...useAppStore.getState().accounts.filter((account) => account.id !== refreshed.data.id),
          refreshed.data
        ])
        update(item.id, { status: 'running', message: 'Cookies 已更新，正在重新发送' })
        result = await window.desktop.invites.send(requestItem, accountId)
        if (!result.ok) {
          update(item.id, {
            status: 'failed',
            message: `更新 Cookies 后仍失败：${result.error.message}`
          })
          if (result.error.code === 'AUTH_EXPIRED') {
            setCaptured(false)
            pushToast({
              kind: 'error',
              title: '邀约模板已失效',
              message: '登录会话已更新，但请求授权仍失效，请重新完成首条邀约'
            })
          } else {
            pushToast({ kind: 'error', title: '邀约已停止', message: result.error.message })
          }
          stopRef.current = true
          break
        }
      }

      update(item.id, result.ok ? result.data : { status: 'failed', message: result.error.message })
      if (!result.ok && result.error.code === 'RATE_LIMITED') {
        pushToast({ kind: 'warning', title: '邀约已暂停', message: result.error.message })
        break
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
    pausedRef.current = false
    setPaused(false)
    setRunning(false)
  }

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  if (license?.memberLevel !== 'SVIP') {
    return <div className="page"><PageHeader title="达人邀约" description="批量邀约为 SVIP 专属功能。" /><div className="page-content"><EmptyState title="当前授权不包含达人邀约" description="升级到 SVIP 后可使用模板捕获、批量邀约和结果导出。" /></div></div>
  }

  return (
    <div className="page">
      <PageHeader title="达人邀约" description="先手动完成一次邀约以捕获模板，再按列表批量发送。" actions={<><Button icon={<FileInput size={16} />} disabled={running} onClick={() => void importItems()}>导入Excel</Button><Button icon={<FileOutput size={16} />} disabled={running} onClick={() => void exportTemplate()}>导出模板</Button><select className="compact-select" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">选择账号</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.remark || account.nickname}</option>)}</select><Button icon={<ExternalLink size={16} />} disabled={!accountId || items.length === 0} onClick={() => void openTemplate()}>首条邀约</Button><Button variant="primary" icon={<Play size={16} />} disabled={!captured || running || items.length === 0} onClick={() => void start()}>批量开始</Button>{running && <Button icon={paused ? <Play size={16} /> : <Pause size={16} />} onClick={togglePause}>{paused ? '继续' : '暂停'}</Button>}{running && <Button variant="danger" icon={<Square size={16} />} onClick={() => { stopRef.current = true }}>停止</Button>}<Button icon={<Download size={16} />} disabled={items.length === 0} onClick={() => void exportItems()}>导出</Button></>} />
      <div className="page-content invites-layout">
        <section className="invite-add"><input value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="粘贴蒲公英达人详情页" /><Button variant="primary" icon={<Plus size={16} />} onClick={add}>添加达人</Button><span className={captured ? 'capture-state capture-state--ready' : 'capture-state'}>{captured ? '模板已就绪' : '等待首条邀约'}</span></section>
        <section className="table-panel">
          {items.length === 0 ? <EmptyState title="暂无邀约对象" description="添加达人详情页后填写合作信息，再打开首条邀约捕获模板。" /> : <table className="data-table data-table--form"><thead><tr><th>状态</th><th>账号昵称</th><th>达人主页</th><th>合作类型</th><th>产品名称</th><th>合作内容</th><th>联系方式</th><th>邀约时间</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><StatusBadge status={item.status} /><small>{item.message}</small></td><td>{item.accountNickname || '—'}</td><td><code>{item.profileUrl}</code></td><td><select value={item.cooperationType} onChange={(event) => update(item.id, { cooperationType: event.target.value })}><option>图文合作</option><option>视频合作</option></select></td><td><input value={item.productName} onChange={(event) => update(item.id, { productName: event.target.value })} /></td><td><input value={item.content} onChange={(event) => update(item.id, { content: event.target.value })} /></td><td><input value={item.contact} onChange={(event) => update(item.id, { contact: event.target.value })} /></td><td>{item.invitedAt ? new Date(item.invitedAt).toLocaleString('zh-CN') : '—'}</td></tr>)}</tbody></table>}
        </section>
      </div>
    </div>
  )
}