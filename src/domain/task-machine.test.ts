import { describe, expect, it } from 'vitest'
import { createIdleTaskState, reduceTaskState } from './task-machine'

describe('collection task machine', () => {
  it('follows prepare, run, pause, resume and complete transitions', () => {
    let state = createIdleTaskState()
    state = reduceTaskState(state, { type: 'prepare', taskId: 'task-1', total: 2, startedAt: 'start' })
    state = reduceTaskState(state, { type: 'start' })
    state = reduceTaskState(state, { type: 'pause' })
    expect(state.status).toBe('paused')
    state = reduceTaskState(state, { type: 'resume' })
    state = reduceTaskState(state, { type: 'complete', finishedAt: 'finish' })
    expect(state.status).toBe('completed')
  })

  it('ignores illegal transitions', () => {
    const idle = createIdleTaskState()
    expect(reduceTaskState(idle, { type: 'pause' })).toBe(idle)
  })
})