import { describe, expect, it } from 'vitest'
import type { Account } from '@shared/models'
import { allocateAccount } from './account-allocation'

const account = (id: string, count: number, status: Account['status'] = 'active'): Account => ({
  id,
  remark: id,
  nickname: id,
  cookies: `${id}=cookie`,
  status,
  lastUseDate: '2026-07-19',
  todayUseCount: count,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z'
})

describe('account allocation', () => {
  it('rotates past exhausted and inactive accounts', () => {
    const result = allocateAccount(
      [account('a', 2), account('b', 0, 'expired'), account('c', 1)],
      0,
      2,
      new Date('2026-07-19T12:00:00.000Z')
    )
    expect(result?.account.id).toBe('c')
    expect(result?.account.todayUseCount).toBe(2)
    expect(result?.nextIndex).toBe(0)
  })

  it('resets the daily count on a new day', () => {
    const result = allocateAccount([account('a', 99)], 0, 2, new Date('2026-07-20T12:00:00.000Z'))
    expect(result?.account.todayUseCount).toBe(1)
    expect(result?.account.lastUseDate).toBe('2026-07-20')
  })

  it('excludes accounts already attempted by the same target', () => {
    const result = allocateAccount(
      [account('a', 0), account('b', 0)],
      0,
      2,
      new Date('2026-07-19T12:00:00.000Z'),
      new Set(['a'])
    )
    expect(result?.account.id).toBe('b')
  })
})