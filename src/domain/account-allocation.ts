import type { Account } from '@shared/models'

export interface AccountAllocation {
  account: Account
  accounts: Account[]
  nextIndex: number
}

const dateKey = (date = new Date()): string => date.toISOString().slice(0, 10)

export const allocateAccount = (
  accounts: Account[],
  startIndex: number,
  maxCount: number,
  now = new Date(),
  excludedAccountIds: ReadonlySet<string> = new Set()
): AccountAllocation | null => {
  if (accounts.length === 0) return null
  const today = dateKey(now)

  for (let offset = 0; offset < accounts.length; offset += 1) {
    const index = (startIndex + offset) % accounts.length
    const candidate = accounts[index]
    if (!candidate || candidate.status !== 'active' || excludedAccountIds.has(candidate.id)) continue

    const currentCount = candidate.lastUseDate === today ? candidate.todayUseCount : 0
    if (currentCount >= maxCount) continue

    const updated: Account = {
      ...candidate,
      lastUseDate: today,
      todayUseCount: currentCount + 1,
      updatedAt: now.toISOString()
    }
    const nextAccounts = accounts.map((account, accountIndex) =>
      accountIndex === index ? updated : account
    )

    return {
      account: updated,
      accounts: nextAccounts,
      nextIndex: (index + 1) % accounts.length
    }
  }

  return null
}