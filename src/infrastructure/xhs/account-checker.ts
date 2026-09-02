import https from 'node:https'
import { err, ok, type Result } from '@shared/result'

export interface AccountCheckResult {
  nickname: string
}

export const checkPgyAccount = (cookies: string): Promise<Result<AccountCheckResult>> =>
  new Promise((resolve) => {
    const request = https.request(
      {
        hostname: 'pgy.xiaohongshu.com',
        port: 443,
        path: '/api/solar/user/info',
        method: 'GET',
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9',
          referer: 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36',
          cookie: cookies
        },
        timeout: 10000
      },
      (response) => {
        let raw = ''
        response.on('data', (chunk) => (raw += chunk))
        response.on('end', () => {
          try {
            const json = JSON.parse(raw) as Record<string, any>
            if (json.success === true && json.code === 0) {
              resolve(ok({ nickname: String(json.data?.roleInfoList?.[0]?.nickName ?? '') }))
              return
            }
            resolve(err('AUTH_EXPIRED', String(json.msg ?? '账号验证失败')))
          } catch (error) {
            resolve(err('INVALID_RESPONSE', error instanceof Error ? error.message : '响应解析失败'))
          }
        })
      }
    )

    request.on('error', (error) => resolve(err('NETWORK', error.message, { retryable: true })))
    request.on('timeout', () => {
      request.destroy()
      resolve(err('NETWORK', '账号验证请求超时', { retryable: true }))
    })
    request.end()
  })