import { createRequire } from 'node:module'
import type { LicenseInfo, MemberLevel } from '@shared/models'
import { err, ok, type Result } from '@shared/result'

interface LegacyResult {
  success: boolean
  code?: string
  message?: string
  data?: Record<string, unknown>
}

interface LegacyLicense {
  setDataPath(path: string): void
  activate(key: string, force?: boolean): Promise<LegacyResult>
  verify(): Promise<LegacyResult>
  unbindLocal(): Promise<LegacyResult>
  getLicenseInfo(): Record<string, unknown> | null
  generateMachineCode(): string
  startHeartbeat(callback: (result: LegacyResult) => void): void
  stopHeartbeat(): void
}

const require = createRequire(import.meta.url)
const legacyLicense = require('../../main/license.js') as LegacyLicense

const mapInfo = (value: Record<string, unknown> | null): LicenseInfo | null => {
  if (!value) return null
  return {
    licenseKey: String(value.license_key ?? ''),
    memberLevel: String(value.member_level ?? 'VIP') as MemberLevel,
    expireAt: String(value.expire_at ?? ''),
    daysRemaining: Number(value.days_remaining ?? 0),
    machineCode: legacyLicense.generateMachineCode()
  }
}

const mapFailure = (result: LegacyResult): Result<never> => {
  const code = result.code === 'NETWORK_ERROR' ? 'NETWORK' : 'LICENSE_REQUIRED'
  return err(code, result.message || '授权验证失败', { retryable: code === 'NETWORK' })
}

export class LicenseAdapter {
  private verifiedAt = 0
  private verifiedInfo: LicenseInfo | null = null
  private pendingVerification: Promise<Result<LicenseInfo>> | null = null

  configure(dataPath: string): void {
    legacyLicense.setDataPath(dataPath)
  }

  getInfo(): LicenseInfo | null {
    return mapInfo(legacyLicense.getLicenseInfo())
  }

  async verify(maxAgeMs = 60_000): Promise<Result<LicenseInfo>> {
    if (this.verifiedInfo && Date.now() - this.verifiedAt <= maxAgeMs) {
      return ok(this.verifiedInfo)
    }
    if (this.pendingVerification) return this.pendingVerification

    this.pendingVerification = (async () => {
      const result = await legacyLicense.verify()
      if (!result.success) {
        this.clearVerificationCache()
        return mapFailure(result)
      }
      const info = this.getInfo()
      if (!info) {
        this.clearVerificationCache()
        return err('LICENSE_REQUIRED', '未读取到有效授权信息')
      }
      this.verifiedAt = Date.now()
      this.verifiedInfo = info
      return ok(info)
    })().finally(() => {
      this.pendingVerification = null
    })

    return this.pendingVerification
  }

  async activate(key: string, force = false): Promise<Result<LicenseInfo>> {
    const result = await legacyLicense.activate(key, force)
    if (!result.success) return mapFailure(result)
    const info = this.getInfo()
    if (!info) return err('INVALID_RESPONSE', '激活成功但授权信息不完整')
    this.verifiedAt = Date.now()
    this.verifiedInfo = info
    return ok(info)
  }

  async unbind(): Promise<Result<void>> {
    const result = await legacyLicense.unbindLocal()
    if (result.success) {
      this.clearVerificationCache()
      return ok(undefined)
    }
    return err('INTERNAL', result.message || '解绑失败')
  }

  private clearVerificationCache(): void {
    this.verifiedAt = 0
    this.verifiedInfo = null
  }

  startHeartbeat(onExpired: (message: string) => void): void {
    legacyLicense.startHeartbeat((result) => {
      this.clearVerificationCache()
      onExpired(result.message || '授权已失效')
    })
  }

  stopHeartbeat(): void {
    legacyLicense.stopHeartbeat()
  }
}