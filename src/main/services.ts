import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { CollectionEvent } from '@shared/desktop-api'
import { IPC } from '@shared/ipc'
import type { AppPaths } from '@infrastructure/paths/app-paths'
import { CredentialVault } from '@infrastructure/persistence/credential-vault'
import { AccountRepository } from '@infrastructure/persistence/account-repository'
import { SettingsRepository } from '@infrastructure/persistence/settings-repository'
import { CookieRepository } from '@infrastructure/persistence/cookie-repository'
import { LicenseAdapter } from '@infrastructure/license/license-adapter'
import { LegacyCollectorAdapter } from '@infrastructure/xhs/legacy-collector-adapter'
import { BrowserAutomationService } from '@infrastructure/xhs/browser-automation-service'
import { PgyLoginDriver } from '@infrastructure/xhs/pgy-login-driver'
import { ImportService } from '@infrastructure/files/import-service'
import { ExportService } from '@infrastructure/files/export-service'
import { AccountSessionService } from '@application/accounts/account-session-service'
import { CollectionService } from '@application/collection/collection-service'

export interface Services {
  vault: CredentialVault
  accounts: AccountSessionService
  settings: SettingsRepository
  cookies: CookieRepository
  license: LicenseAdapter
  collection: CollectionService
  browser: BrowserAutomationService
  importer: ImportService
  exporter: ExportService
}

export const createServices = (
  paths: AppPaths,
  getMainWindow: () => BrowserWindow | null
): Services => {
  const vault = new CredentialVault()
  const accountRepository = new AccountRepository(join(paths.data, 'pgy_username.json'), vault)
  const settings = new SettingsRepository(join(paths.data, 'collect_settings.json'))
  const cookies = new CookieRepository(join(paths.data, 'xhs_cookies.json'), vault)
  const license = new LicenseAdapter()
  license.configure(process.platform === 'darwin' ? paths.data : paths.userData)
  const loginDriver = new PgyLoginDriver(getMainWindow)
  const accounts = new AccountSessionService(accountRepository, loginDriver)
  const collection = new CollectionService(accounts, new LegacyCollectorAdapter())
  const exporter = new ExportService()

  accounts.subscribe((event) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.accountsSessionEvent, event)
  })

  collection.subscribe((event: CollectionEvent) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.collectionEvent, event)

    if (event.type === 'state' && event.state.status === 'completed') {
      void settings.read().then(async (collectionSettings) => {
        if (!collectionSettings.output.directory.trim()) return
        const exported = await exporter.exportCollection(event.state, collectionSettings)
        const currentWindow = getMainWindow()
        if (!currentWindow || currentWindow.isDestroyed()) return
        const exportEvent: CollectionEvent = exported.ok
          ? {
              type: 'log',
              level: 'info',
              message: exported.data ? `采集结果已保存到 ${exported.data}` : '采集结果未保存',
              at: new Date().toISOString()
            }
          : {
              type: 'log',
              level: 'error',
              message: `自动导出失败：${exported.error.message}`,
              at: new Date().toISOString()
            }
        currentWindow.webContents.send(IPC.collectionEvent, exportEvent)
      })
    }
  })

  return {
    vault,
    accounts,
    settings,
    cookies,
    license,
    collection,
    browser: new BrowserAutomationService(getMainWindow, cookies),
    importer: new ImportService(),
    exporter
  }
}