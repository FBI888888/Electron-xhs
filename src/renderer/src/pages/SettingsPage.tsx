import { useState } from 'react'
import { FolderOpen, Save } from 'lucide-react'
import { PERFORMANCE_FIELDS } from '@domain/performance-fields'
import type { CollectionConcurrency, CollectionSettings } from '@shared/models'
import { Button } from '@renderer/components/Button'
import { PageHeader } from '@renderer/components/PageHeader'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

export const SettingsPage = () => {
  const stored = useAppStore((state) => state.settings)
  const persist = useAppStore((state) => state.persistSettings)
  const pushToast = useToastStore((state) => state.push)
  const [draft, setDraft] = useState<CollectionSettings>(stored)

  const save = async () => {
    if (await persist(draft)) {
      pushToast({ kind: 'success', title: '设置已保存', message: '新任务将使用当前配置' })
    } else {
      pushToast({ kind: 'error', title: '设置保存失败', message: '请检查输入内容后重试' })
    }
  }

  const chooseDirectory = async () => {
    const result = await window.desktop.settings.chooseDirectory()
    if (!result.ok) {
      pushToast({ kind: 'error', title: '无法选择目录', message: result.error.message })
      return
    }
    if (result.data) setDraft({ ...draft, output: { ...draft.output, directory: result.data } })
  }

  const toggleField = (id: string) => {
    const selected = new Set(draft.performanceFields)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    setDraft({ ...draft, performanceFields: [...selected] })
  }

  return (
    <div className="page">
      <PageHeader title="采集设置" description="统一管理输出、字段范围、账号额度与请求节奏。" actions={<Button variant="primary" icon={<Save size={16} />} onClick={() => void save()}>保存设置</Button>} />
      <div className="page-content page-content--scroll settings-layout">
        <section className="settings-section">
          <div className="settings-section__heading"><span className="eyebrow">输出</span><h2>本地快照文件</h2><p>未选择目录时，导出操作会询问保存位置。</p></div>
          <div className="form-grid settings-section__body">
            <label className="field"><span>默认文件名</span><input value={draft.output.filename} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, filename: event.target.value } })} /></label>
            <label className="field field--full"><span>默认目录</span><div className="inline-field"><input readOnly value={draft.output.directory} placeholder="未设置" /><Button icon={<FolderOpen size={15} />} onClick={() => void chooseDirectory()}>选择目录</Button></div></label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><span className="eyebrow">任务策略</span><h2>并发与账号额度</h2><p>更高并发会提高速度，也会增加账号触发限制的概率。</p></div>
          <div className="form-grid settings-section__body">
            <label className="field"><span>并发数量</span><select value={draft.concurrency} onChange={(event) => setDraft({ ...draft, concurrency: Number(event.target.value) as CollectionConcurrency })}>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} 并发{value === 1 ? ' · 最稳定' : value === 2 ? ' · 推荐' : ' · 风控风险较高'}</option>)}</select></label>
            <label className="field"><span>单账号每日额度</span><input type="number" min={1} max={99999} value={draft.maxCount} onChange={(event) => setDraft({ ...draft, maxCount: Number(event.target.value) })} /></label>
            <label className="field"><span>目标间隔（毫秒）</span><input type="number" min={0} max={60000} step={100} value={draft.throttleMs} onChange={(event) => setDraft({ ...draft, throttleMs: Number(event.target.value) })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={draft.splitFansProfile} onChange={(event) => setDraft({ ...draft, splitFansProfile: event.target.checked })} /><span><strong>拆分粉丝画像字段</strong><small>导出时将画像分布展开为独立列</small></span></label>
          </div>
        </section>

        <section className="settings-section settings-section--vertical">
          <div className="settings-section__heading"><span className="eyebrow">字段范围</span><h2>数据表现组合</h2><p>共选择 {draft.performanceFields.length} / {PERFORMANCE_FIELDS.length} 组。</p><div className="settings-section__actions"><Button onClick={() => setDraft({ ...draft, performanceFields: PERFORMANCE_FIELDS.map((field) => field.id) })}>全选</Button><Button onClick={() => setDraft({ ...draft, performanceFields: [] })}>取消全选</Button></div></div>
          <div className="field-matrix">
            {(['daily', 'cooperation'] as const).map((business) => (
              <div key={business} className="field-matrix__group"><h3>{business === 'daily' ? '日常笔记' : '合作笔记'}</h3><div>{PERFORMANCE_FIELDS.filter((field) => field.business === business).map((field) => <label key={field.id} className="choice-card"><input type="checkbox" checked={draft.performanceFields.includes(field.id)} onChange={() => toggleField(field.id)} /><span>{field.label.replace(`${business === 'daily' ? '日常笔记' : '合作笔记'}-`, '')}</span></label>)}</div></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}