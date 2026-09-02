import { BrowserWindow, session } from 'electron'
import https from 'node:https'
import { randomUUID } from 'node:crypto'
import type {
  Account,
  BloggerListItem,
  InviteItem,
  LinkConversionItem
} from '@shared/models'
import { err, ok, type Result } from '@shared/result'
import { extractBaseProfileUrl, extractProfileUserId } from '@domain/profile-url'
import type { CookieRepository } from '../persistence/cookie-repository'

interface CapturedRequest {
  url: string
  body: Record<string, unknown>
  headers: Record<string, string | string[]>
}

const cookieHeader = async (partition: Electron.Session, domain: string): Promise<string> => {
  const cookies = await partition.cookies.get({ domain })
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

const setCookieHeader = async (
  targetSession: Electron.Session,
  origin: string,
  cookies: string
): Promise<void> => {
  for (const pair of cookies.split(';').map((value) => value.trim()).filter(Boolean)) {
    const [name, ...parts] = pair.split('=')
    if (!name || parts.length === 0) continue
    await targetSession.cookies
      .set({ url: origin, name: name.trim(), value: parts.join('=').trim(), domain: '.xiaohongshu.com' })
      .catch(() => undefined)
  }
}

const sanitizeReplayHeaders = (
  headers: Record<string, string | string[]>,
  body?: string
): Record<string, string | string[]> => {
  const sanitized = Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.toLowerCase()
      return !name.startsWith(':') && !['host', 'content-length', 'accept-encoding'].includes(normalized)
    })
  )
  sanitized['accept-encoding'] = 'identity'
  if (body !== undefined) sanitized['content-length'] = String(Buffer.byteLength(body))
  return sanitized
}

const requestJson = <T>(
  url: URL,
  method: 'GET' | 'POST',
  headers: Record<string, string | string[]>,
  body?: string
): Promise<Result<T>> =>
  new Promise((resolve) => {
    const request = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers: { ...headers, 'accept-encoding': 'identity' },
        timeout: 15000
      },
      (response) => {
        let raw = ''
        response.on('data', (chunk) => (raw += chunk))
        response.on('end', () => {
          try {
            resolve(ok(JSON.parse(raw) as T))
          } catch (error) {
            resolve(err('INVALID_RESPONSE', error instanceof Error ? error.message : '响应解析失败'))
          }
        })
      }
    )
    request.on('error', (error) => resolve(err('NETWORK', error.message, { retryable: true })))
    request.on('timeout', () => {
      request.destroy()
      resolve(err('NETWORK', '请求超时', { retryable: true }))
    })
    if (body) request.write(body)
    request.end()
  })

export class BrowserAutomationService {
  private xhsLoginWindow: BrowserWindow | null = null
  private bloggerWindow: BrowserWindow | null = null
  private inviteWindow: BrowserWindow | null = null
  private capturedBloggerRequest: CapturedRequest | null = null
  private capturedInviteRequest: CapturedRequest | null = null
  private counter = 0

  constructor(
    private readonly parent: () => BrowserWindow | null,
    private readonly xhsCookies: CookieRepository
  ) {}

  async openXhsLogin(onCaptured: () => void): Promise<Result<void>> {
    if (this.xhsLoginWindow && !this.xhsLoginWindow.isDestroyed()) {
      this.xhsLoginWindow.focus()
      return ok(undefined)
    }

    const partition = `memory-xhs-login-${Date.now()}-${this.counter++}`
    const loginSession = session.fromPartition(partition, { cache: false })
    this.xhsLoginWindow = new BrowserWindow({
      width: 1200,
      height: 820,
      parent: this.parent() ?? undefined,
      title: '登录小红书',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition
      }
    })

    let captured = false
    const timer = setInterval(async () => {
      if (captured || !this.xhsLoginWindow || this.xhsLoginWindow.isDestroyed()) return
      try {
        const result = (await this.xhsLoginWindow.webContents.executeJavaScript(`
          fetch('https://edith.xiaohongshu.com/api/sns/web/v2/user/me', { credentials: 'include' })
            .then((response) => response.json())
            .catch(() => null)
        `)) as Record<string, any> | null
        if (!result?.success || !result?.data?.red_id) return
        captured = true
        await this.xhsCookies.set(await cookieHeader(loginSession, '.xiaohongshu.com'))
        onCaptured()
        this.xhsLoginWindow.close()
      } catch {
        return
      }
    }, 1500)

    this.xhsLoginWindow.on('closed', () => {
      clearInterval(timer)
      void loginSession.clearStorageData()
      void loginSession.clearCache()
      this.xhsLoginWindow = null
    })
    await this.xhsLoginWindow.loadURL('https://www.xiaohongshu.com/login')
    return ok(undefined)
  }

  async resolveShortLink(shortUrl: string): Promise<Result<LinkConversionItem>> {
    if (!/^https?:\/\/(?:www\.)?xhslink\.com\//i.test(shortUrl)) {
      return err('INVALID_INPUT', '短链接格式无效')
    }
    const partition = `memory-link-${Date.now()}-${this.counter++}`
    const linkSession = session.fromPartition(partition, { cache: false })
    const storedCookies = await this.xhsCookies.get()
    await setCookieHeader(linkSession, 'https://www.xiaohongshu.com', storedCookies)

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition
      }
    })

    return new Promise((resolve) => {
      let finalUrl = ''
      let settled = false
      let loginRetries = 0
      const finish = (result: Result<LinkConversionItem>): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (!window.isDestroyed()) window.close()
        void linkSession.clearStorageData()
        void linkSession.clearCache()
        resolve(result)
      }
      const capture = (_event: Electron.Event, url: string): void => {
        finalUrl = url
        const baseUrl = extractBaseProfileUrl(url)
        if (baseUrl) {
          finish(ok({ id: randomUUID(), shortUrl, longUrl: baseUrl, status: 'success' }))
          return
        }
        const loginRedirect = /xiaohongshu\.com\/(?:login|explore\/login)/i.test(url)
        if (loginRedirect && storedCookies && loginRetries < 2) {
          loginRetries += 1
          void setCookieHeader(linkSession, 'https://www.xiaohongshu.com', storedCookies).then(() =>
            window.loadURL(shortUrl).catch((error) => finish(err('NETWORK', error.message)))
          )
        }
      }
      window.webContents.on('will-redirect', capture)
      window.webContents.on('did-redirect-navigation', capture)
      window.webContents.on('did-navigate', capture)
      window.webContents.on('did-navigate-in-page', capture)
      window.on('closed', () => {
        if (!settled) finish(err('CANCELLED', '链接转换窗口已关闭'))
      })
      const timeout = setTimeout(() => {
        const baseUrl = extractBaseProfileUrl(finalUrl)
        finish(
          baseUrl
            ? ok({ id: randomUUID(), shortUrl, longUrl: baseUrl, status: 'success' })
            : ok({
                id: randomUUID(),
                shortUrl,
                longUrl: finalUrl,
                status: 'unrecognized',
                message: /xiaohongshu\.com\/(?:login|explore\/login)/i.test(finalUrl)
                  ? '登录凭据已失效，请重新登录小红书后重试'
                  : '跳转成功，但未识别到达人主页链接'
              })
        )
      }, 15000)
      void window.loadURL(shortUrl).catch((error) => finish(err('NETWORK', error.message)))
    })
  }

  async openBloggerBrowser(account: Account, onCaptured: () => void): Promise<Result<void>> {
    if (this.bloggerWindow && !this.bloggerWindow.isDestroyed()) {
      this.bloggerWindow.focus()
      return ok(undefined)
    }
    const partition = `memory-blogger-${Date.now()}-${this.counter++}`
    const browserSession = session.fromPartition(partition, { cache: false })
    await setCookieHeader(browserSession, 'https://pgy.xiaohongshu.com', account.cookies)
    this.capturedBloggerRequest = null

    browserSession.webRequest.onBeforeRequest(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/cooperator/blogger/v2*'] },
      (details, callback) => {
        const bytes = details.uploadData?.[0]?.bytes
        if (details.method === 'POST' && bytes) {
          try {
            this.capturedBloggerRequest = {
              url: details.url,
              body: JSON.parse(bytes.toString('utf8')) as Record<string, unknown>,
              headers: {}
            }
          } catch {
            this.capturedBloggerRequest = null
          }
        }
        callback({})
      }
    )
    browserSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/cooperator/blogger/v2*'] },
      (details, callback) => {
        if (this.capturedBloggerRequest && details.method === 'POST') {
          this.capturedBloggerRequest.headers = details.requestHeaders
          onCaptured()
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    this.bloggerWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      parent: this.parent() ?? undefined,
      title: '博主广场',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition }
    })
    this.bloggerWindow.on('closed', () => {
      void browserSession.clearStorageData()
      void browserSession.clearCache()
      this.bloggerWindow = null
    })
    await this.bloggerWindow.loadURL('https://pgy.xiaohongshu.com/solar/pre-trade/note/kol')
    return ok(undefined)
  }

  async fetchBloggerPage(page: number): Promise<Result<{ items: BloggerListItem[]; total: number }>> {
    const captured = this.capturedBloggerRequest
    if (!captured) return err('CONFLICT', '请先在博主广场完成一次筛选，以捕获查询条件')
    const body = JSON.stringify({ ...captured.body, pageNum: page })
    const headers = sanitizeReplayHeaders(captured.headers, body)
    const response = await requestJson<Record<string, any>>(
      new URL(captured.url),
      'POST',
      headers,
      body
    )
    if (!response.ok) return response
    if (response.data.success !== true || response.data.code !== 0) {
      return err('INVALID_RESPONSE', String(response.data.msg ?? '达人列表获取失败'))
    }
    const rawItems = Array.isArray(response.data.data?.kols) ? response.data.data.kols : []
    const items = rawItems.map((raw: Record<string, any>) => ({
      userId: String(raw.userId ?? raw.kolId ?? raw.id ?? ''),
      name: String(raw.name ?? raw.nickName ?? ''),
      avatarUrl: String(raw.headPhoto ?? raw.avatar ?? raw.image ?? raw.imageb ?? raw.headImage ?? raw.avatarUrl ?? ''),
      location: String(raw.location ?? ''),
      fansCount: Number(raw.fansCount ?? raw.fansNum ?? 0),
      picturePrice: Number(raw.picturePrice ?? 0),
      videoPrice: Number(raw.videoPrice ?? 0),
      raw
    }))
    return ok({ items, total: Number(response.data.data?.total ?? items.length) })
  }

  closeBloggerBrowser(): Result<void> {
    this.bloggerWindow?.close()
    this.bloggerWindow = null
    this.capturedBloggerRequest = null
    return ok(undefined)
  }

  async openBloggerDetail(account: Account, profileUrl: string): Promise<Result<void>> {
    const userId = extractProfileUserId(profileUrl)
    if (!userId) return err('INVALID_INPUT', '无法识别达人主页地址')
    const partition = `memory-blogger-detail-${Date.now()}-${this.counter++}`
    const detailSession = session.fromPartition(partition, { cache: false })
    await setCookieHeader(detailSession, 'https://pgy.xiaohongshu.com', account.cookies)
    const window = new BrowserWindow({
      width: 1200,
      height: 820,
      parent: this.parent() ?? undefined,
      title: '博主详情',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition }
    })
    window.on('closed', () => {
      void detailSession.clearStorageData()
      void detailSession.clearCache()
    })
    try {
      await window.loadURL(`https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}`)
      return ok(undefined)
    } catch (error) {
      if (!window.isDestroyed()) window.close()
      return err('NETWORK', error instanceof Error ? error.message : '达人详情页加载失败')
    }
  }

  async openInviteBrowser(
    account: Account,
    profileUrl: string,
    onCaptured: () => void
  ): Promise<Result<void>> {
    const partition = `memory-invite-${Date.now()}-${this.counter++}`
    const inviteSession = session.fromPartition(partition, { cache: false })
    await setCookieHeader(inviteSession, 'https://pgy.xiaohongshu.com', account.cookies)
    this.capturedInviteRequest = null

    inviteSession.webRequest.onBeforeRequest(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/invite/initiate_invite*'] },
      (details, callback) => {
        const bytes = details.uploadData?.[0]?.bytes
        if (details.method === 'POST' && bytes) {
          try {
            this.capturedInviteRequest = {
              url: details.url,
              body: JSON.parse(bytes.toString('utf8')) as Record<string, unknown>,
              headers: {}
            }
          } catch {
            this.capturedInviteRequest = null
          }
        }
        callback({})
      }
    )
    inviteSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://pgy.xiaohongshu.com/api/solar/invite/initiate_invite*'] },
      (details, callback) => {
        if (this.capturedInviteRequest && details.method === 'POST') {
          this.capturedInviteRequest.headers = details.requestHeaders
          onCaptured()
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    this.inviteWindow = new BrowserWindow({
      width: 1200,
      height: 820,
      parent: this.parent() ?? undefined,
      title: '达人邀约',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition }
    })
    this.inviteWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: this.inviteWindow ?? undefined,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition }
      }
    }))
    this.inviteWindow.on('closed', () => {
      void inviteSession.clearStorageData()
      void inviteSession.clearCache()
      this.inviteWindow = null
    })
    const kolId = extractProfileUserId(profileUrl)
    const inviteUrl = kolId
      ? `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${kolId}`
      : profileUrl
    await this.inviteWindow.loadURL(inviteUrl)
    return ok(undefined)
  }

  async sendInvite(item: InviteItem, account: Account): Promise<Result<InviteItem>> {
    const captured = this.capturedInviteRequest
    if (!captured) return err('CONFLICT', '请先手动发起一次邀约，以捕获请求模板')
    const kolId = extractProfileUserId(item.profileUrl)
    if (!kolId) return err('INVALID_INPUT', '无法从达人主页解析 ID')

    const body = JSON.stringify({
      ...captured.body,
      kolId,
      inviteType: ['视频', '视频合作'].includes(item.cooperationType.trim()) ? 2 : 1,
      productName: item.productName,
      inviteContent: item.content,
      contactInfo: item.contact
    })
    const headers = sanitizeReplayHeaders(captured.headers, body)
    headers.cookie = account.cookies
    const response = await requestJson<Record<string, any>>(new URL(captured.url), 'POST', headers, body)
    if (!response.ok) return response
    const success = response.data.success === true && response.data.code === 0 && response.data.data?.inviteSucceed === true
    const message = success
      ? '邀约成功'
      : String(response.data.msg ?? response.data.data?.hint ?? '邀约失败')
    const updated: InviteItem = {
      ...item,
      status: success ? 'success' : 'failed',
      message,
      invitedAt: success ? new Date().toISOString() : undefined
    }
    if (success) return ok(updated)
    const normalized = message.toLowerCase()
    if (
      response.data.code === 401 ||
      response.data.code === 403 ||
      response.data.code === -100 ||
      normalized.includes('登录') ||
      normalized.includes('cookie')
    ) {
      return err('AUTH_EXPIRED', message)
    }
    return err(response.data.code === 300013 ? 'RATE_LIMITED' : 'INVALID_RESPONSE', message)
  }
}