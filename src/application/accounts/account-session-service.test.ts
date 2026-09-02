import { describe, expect, it } from 'vitest'
import type { Account } from '../../shared/models'
import { ok } from '../../shared/result'
import { AccountSessionService, toAccountView } from './account-session-service'

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  remark: '主账号',
  nickname: '达人账号',
  cookies: 'old-cookie-value',
  email: 'owner@example.com',
  password: 'secret-password',
  status: 'active',
  todayUseCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
})

const store = (initial: Account[]) => {
  let value = structuredClone(initial)
  return {
    list: async () => structuredClone(value),
    save: async (accounts: Account[]) => {
      value = structuredClone(accounts)
      return structuredClone(accounts)
    },
    current: () => structuredClone(value)
  }
}

describe('AccountSessionService', () => {
  it('does not expose cookies or passwords to renderer views', () => {
    const view = toAccountView(account())
    expect(view.cookiePreview).toContain('••••')
    expect(view.emailMasked).toBe('ow***@example.com')
    expect(view.hasCredentials).toBe(true)
    expect(view).not.toHaveProperty('cookies')
    expect(view).not.toHaveProperty('password')
  })

  it('merges concurrent refresh requests for the same account', async () => {
    const repository = store([account()])
    let loginCount = 0
    const loginDriver = {
      cancel: () => undefined,
      cancelAutomation: () => undefined,
      openWebLogin: async () => ok(undefined),
      passwordLogin: async () => {
        loginCount += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return ok({ cookies: 'new-cookie-value', nickname: '刷新昵称' })
      }
    }
    const service = new AccountSessionService(
      repository,
      loginDriver,
      async () => ok({ nickname: '达人账号' })
    )

    const [first, second] = await Promise.all([
      service.refresh('account-1'),
      service.refresh('account-1')
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(loginCount).toBe(1)
    expect(repository.current()[0]?.cookies).toBe('new-cookie-value')
  })

  it('stores credentials after password login but only returns a safe view', async () => {
    const repository = store([])
    const loginDriver = {
      cancel: () => undefined,
      cancelAutomation: () => undefined,
      openWebLogin: async () => ok(undefined),
      passwordLogin: async () => ok({ cookies: 'captured-cookie-value', nickname: '登录昵称' })
    }
    const service = new AccountSessionService(
      repository,
      loginDriver,
      async () => ok({ nickname: '登录昵称' })
    )

    const result = await service.passwordLogin({
      remark: '自动登录账号',
      email: 'owner@example.com',
      password: 'secret-password'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.hasCredentials).toBe(true)
    expect(result.data).not.toHaveProperty('password')
    expect(repository.current()[0]?.password).toBe('secret-password')
  })
})