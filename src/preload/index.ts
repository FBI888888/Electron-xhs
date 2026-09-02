import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, CollectionEvent } from '@shared/desktop-api'
import type { AccountSessionEvent } from '@shared/models'
import { IPC } from '@shared/ipc'

const on = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const desktop: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appInfo),
    quit: () => ipcRenderer.invoke(IPC.appQuit)
  },
  license: {
    getInfo: () => ipcRenderer.invoke(IPC.licenseInfo),
    verify: () => ipcRenderer.invoke(IPC.licenseVerify),
    activate: (licenseKey, force = false) => ipcRenderer.invoke(IPC.licenseActivate, licenseKey, force),
    unbind: () => ipcRenderer.invoke(IPC.licenseUnbind),
    onExpired: (listener) => on<string>(IPC.licenseExpired, listener)
  },
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accountsList),
    create: (input) => ipcRenderer.invoke(IPC.accountsCreate, input),
    update: (accountId, patch) => ipcRenderer.invoke(IPC.accountsUpdate, accountId, patch),
    remove: (accountId) => ipcRenderer.invoke(IPC.accountsDelete, accountId),
    check: (accountId) => ipcRenderer.invoke(IPC.accountsCheck, accountId),
    checkAll: () => ipcRenderer.invoke(IPC.accountsCheckAll),
    openLogin: (remark) => ipcRenderer.invoke(IPC.accountsOpenLogin, remark),
    passwordLogin: (input) => ipcRenderer.invoke(IPC.accountsPasswordLogin, input),
    refresh: (accountId) => ipcRenderer.invoke(IPC.accountsRefresh, accountId),
    cancelLogin: () => ipcRenderer.invoke(IPC.accountsCancelLogin),
    onSessionEvent: (listener) => on<AccountSessionEvent>(IPC.accountsSessionEvent, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    save: (settings) => ipcRenderer.invoke(IPC.settingsSave, settings),
    chooseDirectory: () => ipcRenderer.invoke(IPC.settingsChooseDirectory)
  },
  collection: {
    importTargets: () => ipcRenderer.invoke(IPC.collectionImport),
    start: (input) => ipcRenderer.invoke(IPC.collectionStart, input),
    pause: () => ipcRenderer.invoke(IPC.collectionPause),
    resume: () => ipcRenderer.invoke(IPC.collectionResume),
    stop: () => ipcRenderer.invoke(IPC.collectionStop),
    getState: () => ipcRenderer.invoke(IPC.collectionState),
    export: (includeIncomplete = false) => ipcRenderer.invoke(IPC.collectionExport, includeIncomplete),
    onEvent: (listener) => on<CollectionEvent>(IPC.collectionEvent, listener)
  },
  links: {
    importItems: () => ipcRenderer.invoke(IPC.linksImport),
    openLogin: () => ipcRenderer.invoke(IPC.linksOpenLogin),
    hasCookies: () => ipcRenderer.invoke(IPC.linksHasCookies),
    resolve: (shortUrl) => ipcRenderer.invoke(IPC.linksResolve, shortUrl),
    export: (items) => ipcRenderer.invoke(IPC.linksExport, items),
    onCookiesCaptured: (listener) => on<void>(IPC.linksCookiesCaptured, listener)
  },
  bloggers: {
    openBrowser: (accountId) => ipcRenderer.invoke(IPC.bloggersOpenBrowser, accountId),
    openDetail: (accountId, profileUrl) =>
      ipcRenderer.invoke(IPC.bloggersOpenDetail, accountId, profileUrl),
    fetchPage: (page) => ipcRenderer.invoke(IPC.bloggersFetchPage, page),
    closeBrowser: () => ipcRenderer.invoke(IPC.bloggersCloseBrowser),
    export: (items) => ipcRenderer.invoke(IPC.bloggersExport, items),
    onRequestCaptured: (listener) => on<void>(IPC.bloggersRequestCaptured, listener)
  },
  invites: {
    importItems: () => ipcRenderer.invoke(IPC.invitesImport),
    exportTemplate: () => ipcRenderer.invoke(IPC.invitesExportTemplate),
    openBrowser: (accountId, profileUrl) =>
      ipcRenderer.invoke(IPC.invitesOpenBrowser, accountId, profileUrl),
    send: (item, accountId) => ipcRenderer.invoke(IPC.invitesSend, item, accountId),
    export: (items) => ipcRenderer.invoke(IPC.invitesExport, items),
    onRequestCaptured: (listener) => on<void>(IPC.invitesRequestCaptured, listener)
  }
}

contextBridge.exposeInMainWorld('desktop', desktop)