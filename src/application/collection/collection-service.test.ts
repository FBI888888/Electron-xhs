import { describe, expect, it } from 'vitest'
import type { Account, CollectionTaskInput, CollectionTaskState } from '../../shared/models'
import { err, ok } from '../../shared/result'
import { CollectionService } from './collection-service'

const makeAccount = (id: string, cookies: string): Account => ({
  id,
  remark: id,
  nickname: id,
  cookies,
  email: `${id}@example.com`,
  password: 'password',
  status: 'active',
  todayUseCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

const input: CollectionTaskInput = {
  targets: [
    {
      userId: 'target-1',
      pgyUrl: 'https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/target-1',
      xhsUrl: 'https://www.xiaohongshu.com/user/profile/target-1'
    }
  ],
  settings: {
    schemaVersion: 1,
    output: { filename: 'test.xlsx', directory: '' },
    performanceFields: [],
    maxCount: 10,
    concurrency: 1,
    throttleMs: 0,
    splitFansProfile: false
  }
}

const runTask = async (service: CollectionService): Promise<CollectionTaskState> => {
  const terminal = new Promise<CollectionTaskState>((resolve) => {
    const unsubscribe = service.subscribe((event) => {
      if (event.type === 'state' && ['completed', 'failed', 'cancelled'].includes(event.state.status)) {
        unsubscribe()
        resolve(event.state)
      }
    })
  })
  const started = await service.start(input)
  expect(started.ok).toBe(true)
  return terminal
}

describe('CollectionService account recovery', () => {
  it('refreshes an expired account and retries without consuming quota twice', async () => {
    const original = makeAccount('account-1', 'old-cookie')
    let accounts = [original]
    let savedUsage: Account[] = []
    const usedCookies: string[] = []
    const sessions = {
      cancelRefreshes: () => undefined,
      listInternal: async () => structuredClone(accounts),
      saveUsage: async (value: Account[]) => {
        savedUsage = structuredClone(value)
      },
      refreshInternal: async () => {
        accounts = [{ ...original, cookies: 'new-cookie', status: 'active' as const }]
        return ok(accounts[0]!)
      }
    }
    const collector = {
      collect: async (_userId: string, cookies: string) => {
        usedCookies.push(cookies)
        if (cookies === 'old-cookie') throw { code: 'AUTH_EXPIRED', message: 'Cookie 已失效' }
        return { data: { name: '测试达人' }, errors: [] }
      }
    }

    const state = await runTask(new CollectionService(sessions, collector))

    expect(state.status).toBe('completed')
    expect(usedCookies).toEqual(['old-cookie', 'new-cookie'])
    expect(savedUsage[0]?.todayUseCount).toBe(1)
    expect(state.targets[0]?.snapshot?.accountId).toBe('account-1')
  })

  it('rotates to another account when refresh fails and refunds the failed reservation', async () => {
    const first = makeAccount('account-1', 'expired-cookie')
    const second = makeAccount('account-2', 'working-cookie')
    let savedUsage: Account[] = []
    const sessions = {
      cancelRefreshes: () => undefined,
      listInternal: async () => [first, second],
      saveUsage: async (value: Account[]) => {
        savedUsage = structuredClone(value)
      },
      refreshInternal: async () => err('AUTH_EXPIRED', '账号密码登录失败')
    }
    const collector = {
      collect: async (_userId: string, cookies: string) => {
        if (cookies === 'expired-cookie') throw { code: 'AUTH_EXPIRED', message: 'Cookie 已失效' }
        return { data: { name: '测试达人' }, errors: [] }
      }
    }

    const state = await runTask(new CollectionService(sessions, collector))

    expect(state.status).toBe('completed')
    expect(state.targets[0]?.snapshot?.accountId).toBe('account-2')
    expect(savedUsage.find((account) => account.id === 'account-1')?.todayUseCount).toBe(0)
    expect(savedUsage.find((account) => account.id === 'account-2')?.todayUseCount).toBe(1)
  })
})