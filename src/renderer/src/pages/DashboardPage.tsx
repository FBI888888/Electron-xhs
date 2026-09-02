import { ArrowRight, CheckCircle2, CircleAlert, Clock3, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useAppStore } from '@renderer/store/app-store'

export const DashboardPage = () => {
  const accounts = useAppStore((state) => state.accounts)
  const task = useAppStore((state) => state.task)
  const activeAccounts = accounts.filter((account) => account.status === 'active').length
  const progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0

  return (
    <div className="page">
      <PageHeader title="工作台" description="查看账号可用性、当前任务和常用操作。" />
      <div className="page-content page-content--scroll">
        <section className="metric-grid">
          <article className="metric metric--primary">
            <span>当前任务</span>
            <strong>{task.status === 'idle' ? '暂无任务' : `${task.completed} / ${task.total}`}</strong>
            <div className="metric__footer"><StatusBadge status={task.status} /><span>{progress}%</span></div>
          </article>
          <article className="metric">
            <span>可用账号</span>
            <strong>{activeAccounts}</strong>
            <div className="metric__footer"><Users size={15} /><span>共 {accounts.length} 个账号</span></div>
          </article>
          <article className="metric">
            <span>成功快照</span>
            <strong>{task.succeeded}</strong>
            <div className="metric__footer"><CheckCircle2 size={15} /><span>包含部分完成</span></div>
          </article>
          <article className="metric">
            <span>失败目标</span>
            <strong>{task.failed}</strong>
            <div className="metric__footer"><CircleAlert size={15} /><span>可在任务页查看原因</span></div>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="section-panel section-panel--wide">
            <div className="section-heading">
              <div><span className="eyebrow">运行状态</span><h2>采集任务</h2></div>
              <Link to="/collection" className="text-link">打开任务页 <ArrowRight size={15} /></Link>
            </div>
            {task.status === 'idle' ? (
              <div className="compact-empty"><Clock3 size={20} /><span>导入达人主页后即可创建采集任务。</span></div>
            ) : (
              <>
                <div className="progress-row"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></div>
                <div className="task-summary-row">
                  <span>已处理 {task.completed}</span><span>成功 {task.succeeded}</span><span>失败 {task.failed}</span>
                  <span>{task.message || '任务执行中'}</span>
                </div>
              </>
            )}
          </article>
          <article className="section-panel">
            <div className="section-heading"><div><span className="eyebrow">建议操作</span><h2>开始前检查</h2></div></div>
            <ul className="check-list">
              <li className={activeAccounts > 0 ? 'is-done' : ''}>至少有一个已验证账号</li>
              <li className={useAppStore.getState().settings.output.filename ? 'is-done' : ''}>确认导出文件名称</li>
              <li>根据账号承载能力设置并发与节流</li>
            </ul>
          </article>
        </section>
      </div>
    </div>
  )
}