import type { CollectionTaskState, TaskStatus } from '@shared/models'

export type TaskAction =
  | { type: 'prepare'; taskId: string; total: number; startedAt: string }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'cancel'; finishedAt: string }
  | { type: 'complete'; finishedAt: string }
  | { type: 'fail'; message: string; finishedAt: string }
  | { type: 'reset' }

export const createIdleTaskState = (): CollectionTaskState => ({
  id: null,
  status: 'idle',
  targets: [],
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0
})

const transitions: Record<TaskStatus, TaskAction['type'][]> = {
  idle: ['prepare'],
  preparing: ['start', 'fail', 'stop'],
  running: ['pause', 'stop', 'complete', 'fail'],
  paused: ['resume', 'stop', 'fail'],
  stopping: ['cancel', 'fail'],
  cancelled: ['reset', 'prepare'],
  completed: ['reset', 'prepare'],
  failed: ['reset', 'prepare']
}

export const canTransition = (status: TaskStatus, action: TaskAction['type']): boolean =>
  transitions[status]?.includes(action) ?? false

export const reduceTaskState = (
  state: CollectionTaskState,
  action: TaskAction
): CollectionTaskState => {
  if (!canTransition(state.status, action.type)) return state

  switch (action.type) {
    case 'prepare':
      return {
        ...createIdleTaskState(),
        id: action.taskId,
        status: 'preparing',
        total: action.total,
        startedAt: action.startedAt
      }
    case 'start':
      return { ...state, status: 'running' }
    case 'pause':
      return { ...state, status: 'paused', message: '任务已暂停' }
    case 'resume':
      return { ...state, status: 'running', message: undefined }
    case 'stop':
      return { ...state, status: 'stopping', message: '正在停止任务' }
    case 'cancel':
      return { ...state, status: 'cancelled', finishedAt: action.finishedAt, message: '任务已停止' }
    case 'complete':
      return { ...state, status: 'completed', finishedAt: action.finishedAt, message: '任务已完成' }
    case 'fail':
      return { ...state, status: 'failed', finishedAt: action.finishedAt, message: action.message }
    case 'reset':
      return createIdleTaskState()
  }
}