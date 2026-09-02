import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AccountCreateInput,
  AccountUpdateInput,
  BloggerListItem,
  CollectionTaskInput,
  InviteItem,
  PasswordLoginInput,
  LinkConversionItem
} from '@shared/models'
import {
  accountCreateSchema,
  accountUpdateSchema,
  licenseKeySchema,
  passwordLoginSchema,
  settingsSchema,
  taskInputSchema
} from '@shared/schemas'
import { err, ok, toAppError, type Result } from '@shared/result'
import type { Services } from '../services'
import type { AppPaths } from '@infrastructure/paths/app-paths'

const handle = <TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<Result<TResult>> | Result<TResult>
): void => {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (error) {
      return { ok: false, error: toAppError(error) }
    }
  })
}

export const registerIpc = (
  services: Services,
  paths: AppPaths,
  getMainWindow: () => BrowserWindow | null
): void => {
  handle(IPC.appInfo, () =>
    ok({
      version: app.getVersion(),
      platform: process.platform,
      dataDirectory: paths.data,
      security: {
        secretsEncrypted: services.vault.mode === 'encrypted',
        warning: services.vault.warning
      }
    })
  )
  ipcMain.handle(IPC.appQuit, () => app.quit())

  handle(IPC.licenseInfo, () => ok(services.license.getInfo()))
  handle(IPC.licenseVerify, () => services.license.verify())
  handle(IPC.licenseActivate, async (licenseKey: string, force: boolean = false) => {
    const parsed = licenseKeySchema.safeParse(licenseKey)
    if (!parsed.success) return err('INVALID_INPUT', '授权码格式无效')
    const result = await services.license.activate(parsed.data, force)
    if (result.ok) services.accounts.startPeriodicChecks()
    return result
  })
  handle(IPC.licenseUnbind, async () => {
    const result = await services.license.unbind()
    if (result.ok) services.accounts.stopPeriodicChecks()
    return result
  })

  const guard = async <T>(operation: () => Promise<Result<T>> | Result<T>): Promise<Result<T>> => {
    const verified = await services.license.verify()
    return verified.ok ? operation() : verified
  }
  const guardSvip = async <T>(operation: () => Promise<Result<T>> | Result<T>): Promise<Result<T>> => {
    const verified = await services.license.verify()
    if (!verified.ok) return verified
    if (verified.data.memberLevel !== 'SVIP') return err('SVIP_REQUIRED', '该功能需要 SVIP 权限')
    return operation()
  }

  const guardPremium = async <T>(
    operation: () => Promise<Result<T>> | Result<T>
  ): Promise<Result<T>> => {
    const verified = await services.license.verify()
    if (!verified.ok) return verified
    if (!['VVIP', 'SVIP'].includes(verified.data.memberLevel)) {
      return err('LICENSE_REQUIRED', '该功能需要 VVIP 或 SVIP 权限')
    }
    return operation()
  }

  handle(IPC.accountsList, async () => ok(await services.accounts.list()))
  handle(IPC.accountsCreate, (input: AccountCreateInput) => {
    const parsed = accountCreateSchema.safeParse(input)
    return parsed.success
      ? guard(() => services.accounts.create(parsed.data))
      : err('INVALID_INPUT', '账号数据格式无效', { details: parsed.error.message })
  })
  handle(IPC.accountsUpdate, (accountId: string, patch: AccountUpdateInput) => {
    const parsed = accountUpdateSchema.safeParse(patch)
    return parsed.success
      ? guard(() => services.accounts.update(accountId, parsed.data))
      : err('INVALID_INPUT', '账号修改数据无效', { details: parsed.error.message })
  })
  handle(IPC.accountsDelete, (accountId: string) => guard(() => services.accounts.remove(accountId)))
  handle(IPC.accountsCheck, (accountId: string) => guard(() => services.accounts.check(accountId)))
  handle(IPC.accountsCheckAll, () => guard(() => services.accounts.checkAll()))
  handle(IPC.accountsOpenLogin, () => guard(() => services.accounts.openWebLogin()))
  handle(IPC.accountsPasswordLogin, (input: PasswordLoginInput) => {
    const parsed = passwordLoginSchema.safeParse(input)
    return parsed.success
      ? guard(() => services.accounts.passwordLogin(parsed.data))
      : err('INVALID_INPUT', '登录信息格式无效', { details: parsed.error.message })
  })
  handle(IPC.accountsRefresh, (accountId: string) =>
    guard(() => services.accounts.refresh(accountId))
  )
  handle(IPC.accountsCancelLogin, () => services.accounts.cancelLogin())

  handle(IPC.settingsGet, async () => ok(await services.settings.read()))
  handle(IPC.settingsSave, async (settings: unknown) => {
    const parsed = settingsSchema.safeParse(settings)
    return parsed.success
      ? ok(await services.settings.write(parsed.data))
      : err('INVALID_INPUT', '设置数据格式无效', { details: parsed.error.message })
  })
  handle(IPC.settingsChooseDirectory, async () => {
    const parent = getMainWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
    const selection = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return ok(selection.filePaths[0] ?? null)
  })

  handle(IPC.collectionImport, () => services.importer.importFirstColumn())
  handle(IPC.collectionStart, async (input: CollectionTaskInput) => {
    const parsed = taskInputSchema.safeParse(input)
    return parsed.success
      ? guard(() => services.collection.start(parsed.data))
      : err('INVALID_INPUT', '采集任务参数无效', { details: parsed.error.message })
  })
  handle(IPC.collectionPause, () => services.collection.pause())
  handle(IPC.collectionResume, () => services.collection.resume())
  handle(IPC.collectionStop, () => services.collection.stop())
  handle(IPC.collectionState, () => ok(services.collection.getState()))
  handle(IPC.collectionExport, async (includeIncomplete: boolean = false) =>
    services.exporter.exportCollection(
      services.collection.getState(),
      await services.settings.read(),
      includeIncomplete
    )
  )

  handle(IPC.linksImport, () => services.importer.importFirstColumn())
  handle(IPC.linksOpenLogin, () =>
    guard(() =>
      services.browser.openXhsLogin(() => {
        const window = getMainWindow()
        if (window && !window.isDestroyed()) window.webContents.send(IPC.linksCookiesCaptured)
      })
    )
  )
  handle(IPC.linksResolve, (shortUrl: string) => guard(() => services.browser.resolveShortLink(shortUrl)))
  handle(IPC.linksExport, (items: LinkConversionItem[]) => services.exporter.exportLinks(items))

  handle(IPC.bloggersOpenBrowser, async (accountId: string) =>
    guardPremium(async () => {
      const account = await services.accounts.getAccount(accountId)
      if (!account) return err('NOT_FOUND', '账号不存在')
      return services.browser.openBloggerBrowser(account, () => {
        const window = getMainWindow()
        if (window && !window.isDestroyed()) window.webContents.send(IPC.bloggersRequestCaptured)
      })
    })
  )
  handle(IPC.bloggersOpenDetail, async (accountId: string, profileUrl: string) =>
    guardPremium(async () => {
      const account = await services.accounts.getAccount(accountId)
      if (!account) return err('NOT_FOUND', '账号不存在')
      return services.browser.openBloggerDetail(account, profileUrl)
    })
  )
  handle(IPC.bloggersFetchPage, (page: number) =>
    guardPremium(() => services.browser.fetchBloggerPage(page))
  )
  handle(IPC.bloggersCloseBrowser, () =>
    guardPremium(() => services.browser.closeBloggerBrowser())
  )
  handle(IPC.bloggersExport, (items: BloggerListItem[]) =>
    guardPremium(() => services.exporter.exportBloggers(items))
  )

  handle(IPC.invitesImport, () => guardSvip(() => services.importer.importInvites()))
  handle(IPC.invitesExportTemplate, () =>
    guardSvip(() => services.exporter.exportInviteTemplate())
  )
  handle(IPC.invitesOpenBrowser, async (accountId: string, profileUrl: string) =>
    guardSvip(async () => {
      const account = await services.accounts.getAccount(accountId)
      if (!account) return err('NOT_FOUND', '账号不存在')
      return services.browser.openInviteBrowser(account, profileUrl, () => {
        const window = getMainWindow()
        if (window && !window.isDestroyed()) window.webContents.send(IPC.invitesRequestCaptured)
      })
    })
  )
  handle(IPC.invitesSend, async (item: InviteItem, accountId: string) =>
    guardSvip(async () => {
      const account = await services.accounts.getAccount(accountId)
      if (!account) return err('NOT_FOUND', '账号不存在')
      return services.browser.sendInvite(item, account)
    })
  )
  handle(IPC.invitesExport, (items: InviteItem[]) =>
    guardSvip(() => services.exporter.exportInvites(items))
  )
}