import { safeStorage } from 'electron'

type SecretMode = 'encrypted' | 'plain'

export class CredentialVault {
  get mode(): SecretMode {
    return safeStorage.isEncryptionAvailable() ? 'encrypted' : 'plain'
  }

  get warning(): string | undefined {
    return this.mode === 'plain' ? '系统凭据加密不可用，敏感数据将以兼容模式保存。' : undefined
  }

  seal(value: string | undefined): string | undefined {
    if (!value) return value
    if (value.startsWith('enc:v1:') || value.startsWith('plain:v1:')) return value
    if (this.mode === 'encrypted') {
      return `enc:v1:${safeStorage.encryptString(value).toString('base64')}`
    }
    return `plain:v1:${Buffer.from(value, 'utf8').toString('base64')}`
  }

  open(value: string | undefined): string | undefined {
    if (!value) return value
    if (value.startsWith('enc:v1:')) {
      try {
        return safeStorage.decryptString(Buffer.from(value.slice(7), 'base64'))
      } catch {
        return ''
      }
    }
    if (value.startsWith('plain:v1:')) {
      return Buffer.from(value.slice(9), 'base64').toString('utf8')
    }
    return value
  }
}