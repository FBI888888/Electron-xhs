import { constants } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import type { Account } from '@shared/models'
import { migrateLegacyAccounts } from '@domain/migration'
import { JsonStore } from './json-store'
import { CredentialVault } from './credential-vault'

export class AccountRepository {
  private readonly store: JsonStore<Account[]>

  constructor(
    private readonly filePath: string,
    private readonly vault: CredentialVault
  ) {
    this.store = new JsonStore(filePath, [], migrateLegacyAccounts)
  }

  async list(): Promise<Account[]> {
    const accounts = await this.store.read()
    const opened = accounts.map((account) => ({
      ...account,
      cookies: this.vault.open(account.cookies) ?? '',
      email: this.vault.open(account.email),
      password: this.vault.open(account.password)
    }))
    const needsMigration = accounts.some((account) =>
      [account.cookies, account.email, account.password].some(
        (value) => value && !value.startsWith('enc:v1:') && !value.startsWith('plain:v1:')
      )
    )
    if (needsMigration) {
      await copyFile(this.filePath, `${this.filePath}.legacy.bak`, constants.COPYFILE_EXCL).catch(
        () => undefined
      )
      await this.save(opened)
    }
    return opened
  }

  async save(accounts: Account[]): Promise<Account[]> {
    const stored = accounts.map((account) => ({
      ...account,
      cookies: this.vault.seal(account.cookies) ?? '',
      email: this.vault.seal(account.email),
      password: this.vault.seal(account.password)
    }))
    await this.store.write(stored)
    return accounts
  }
}