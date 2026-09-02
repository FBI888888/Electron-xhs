import { BrowserWindow, session } from 'electron'
import type { Result } from '@shared/result'
import { err, ok } from '@shared/result'
import { checkPgyAccount } from './account-checker'

export interface PgyLoginResult {
  cookies: string
  nickname: string
}

export type LoginProgress = (stage: 'opening' | 'waiting' | 'submitting' | 'verifying', message: string) => void

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const cookieHeader = async (targetSession: Electron.Session): Promise<string> => {
  const cookies = await targetSession.cookies.get({ domain: '.xiaohongshu.com' })
  return cookies
    .filter((cookie) => cookie.name)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

const clearSession = async (targetSession: Electron.Session): Promise<void> => {
  await Promise.allSettled([targetSession.clearStorageData(), targetSession.clearCache()])
}

export class PgyLoginDriver {
  private webLoginWindow: BrowserWindow | null = null
  private automationWindow: BrowserWindow | null = null
  private counter = 0
  private automationQueue: Promise<void> = Promise.resolve()
  private automationGeneration = 0

  constructor(private readonly parent: () => BrowserWindow | null) {}

  async openWebLogin(
    onCaptured: (result: PgyLoginResult) => void,
    onProgress: LoginProgress
  ): Promise<Result<void>> {
    if (this.webLoginWindow && !this.webLoginWindow.isDestroyed()) {
      this.webLoginWindow.show()
      this.webLoginWindow.focus()
      return ok(undefined)
    }

    onProgress('opening', '正在打开蒲公英登录窗口')
    const partition = `memory-pgy-login-${Date.now()}-${this.counter++}`
    const loginSession = session.fromPartition(partition, { cache: false })
    await clearSession(loginSession)

    const window = new BrowserWindow({
      width: 1200,
      height: 820,
      show: false,
      parent: this.parent() ?? undefined,
      title: '蒲公英平台 - 登录获取 Cookies',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition
      }
    })
    this.webLoginWindow = window

    let captured = false
    let pendingCookies = ''
    let checking = false
    const capture = async (): Promise<void> => {
      if (captured || checking || window.isDestroyed()) return
      checking = true
      try {
        const cookies = pendingCookies || (await cookieHeader(loginSession))
        if (!cookies) return
        onProgress('verifying', '正在验证登录状态')
        const checked = await checkPgyAccount(cookies)
        if (!checked.ok) {
          pendingCookies = ''
          return
        }
        captured = true
        onCaptured({ cookies, nickname: checked.data.nickname })
        window.close()
      } finally {
        checking = false
      }
    }

    loginSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/user/info*'] },
      (details, callback) => {
        const cookies = details.requestHeaders.Cookie ?? details.requestHeaders.cookie
        if (!captured && typeof cookies === 'string') pendingCookies = cookies
        callback({ requestHeaders: details.requestHeaders })
      }
    )
    loginSession.webRequest.onCompleted(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/user/info*'] },
      (details) => {
        if (details.statusCode === 200) void capture()
      }
    )

    const timer = setInterval(() => void capture(), 1500)
    window.once('ready-to-show', () => {
      window.show()
      onProgress('waiting', '请在登录窗口中完成登录')
    })
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) onProgress('waiting', `页面加载失败：${description}`)
    })
    window.on('closed', () => {
      clearInterval(timer)
      void clearSession(loginSession)
      if (this.webLoginWindow === window) this.webLoginWindow = null
    })

    try {
      await window.loadURL('https://pgy.xiaohongshu.com/')
      return ok(undefined)
    } catch (error) {
      if (!window.isDestroyed()) window.close()
      return err('NETWORK', error instanceof Error ? error.message : '登录页面加载失败', {
        retryable: true
      })
    }
  }

  passwordLogin(
    email: string,
    password: string,
    onProgress: LoginProgress
  ): Promise<Result<PgyLoginResult>> {
    const generation = this.automationGeneration
    const run = async (): Promise<Result<PgyLoginResult>> =>
      generation === this.automationGeneration
        ? this.performPasswordLogin(email, password, onProgress)
        : err('CANCELLED', '登录操作已取消')
    const result = this.automationQueue.then(run, run)
    this.automationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  cancelAutomation(): void {
    this.automationGeneration += 1
    this.automationWindow?.close()
  }

  cancel(): void {
    this.webLoginWindow?.close()
    this.cancelAutomation()
  }

  private async performPasswordLogin(
    email: string,
    password: string,
    onProgress: LoginProgress
  ): Promise<Result<PgyLoginResult>> {
    if (!email.trim() || !password) return err('INVALID_INPUT', '邮箱或密码不能为空')

    onProgress('opening', '正在启动安全登录会话')
    const partition = `memory-pgy-password-${Date.now()}-${this.counter++}`
    const loginSession = session.fromPartition(partition, { cache: false })
    await clearSession(loginSession)

    const window = new BrowserWindow({
      width: 1200,
      height: 820,
      show: false,
      parent: this.parent() ?? undefined,
      title: '蒲公英账号登录',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition
      }
    })
    this.automationWindow = window

    return new Promise((resolve) => {
      let settled = false
      let timeout: NodeJS.Timeout | null = null
      const finish = (result: Result<PgyLoginResult>): void => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        if (!window.isDestroyed()) window.close()
        void clearSession(loginSession)
        if (this.automationWindow === window) this.automationWindow = null
        resolve(result)
      }

      window.on('closed', () => {
        if (!settled) finish(err('CANCELLED', '登录窗口已关闭'))
      })
      window.webContents.on('render-process-gone', () =>
        finish(err('INTERNAL', '登录页面进程异常退出'))
      )
      window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) finish(err('NETWORK', `登录页面加载失败：${description}`))
      })

      timeout = setTimeout(() => finish(err('NETWORK', '登录超时，请检查账号密码或手动完成验证')), 60000)

      void (async () => {
        try {
          await window.loadURL('https://pgy.xiaohongshu.com/')
          await wait(2000)
          onProgress('submitting', '正在填写账号密码')

          const credentials = JSON.stringify({ email, password })
          const automated = (await window.webContents.executeJavaScript(`
            (async function(credentials) {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const textButton = (text) => [...document.querySelectorAll('button,[role="button"],div')]
                .find((node) => node.textContent?.trim() === text);
              const clickFirst = (selectors, text) => {
                const target = selectors.map((selector) => document.querySelector(selector)).find(Boolean)
                  || (text ? textButton(text) : null);
                if (!target) return false;
                target.click();
                return true;
              };
              clickFirst(['button.login-btn', '[class*="login-btn"]'], '登录');
              await wait(1200);
              clickFirst(['[class*="login-tab"]', '[class*="account-login"]'], '账号登录');
              await wait(800);
              const emailInput = document.querySelector('input[name="email"], input[type="email"]');
              const passwordInput = document.querySelector('input[name="password"], input[type="password"]');
              if (!emailInput || !passwordInput) return false;
              const setValue = (input, value) => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              };
              setValue(emailInput, credentials.email);
              setValue(passwordInput, credentials.password);
              await wait(300);
              return clickFirst(['.beer-login-btn', 'button[type="submit"]'], '登录');
            })(${credentials});
          `)) as boolean

          if (!automated) {
            window.show()
            window.focus()
            onProgress('waiting', '页面结构已变化，请在打开的窗口中手动完成登录')
          } else {
            onProgress('verifying', '登录已提交，正在验证 Cookies')
          }

          while (!settled) {
            const cookies = await cookieHeader(loginSession)
            if (cookies.length > 50) {
              const checked = await checkPgyAccount(cookies)
              if (checked.ok) {
                finish(ok({ cookies, nickname: checked.data.nickname }))
                return
              }
            }
            await wait(1000)
          }
        } catch (error) {
          finish(err('INTERNAL', error instanceof Error ? error.message : '自动登录异常'))
        }
      })()
    })
  }
}