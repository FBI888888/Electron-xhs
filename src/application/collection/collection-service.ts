import { randomUUID } from 'node:crypto'
import { allocateAccount } from '@domain/account-allocation'
import { createIdleTaskState, reduceTaskState } from '@domain/task-machine'
import type {
  Account,
  CollectionTarget,
  CollectionTaskInput,
  CollectionTaskState
} from '@shared/models'
import { err, ok, toAppError, type Result } from '@shared/result'
import type { CollectionEvent } from '@shared/desktop-api'
import type { AccountSessionService } from '@application/accounts/account-session-service'
import type { LegacyCollectorAdapter, CollectedProfile } from '@infrastructure/xhs/legacy-collector-adapter'

type AccountSessions = Pick<
  AccountSessionService,
  'listInternal' | 'saveUsage' | 'refreshInternal' | 'cancelRefreshes'
>

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const asTarget = (target: CollectionTaskInput['targets'][number]): CollectionTarget => ({
  id: randomUUID(),
  ...target,
  nickname: '',
  status: 'pending',
  statusText: '待采集',
  errors: []
})

interface CollectionAttempt {
  result: CollectedProfile
  account: Account
}

export class CollectionService {
  private state: CollectionTaskState = createIdleTaskState()
  private listeners = new Set<(event: CollectionEvent) => void>()
  private abortController: AbortController | null = null
  private accounts: Account[] = []
  private accountIndex = 0
  private queueIndex = 0

  constructor(
    private readonly accountSessions: AccountSessions,
    private readonly collector: LegacyCollectorAdapter
  ) {}

  getState(): CollectionTaskState {
    return structuredClone(this.state)
  }

  subscribe(listener: (event: CollectionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(input: CollectionTaskInput): Promise<Result<CollectionTaskState>> {
    if (['preparing', 'running', 'paused', 'stopping'].includes(this.state.status)) {
      return err('CONFLICT', '已有采集任务正在运行')
    }

    this.accounts = await this.accountSessions.listInternal()
    if (!this.accounts.some((account) => account.status === 'active')) {
      return err('INVALID_INPUT', '没有可用账号，请先验证账号状态')
    }

    const startedAt = new Date().toISOString()
    this.state = reduceTaskState(this.state, {
      type: 'prepare',
      taskId: randomUUID(),
      total: input.targets.length,
      startedAt
    })
    this.state = {
      ...reduceTaskState(this.state, { type: 'start' }),
      targets: input.targets.map(asTarget)
    }
    this.abortController = new AbortController()
    this.accountIndex = 0
    this.queueIndex = 0
    this.emitState()
    this.log('info', `开始采集 ${input.targets.length} 个目标`)
    void this.run(input)
    return ok(this.getState())
  }

  pause(): Result<CollectionTaskState> {
    const next = reduceTaskState(this.state, { type: 'pause' })
    if (next === this.state) return err('CONFLICT', '当前任务无法暂停')
    this.state = next
    this.emitState()
    return ok(this.getState())
  }

  resume(): Result<CollectionTaskState> {
    const next = reduceTaskState(this.state, { type: 'resume' })
    if (next === this.state) return err('CONFLICT', '当前任务无法恢复')
    this.state = next
    this.emitState()
    return ok(this.getState())
  }

  stop(): Result<CollectionTaskState> {
    const next = reduceTaskState(this.state, { type: 'stop' })
    if (next === this.state) return err('CONFLICT', '当前任务无法停止')
    this.state = next
    this.abortController?.abort()
    this.accountSessions.cancelRefreshes()
    this.emitState()
    return ok(this.getState())
  }

  private async run(input: CollectionTaskInput): Promise<void> {
    const workerCount = input.settings.concurrency
    try {
      await Promise.all(Array.from({ length: workerCount }, () => this.worker(input)))
      await this.accountSessions.saveUsage(this.accounts)

      if (this.state.status === 'stopping' || this.abortController?.signal.aborted) {
        this.cancelUnsettledTargets()
        this.state = reduceTaskState(this.state, {
          type: 'cancel',
          finishedAt: new Date().toISOString()
        })
      } else {
        this.state = reduceTaskState(this.state, {
          type: 'complete',
          finishedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      const appError = toAppError(error, '采集任务异常')
      this.state = reduceTaskState(this.state, {
        type: 'fail',
        message: appError.message,
        finishedAt: new Date().toISOString()
      })
      this.log('error', appError.message)
    } finally {
      this.abortController = null
      this.emitState()
    }
  }

  private async worker(input: CollectionTaskInput): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      await this.waitWhilePaused()
      if (this.abortController?.signal.aborted) return

      const index = this.queueIndex
      this.queueIndex += 1
      if (index >= this.state.targets.length) return

      const allocation = allocateAccount(
        this.accounts,
        this.accountIndex,
        input.settings.maxCount
      )
      if (!allocation) {
        this.updateTarget(index, {
          status: 'failed',
          statusText: '失败：所有账号均达到今日额度',
          collectedAt: new Date().toISOString(),
          errors: [
            {
              source: 'account',
              code: 'UNAVAILABLE',
              message: '所有账号均达到今日额度',
              retryable: false
            }
          ]
        })
        continue
      }

      this.accounts = allocation.accounts
      this.accountIndex = allocation.nextIndex
      const target = this.state.targets[index]
      if (!target) continue
      this.updateTarget(index, {
        status: 'running',
        statusText: `采集中 · ${allocation.account.remark || allocation.account.nickname || '账号'}`
      })

      try {
        const attempt = await this.collectWithRecovery(target, allocation.account, input)
        const { result, account } = attempt
        if (this.abortController?.signal.aborted || this.state.status === 'stopping') {
          this.updateTarget(index, {
            status: 'cancelled',
            statusText: '已停止',
            collectedAt: new Date().toISOString()
          })
          return
        }
        const partial = result.errors.length > 0
        this.updateTarget(index, {
          nickname: String(result.data.name ?? ''),
          healthLevel: result.data.currentLevel as string | number | undefined,
          status: partial ? 'partial' : 'completed',
          statusText: partial ? `部分完成 · ${result.errors.length} 项异常` : '已完成',
          collectedAt: new Date().toISOString(),
          errors: result.errors,
          snapshot: {
            schemaVersion: 1,
            userId: target.userId,
            capturedAt: new Date().toISOString(),
            accountId: account.id,
            data: result.data
          }
        })
      } catch (error) {
        const appError = toAppError(error, '采集失败')
        this.updateTarget(index, {
          status: this.abortController?.signal.aborted ? 'cancelled' : 'failed',
          statusText: this.abortController?.signal.aborted ? '已停止' : `失败：${appError.message}`,
          collectedAt: new Date().toISOString(),
          errors: [
            {
              source: 'blogger',
              code: appError.code,
              message: appError.message,
              retryable: appError.retryable ?? false
            }
          ]
        })
      }

      if (input.settings.throttleMs > 0 && !this.abortController?.signal.aborted) {
        await wait(input.settings.throttleMs)
      }
    }
  }

  private async collectWithRecovery(
    target: CollectionTarget,
    initialAccount: Account,
    input: CollectionTaskInput
  ): Promise<CollectionAttempt> {
    let account = initialAccount
    let networkRetried = false
    const refreshedAccounts = new Set<string>()
    const excludedAccounts = new Set<string>()

    while (!this.abortController?.signal.aborted) {
      let result: CollectedProfile | null = null
      let recoveryError: ReturnType<typeof toAppError>
      try {
        result = await this.collector.collect(
          target.userId,
          account.cookies,
          input.settings.performanceFields
        )
        const recoverable = result.errors.find((error) =>
          ['AUTH_EXPIRED', 'NETWORK', 'RATE_LIMITED'].includes(error.code)
        )
        if (!recoverable) return { result, account }
        recoveryError = toAppError(recoverable)
      } catch (error) {
        recoveryError = toAppError(error, '采集失败')
      }

      if (recoveryError.code === 'NETWORK' && !networkRetried) {
        networkRetried = true
        this.log('warning', `账号 ${account.remark || account.nickname} 网络异常，正在退避重试`)
        await wait(1000)
        continue
      }

      if (recoveryError.code === 'AUTH_EXPIRED' && !refreshedAccounts.has(account.id)) {
        refreshedAccounts.add(account.id)
        this.log('warning', `账号 ${account.remark || account.nickname} 登录失效，正在自动更新 Cookies`)
        const refreshed = await this.accountSessions.refreshInternal(account.id)
        if (refreshed.ok) {
          const usage = this.accounts.find((item) => item.id === account.id)
          account = {
            ...refreshed.data,
            lastUseDate: usage?.lastUseDate,
            todayUseCount: usage?.todayUseCount ?? refreshed.data.todayUseCount
          }
          this.replaceLocalAccount(account)
          this.log('info', `账号 ${account.remark || account.nickname} Cookies 已更新，正在重试当前目标`)
          networkRetried = false
          continue
        }
        this.log('warning', `账号 ${account.remark || account.nickname} 自动更新失败：${refreshed.error.message}`)
      }

      if (recoveryError.code === 'RATE_LIMITED') {
        this.log('warning', `账号 ${account.remark || account.nickname} 触发频率限制，正在轮换账号`)
        await wait(1500)
      }

      if (recoveryError.code === 'AUTH_EXPIRED') {
        this.replaceLocalAccount({ ...account, status: 'expired', updatedAt: new Date().toISOString() })
      }
      excludedAccounts.add(account.id)
      const next = allocateAccount(
        this.accounts,
        this.accountIndex,
        input.settings.maxCount,
        new Date(),
        excludedAccounts
      )
      if (!next) {
        if (result) return { result, account }
        throw recoveryError
      }

      this.accounts = next.accounts
      this.releaseAccountUsage(account.id)
      this.accountIndex = next.nextIndex
      account = next.account
      networkRetried = false
      this.log('info', `已轮换到账号 ${account.remark || account.nickname} 重试当前目标`)
    }

    throw { code: 'CANCELLED', message: '采集已停止' }
  }

  private replaceLocalAccount(account: Account): void {
    this.accounts = this.accounts.map((item) => (item.id === account.id ? account : item))
  }

  private releaseAccountUsage(accountId: string): void {
    const today = new Date().toISOString().slice(0, 10)
    this.accounts = this.accounts.map((account) =>
      account.id === accountId && account.lastUseDate === today
        ? { ...account, todayUseCount: Math.max(0, account.todayUseCount - 1) }
        : account
    )
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.state.status === 'paused' && !this.abortController?.signal.aborted) {
      await wait(100)
    }
  }

  private cancelUnsettledTargets(): void {
    const now = new Date().toISOString()
    const targets = this.state.targets.map((target) =>
      ['pending', 'running'].includes(target.status)
        ? { ...target, status: 'cancelled' as const, statusText: '已停止', collectedAt: now }
        : target
    )
    this.state = {
      ...this.state,
      targets,
      completed: targets.filter((target) =>
        ['completed', 'partial', 'failed', 'cancelled'].includes(target.status)
      ).length,
      succeeded: targets.filter((target) => ['completed', 'partial'].includes(target.status)).length,
      failed: targets.filter((target) => target.status === 'failed').length
    }
    this.emitState()
  }

  private updateTarget(index: number, patch: Partial<CollectionTarget>): void {
    const targets = this.state.targets.map((target, targetIndex) =>
      targetIndex === index ? { ...target, ...patch } : target
    )
    const terminal = targets.filter((target) =>
      ['completed', 'partial', 'failed', 'cancelled'].includes(target.status)
    )
    this.state = {
      ...this.state,
      targets,
      completed: terminal.length,
      succeeded: targets.filter((target) => ['completed', 'partial'].includes(target.status)).length,
      failed: targets.filter((target) => target.status === 'failed').length
    }
    this.emitState()
  }

  private emitState(): void {
    const event: CollectionEvent = { type: 'state', state: this.getState() }
    this.listeners.forEach((listener) => listener(event))
  }

  private log(level: 'info' | 'warning' | 'error', message: string): void {
    const event: CollectionEvent = { type: 'log', level, message, at: new Date().toISOString() }
    this.listeners.forEach((listener) => listener(event))
  }
}