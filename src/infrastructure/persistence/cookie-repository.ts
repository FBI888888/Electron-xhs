import { constants } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { JsonStore } from './json-store'
import { CredentialVault } from './credential-vault'

interface StoredCookie {
  cookies: string
  updatedAt: string
}

export class CookieRepository {
  private readonly store: JsonStore<StoredCookie>

  constructor(
    private readonly filePath: string,
    private readonly vault: CredentialVault
  ) {
    this.store = new JsonStore(filePath, { cookies: '', updatedAt: '' }, (value) => {
      const input = (value ?? {}) as Record<string, unknown>
      return {
        cookies: typeof input.cookies === 'string' ? input.cookies : '',
        updatedAt:
          typeof input.updatedAt === 'string'
            ? input.updatedAt
            : typeof input.updated_at === 'string'
              ? input.updated_at
              : ''
      }
    })
  }

  async get(): Promise<string> {
    const stored = await this.store.read()
    const opened = this.vault.open(stored.cookies) ?? ''
    if (
      stored.cookies &&
      !stored.cookies.startsWith('enc:v1:') &&
      !stored.cookies.startsWith('plain:v1:')
    ) {
      await copyFile(this.filePath, `${this.filePath}.legacy.bak`, constants.COPYFILE_EXCL).catch(
        () => undefined
      )
      await this.set(opened)
    }
    return opened
  }

  async set(cookies: string): Promise<void> {
    await this.store.write({
      cookies: this.vault.seal(cookies) ?? '',
      updatedAt: new Date().toISOString()
    })
  }
}