import type { TargetStatus, AccountStatus, TaskStatus } from '@shared/models'

const labels: Record<string, string> = {
  unchecked: '未检查',
  checking: '检查中',
  active: '正常',
  expired: '已失效',
  error: '异常',
  idle: '空闲',
  preparing: '准备中',
  running: '运行中',
  paused: '已暂停',
  stopping: '停止中',
  cancelled: '已停止',
  completed: '已完成',
  failed: '失败',
  pending: '待处理',
  partial: '部分完成',
  success: '成功',
  unrecognized: '未识别'
}

export const StatusBadge = ({ status }: { status: AccountStatus | TaskStatus | TargetStatus | string }) => (
  <span className={`status-badge status-badge--${status}`}>{labels[status] ?? status}</span>
)