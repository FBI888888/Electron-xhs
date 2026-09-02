import { useMemo, useState } from 'react'
import { Download, FileInput, Pause, Play, RotateCcw, Square, TextCursorInput } from 'lucide-react'
import type { CollectionTarget } from '@shared/models'
import { parseProfileUrls } from '@domain/profile-url'
import { Button } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

const asTarget = (url: ReturnType<typeof parseProfileUrls>[number]): CollectionTarget => ({
  id: crypto.randomUUID(),
  ...url,
  nickname: '',
  status: 'pending',
  statusText: '待采集',
  errors: []
})

export const CollectionPage = () => {
  const task = useAppStore((state) => state.task)
  const settings = useAppStore((state) => state.settings)
  const pushToast = useToastStore((state) => state.push)
  const [draftTargets, setDraftTargets] = useState<CollectionTarget[]>([])
  const [textOpen, setTextOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const running = ['preparing', 'running', 'paused', 'stopping'].includes(task.status)
  const visibleTargets = task.status === 'idle' ? draftTargets : task.targets
  const selected = visibleTargets.find((target) => target.id === selectedId) ?? null
  const progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0
  const canStart = draftTargets.length > 0 && !running
  const accountCount = useAppStore((state) => state.accounts.filter((account) => account.status === 'active').length)

  const mergeUrls = (urls: string[]) => {
    const parsed = parseProfileUrls(urls.join('\n'))
    const unique = new Map(draftTargets.map((target) => [target.userId, target]))
    parsed.forEach((item) => unique.set(item.userId, asTarget(item)))
    setDraftTargets([...unique.values()])
    pushToast({ kind: 'success', title: '导入完成', message: `当前列表共 ${unique.size} 个达人` })
  }

  const importFile = async () => {
    const result = await window.desktop.collection.importTargets()
    if (result.ok && result.data.length > 0) mergeUrls(result.data)
    else if (!result.ok) pushToast({ kind: 'error', title: '导入失败', message: result.error.message })
  }

  const importFromText = () => {
    mergeUrls(importText.split(/\r?\n/))
    setImportText('')
    setTextOpen(false)
  }

  const startTargets = async (targets: CollectionTarget[]) => {
    if (accountCount === 0) {
      pushToast({ kind: 'warning', title: '没有可用账号', message: '请先在账号管理中验证至少一个账号' })
      return
    }
    const result = await window.desktop.collection.start({
      targets: targets.map(({ userId, pgyUrl, xhsUrl }) => ({ userId, pgyUrl, xhsUrl })),
      settings
    })
    if (!result.ok) pushToast({ kind: 'error', title: '无法开始', message: result.error.message })
  }

  const start = () => startTargets(draftTargets)
  const retryTargets = task.targets.filter((target) =>
    ['failed', 'cancelled'].includes(target.status)
  )

  const action = async (kind: 'pause' | 'resume' | 'stop') => {
    const result = await window.desktop.collection[kind]()
    if (!result.ok) pushToast({ kind: 'warning', title: '操作未执行', message: result.error.message })
  }

  const exportResults = async (): Promise<void> => {
    const result = await window.desktop.collection.export(false)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '导出失败', message: result.error.message })
      return
    }
    if (result.data) pushToast({ kind: 'success', title: '导出成功', message: result.data })
  }

  const summary = useMemo(() => ({ success: task.succeeded, failed: task.failed, pending: Math.max(0, task.total - task.completed) }), [task])

  return (
    <div className="page">
      <PageHeader
        title="采集任务"
        description="导入达人主页，创建可暂停、可停止并支持部分结果导出的快照任务。"
        actions={
          <>
            <Button icon={<FileInput size={16} />} disabled={running} onClick={() => void importFile()}>文件导入</Button>
            <Button icon={<TextCursorInput size={16} />} disabled={running} onClick={() => setTextOpen(true)}>文本导入</Button>
            <Button variant="primary" icon={<Play size={16} />} disabled={!canStart} onClick={() => void start()}>开始采集</Button>
          </>
        }
      />
      <div className="page-content collection-layout">
        <section className="task-strip">
          <div><span>任务状态</span><StatusBadge status={task.status} /></div>
          <div className="task-strip__progress"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></div>
          <div className="task-strip__stats"><span>成功 {summary.success}</span><span>失败 {summary.failed}</span><span>待处理 {summary.pending}</span></div>
          <div className="task-strip__actions">
            {task.status === 'running' && <Button icon={<Pause size={15} />} onClick={() => void action('pause')}>暂停</Button>}
            {task.status === 'paused' && <Button icon={<RotateCcw size={15} />} onClick={() => void action('resume')}>继续</Button>}
            {running && <Button variant="danger" icon={<Square size={15} />} onClick={() => void action('stop')}>停止</Button>}
            {!running && retryTargets.length > 0 && <Button icon={<RotateCcw size={15} />} onClick={() => void startTargets(retryTargets)}>重试未完成 ({retryTargets.length})</Button>}
            <Button icon={<Download size={15} />} disabled={visibleTargets.every((item) => !item.snapshot)} onClick={() => void exportResults()}>导出结果</Button>
          </div>
        </section>

        <div className="collection-grid">
          <section className="table-panel">
            {visibleTargets.length === 0 ? (
              <EmptyState title="尚未导入采集目标" description="支持 Excel、TXT 与多行文本，系统会自动识别并去重达人主页。" />
            ) : (
              <table className="data-table data-table--interactive">
                <thead><tr><th>达人</th><th>小红书 ID</th><th>健康等级</th><th>状态</th><th>采集时间</th></tr></thead>
                <tbody>{visibleTargets.map((target) => <tr key={target.id} className={selectedId === target.id ? 'is-selected' : ''} onClick={() => setSelectedId(target.id)}><td><strong>{target.nickname || '待采集达人'}</strong><small>{target.pgyUrl}</small></td><td><code>{target.userId}</code></td><td>{target.healthLevel ?? '—'}</td><td><StatusBadge status={target.status} /><small>{target.statusText}</small></td><td>{target.collectedAt ? new Date(target.collectedAt).toLocaleString('zh-CN') : '—'}</td></tr>)}</tbody>
              </table>
            )}
          </section>
          <aside className="detail-panel">
            <span className="eyebrow">目标详情</span>
            {selected ? <><h2>{selected.nickname || selected.userId}</h2><dl><dt>蒲公英主页</dt><dd>{selected.pgyUrl}</dd><dt>小红书主页</dt><dd>{selected.xhsUrl}</dd><dt>结果字段</dt><dd>{Object.keys(selected.snapshot?.data ?? {}).length} 个</dd></dl><div className="error-list">{selected.errors.map((error) => <div key={`${error.source}-${error.code}`}><strong>{error.source}</strong><p>{error.message}</p></div>)}</div></> : <p className="muted-copy">选择一行查看采集来源、错误和快照信息。</p>}
          </aside>
        </div>
      </div>
      <Dialog open={textOpen} title="文本导入" onClose={() => setTextOpen(false)} footer={<><Button onClick={() => setTextOpen(false)}>取消</Button><Button variant="primary" onClick={importFromText}>导入并去重</Button></>}>
        <label className="field"><span>每行一个蒲公英或小红书达人主页</span><textarea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/..." /></label>
      </Dialog>
    </div>
  )
}