import { randomUUID } from 'node:crypto'
import type {
  Account,
  AccountCreateInput,
  AccountSessionEvent,
  AccountUpdateInput,
  AccountView,
  PasswordLoginInput
} from '@shared/models'
import { err, ok, type Result } from '@shared/result'
import type { AccountRepository } from '@infrastructure/persistence/account-repository'
import { checkPgyAccount } from '@infrastructure/xhs/account-checker'
import type {
  LoginProgress,
  PgyLoginDriver,
  PgyLoginResult
} from '@infrastructure/xhs/pgy-login-driver'

type AccountStore = Pick<AccountRepository, 'list' | 'save'>

type LoginDriver = Pick<PgyLoginDriver, 'cancel' | 'cancelAutomation'> & {
  openWebLogin: (
    onCaptured: (result: PgyLoginResult) => void,
    onProgress: LoginProgress,
    onDismissed?: () => void
  ) => Promise<Result<void>>
  passwordLogin: (
    email: string,
    password: string,
    onProgress: LoginProgress
  ) => Promise<Result<PgyLoginResult>>
}

const maskEmail = (email?: string): string | undefined => {
  if (!email) return undefined
  const [name = '', domain] = email.split('@')
  if (!domain) return `${email.slice(0, 2)}***`
  return `${name.slice(0, 2)}***@${domain}`
}

export const toAccountView = (account: Account): AccountView => ({
  id: account.id,
  remark: account.remark,
  nickname: account.nickname,
  status: account.status,
  cookiePreview: account.cookies ? `${account.cookies.slice(0, 12)}••••••••` : '',
  emailMasked: maskEmail(account.email),
  hasCredentials: Boolean(account.email && account.password),
  lastUseDate: account.lastUseDate,
  todayUseCount: account.todayUseCount,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt
})

export class AccountSessionService {
  private readonly listeners = new Set<(event: AccountSessionEvent) => void>()
  private readonly refreshFlights = new Map<string, Promise<Result<Account>>>()
  private initialCheckTimer: NodeJS.Timeout | null = null
  private periodicCheckTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly repository: AccountStore,
    private readonly loginDriver: LoginDriver,
    private readonly checkAccount: typeof checkPgyAccount = checkPgyAccount
  ) {}

  subscribe(listener: (event: AccountSessionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(): Promise<AccountView[]> {
    return (await this.repository.list()).map(toAccountView)
  }

  async getAccount(accountId: string): Promise<Account | undefined> {
    return (await this.repository.list()).find((account) => account.id === accountId)
  }

  listInternal(): Promise<Account[]> {
    return this.repository.list()
  }

  async saveUsage(accounts: Account[]): Promise<void> {
    const latest = await this.repository.list()
    const usageById = new Map(accounts.map((account) => [account.id, account]))
    await this.repository.save(
      latest.map((account) => {
        const usage = usageById.get(account.id)
        return usage
          ? {
              ...account,
              status: usage.status,
              lastUseDate: usage.lastUseDate,
              todayUseCount: usage.todayUseCount,
              updatedAt: usage.updatedAt
            }
          : account
      })
    )
  }

  async create(input: AccountCreateInput): Promise<Result<AccountView>> {
    const remark = input.remark.trim()
    const cookies = input.cookies.trim()
    if (!remark) return err('INVALID_INPUT', '备注名称不能为空')
    if (!cookies) return err('INVALID_INPUT', 'Cookies 不能为空')

    const checked = await this.checkAccount(cookies)
    if (!checked.ok) return checked

    const accounts = await this.repository.list()
    const now = new Date().toISOString()
    const duplicate = accounts.find(
      (account) => account.cookies === cookies || (input.email && account.email === input.email.trim())
    )
    const account: Account = duplicate
      ? {
          ...duplicate,
          remark,
          nickname: checked.data.nickname,
          cookies,
          email: input.email?.trim() || duplicate.email,
          password: input.password || duplicate.password,
          status: 'active',
          updatedAt: now
        }
      : {
          id: randomUUID(),
          remark,
          nickname: checked.data.nickname,
          cookies,
          email: input.email?.trim() || undefined,
          password: input.password || undefined,
          status: 'active',
          todayUseCount: 0,
          createdAt: now,
          updatedAt: now
        }
    await this.repository.save([
      ...accounts.filter((item) => item.id !== account.id),
      account
    ])
    return ok(toAccountView(account))
  }

  async update(accountId: string, patch: AccountUpdateInput): Promise<Result<AccountView>> {
    const accounts = await this.repository.list()
    const target = accounts.find((account) => account.id === accountId)
    if (!target) return err('NOT_FOUND', '账号不存在')

    const nextCookies = patch.cookies?.trim() ?? target.cookies
    if (!nextCookies) return err('INVALID_INPUT', 'Cookies 不能为空')
    const cookiesChanged = nextCookies !== target.cookies
    const checked = cookiesChanged ? await this.checkAccount(nextCookies) : null
    const account: Account = {
      ...target,
      remark: patch.remark?.trim() ?? target.remark,
      cookies: nextCookies,
      email: patch.clearCredentials ? undefined : (patch.email?.trim() ?? target.email),
      password: patch.clearCredentials ? undefined : (patch.password ?? target.password),
      nickname: checked?.ok ? checked.data.nickname : target.nickname,
      status: checked ? (checked.ok ? 'active' : 'expired') : target.status,
      updatedAt: new Date().toISOString()
    }
    await this.repository.save(accounts.map((item) => (item.id === accountId ? account : item)))
    return ok(toAccountView(account))
  }

  async remove(accountId: string): Promise<Result<void>> {
    const accounts = await this.repository.list()
    if (!accounts.some((account) => account.id === accountId)) {
      return err('NOT_FOUND', '账号不存在')
    }
    await this.repository.save(accounts.filter((account) => account.id !== accountId))
    return ok(undefined)
  }

  async check(accountId: string): Promise<Result<AccountView>> {
    const result = await this.checkInternal(accountId)
    return result.ok ? ok(toAccountView(result.data)) : result
  }

  async checkAll(): Promise<Result<AccountView[]>> {
    this.emit({
      operation: 'check-all',
      stage: 'verifying',
      message: '正在检查全部蒲公英账号'
    })
    const accounts = await this.repository.list()
    const updated: Account[] = []
    for (const account of accounts) {
      if (!account.cookies.trim()) {
        updated.push({ ...account, status: 'expired', updatedAt: new Date().toISOString() })
        continue
      }
      const checked = await this.checkAccount(account.cookies)
      updated.push({
        ...account,
        nickname: checked.ok ? checked.data.nickname : account.nickname,
        status: checked.ok ? 'active' : checked.error.code === 'AUTH_EXPIRED' ? 'expired' : 'error',
        updatedAt: new Date().toISOString()
      })
    }
    await this.repository.save(updated)
    const views = updated.map(toAccountView)
    this.emit({
      operation: 'check-all',
      stage: 'completed',
      message: `账号检查完成：${views.filter((account) => account.status === 'active').length}/${views.length} 可用`,
      accounts: views
    })
    return ok(views)
  }

  openWebLogin(remark: string): Promise<Result<void>> {
    const accountRemark = remark.trim()
    if (!accountRemark) return Promise.resolve(err('INVALID_INPUT', '请输入账号备注'))
    return this.loginDriver.openWebLogin(
      (captured) => {
        void this.saveCapturedWebAccount(captured.cookies, captured.nickname, accountRemark).catch((error) =>
          this.emit({
            operation: 'web-login',
            stage: 'failed',
            message: error instanceof Error ? error.message : '网页登录账号保存失败'
          })
        )
      },
      (stage, message) => this.emit({ operation: 'web-login', stage, message }),
      () => this.emit({ operation: 'web-login', stage: 'failed', message: '登录窗口已关闭，未完成登录' })
    )
  }

  async passwordLogin(input: PasswordLoginInput): Promise<Result<AccountView>> {
    const result = await this.loginDriver.passwordLogin(input.email, input.password, (stage, message) =>
      this.emit({ operation: 'password-login', stage, message })
    )
    if (!result.ok) {
      this.emit({ operation: 'password-login', stage: 'failed', message: result.error.message })
      return result
    }
    const saved = await this.create({
      remark: input.remark,
      cookies: result.data.cookies,
      email: input.email,
      password: input.password
    })
    if (saved.ok) {
      this.emit({
        operation: 'password-login',
        stage: 'completed',
        message: `账号 ${saved.data.remark} 登录成功`,
        accountId: saved.data.id,
        account: saved.data
      })
    }
    return saved
  }

  async refresh(accountId: string): Promise<Result<AccountView>> {
    const refreshed = await this.refreshInternal(accountId)
    return refreshed.ok ? ok(toAccountView(refreshed.data)) : refreshed
  }

  refreshInternal(accountId: string): Promise<Result<Account>> {
    const existing = this.refreshFlights.get(accountId)
    if (existing) return existing
    const flight = this.performRefresh(accountId).finally(() => this.refreshFlights.delete(accountId))
    this.refreshFlights.set(accountId, flight)
    return flight
  }

  cancelRefreshes(): void {
    this.loginDriver.cancelAutomation()
  }

  cancelLogin(): Result<void> {
    this.loginDriver.cancel()
    return ok(undefined)
  }

  startPeriodicChecks(): void {
    this.stopPeriodicChecks()
    this.initialCheckTimer = setTimeout(() => void this.checkAll(), 3000)
    this.periodicCheckTimer = setInterval(() => void this.checkAll(), 3 * 60 * 60 * 1000)
  }

  stopPeriodicChecks(): void {
    if (this.initialCheckTimer) clearTimeout(this.initialCheckTimer)
    if (this.periodicCheckTimer) clearInterval(this.periodicCheckTimer)
    this.initialCheckTimer = null
    this.periodicCheckTimer = null
  }

  private async checkInternal(accountId: string): Promise<Result<Account>> {
    const accounts = await this.repository.list()
    const target = accounts.find((account) => account.id === accountId)
    if (!target) return err('NOT_FOUND', '账号不存在')
    if (!target.cookies.trim()) return err('INVALID_INPUT', '账号 Cookies 为空')

    const checked = await this.checkAccount(target.cookies)
    const updated: Account = {
      ...target,
      nickname: checked.ok ? checked.data.nickname : target.nickname,
      status: checked.ok ? 'active' : checked.error.code === 'AUTH_EXPIRED' ? 'expired' : 'error',
      updatedAt: new Date().toISOString()
    }
    await this.repository.save(accounts.map((account) => (account.id === accountId ? updated : account)))
    return checked.ok ? ok(updated) : checked
  }

  private async performRefresh(accountId: string): Promise<Result<Account>> {
    const accounts = await this.repository.list()
    const target = accounts.find((account) => account.id === accountId)
    if (!target) return err('NOT_FOUND', '账号不存在')
    if (!target.email || !target.password) {
      return err('INVALID_INPUT', '该账号没有保存账号密码，无法自动更新 Cookies')
    }

    this.emit({
      operation: 'refresh',
      stage: 'refreshing',
      message: `正在更新账号 ${target.remark || target.nickname} 的 Cookies`,
      accountId
    })
    const login = await this.loginDriver.passwordLogin(target.email, target.password, (stage, message) =>
      this.emit({ operation: 'refresh', stage, message, accountId })
    )
    if (!login.ok) {
      const expired = { ...target, status: 'expired' as const, updatedAt: new Date().toISOString() }
      await this.repository.save(accounts.map((account) => (account.id === accountId ? expired : account)))
      this.emit({ operation: 'refresh', stage: 'failed', message: login.error.message, accountId })
      return login
    }

    const refreshed: Account = {
      ...target,
      cookies: login.data.cookies,
      nickname: login.data.nickname || target.nickname,
      status: 'active',
      updatedAt: new Date().toISOString()
    }
    await this.repository.save(accounts.map((account) => (account.id === accountId ? refreshed : account)))
    this.emit({
      operation: 'refresh',
      stage: 'completed',
      message: `账号 ${refreshed.remark || refreshed.nickname} 的 Cookies 已更新`,
      accountId,
      account: toAccountView(refreshed)
    })
    return ok(refreshed)
  }

  private async saveCapturedWebAccount(cookies: string, nickname: string, remark: string): Promise<void> {
    const accounts = await this.repository.list()
    const now = new Date().toISOString()
    const duplicate = accounts.find((account) => account.cookies === cookies)
    const account: Account = duplicate
      ? { ...duplicate, remark: remark || duplicate.remark, nickname: nickname || duplicate.nickname, status: 'active', updatedAt: now }
      : {
          id: randomUUID(),
          remark,
          nickname,
          cookies,
          status: 'active',
          todayUseCount: 0,
          createdAt: now,
          updatedAt: now
        }
    await this.repository.save([
      ...accounts.filter((item) => item.id !== account.id),
      account
    ])
    this.emit({
      operation: 'web-login',
      stage: 'completed',
      message: `已添加账号 ${account.nickname || account.remark}`,
      accountId: account.id,
      account: toAccountView(account)
    })
  }

  private emit(event: AccountSessionEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}