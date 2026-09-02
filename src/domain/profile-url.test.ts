import { describe, expect, it } from 'vitest'
import { extractProfileUserId, extractShortLinks, parseProfileUrl, parseProfileUrls } from './profile-url'

describe('profile url', () => {
  it('normalizes pgy and xhs urls', () => {
    const pgy = parseProfileUrl('https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/abcdef123456')
    const xhs = parseProfileUrl('https://www.xiaohongshu.com/user/profile/abcdef123456')
    expect(pgy).toEqual(xhs)
    expect(pgy?.userId).toBe('abcdef123456')
  })

  it('deduplicates profile urls', () => {
    const result = parseProfileUrls(`
      https://www.xiaohongshu.com/user/profile/abcdef123456
      https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/abcdef123456
    `)
    expect(result).toHaveLength(1)
  })

  it('extracts profile ids from both invite URL formats', () => {
    expect(
      extractProfileUserId('https://www.xiaohongshu.com/user/profile/abcdef123456abcdef123456')
    ).toBe('abcdef123456abcdef123456')
    expect(
      extractProfileUserId(
        'https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/abcdef123456abcdef123456'
      )
    ).toBe('abcdef123456abcdef123456')
  })

  it('extracts short links from share copy', () => {
    const links = extractShortLinks('查看达人 https://xhslink.com/m/AbC123\n重复 https://xhslink.com/m/AbC123')
    expect(links).toEqual(['https://xhslink.com/m/AbC123'])
  })
})