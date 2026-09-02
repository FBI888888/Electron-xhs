const PGY_PATTERN = /pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/([a-f0-9]+)/i
const XHS_PATTERN = /www\.xiaohongshu\.com\/user\/profile\/([a-f0-9]+)/i
const SHORT_LINK_PATTERN = /https?:\/\/(?:www\.)?xhslink\.com\/m\/[A-Za-z0-9]+/g

export interface ParsedProfileUrl {
  userId: string
  pgyUrl: string
  xhsUrl: string
}

export const parseProfileUrl = (value: string): ParsedProfileUrl | null => {
  const input = value.trim()
  const match = input.match(PGY_PATTERN) ?? input.match(XHS_PATTERN)
  const userId = match?.[1]
  if (!userId) return null

  return {
    userId,
    pgyUrl: `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}`,
    xhsUrl: `https://www.xiaohongshu.com/user/profile/${userId}`
  }
}

export const parseProfileUrls = (text: string): ParsedProfileUrl[] => {
  const unique = new Map<string, ParsedProfileUrl>()
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseProfileUrl(line)
    if (parsed) unique.set(parsed.userId, parsed)
  }
  return [...unique.values()]
}

export const extractShortLinks = (text: string): string[] => {
  const links = text.match(SHORT_LINK_PATTERN) ?? []
  return [...new Set(links.map((link) => link.trim()))]
}

export const extractProfileUserId = (value: string): string =>
  parseProfileUrl(value)?.userId ?? value.match(/([0-9a-f]{24})/i)?.[1] ?? ''

export const extractBaseProfileUrl = (value: string): string => {
  const match = value.match(/https?:\/\/www\.xiaohongshu\.com\/user\/profile\/[0-9a-fA-F]{24}/)
  return match?.[0] ?? ''
}