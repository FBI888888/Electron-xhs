import type {
  AccountCreateInput,
  AccountSessionEvent,
  AccountUpdateInput,
  AccountView,
  AppInfo,
  BloggerListItem,
  CollectionSettings,
  CollectionTaskInput,
  CollectionTaskState,
  InviteItem,
  LicenseInfo,
  PasswordLoginInput,
  LinkConversionItem
} from './models'
import type { Result } from './result'

export type CollectionEvent =
  | { type: 'state'; state: CollectionTaskState }
  | { type: 'log'; level: 'info' | 'warning' | 'error'; message: string; at: string }

export interface DesktopApi {
  app: {
    getInfo: () => Promise<Result<AppInfo>>
    quit: () => Promise<void>
  }
  license: {
    getInfo: () => Promise<Result<LicenseInfo | null>>
    verify: () => Promise<Result<LicenseInfo>>
    activate: (licenseKey: string, force?: boolean) => Promise<Result<LicenseInfo>>
    unbind: () => Promise<Result<void>>
    onExpired: (listener: (message: string) => void) => () => void
  }
  accounts: {
    list: () => Promise<Result<AccountView[]>>
    create: (input: AccountCreateInput) => Promise<Result<AccountView>>
    update: (accountId: string, patch: AccountUpdateInput) => Promise<Result<AccountView>>
    remove: (accountId: string) => Promise<Result<void>>
    check: (accountId: string) => Promise<Result<AccountView>>
    checkAll: () => Promise<Result<AccountView[]>>
    openLogin: () => Promise<Result<void>>
    passwordLogin: (input: PasswordLoginInput) => Promise<Result<AccountView>>
    refresh: (accountId: string) => Promise<Result<AccountView>>
    cancelLogin: () => Promise<Result<void>>
    onSessionEvent: (listener: (event: AccountSessionEvent) => void) => () => void
  }
  settings: {
    get: () => Promise<Result<CollectionSettings>>
    save: (settings: CollectionSettings) => Promise<Result<CollectionSettings>>
    chooseDirectory: () => Promise<Result<string | null>>
  }
  collection: {
    importTargets: () => Promise<Result<string[]>>
    start: (input: CollectionTaskInput) => Promise<Result<CollectionTaskState>>
    pause: () => Promise<Result<CollectionTaskState>>
    resume: () => Promise<Result<CollectionTaskState>>
    stop: () => Promise<Result<CollectionTaskState>>
    getState: () => Promise<Result<CollectionTaskState>>
    export: (includeIncomplete?: boolean) => Promise<Result<string | null>>
    onEvent: (listener: (event: CollectionEvent) => void) => () => void
  }
  links: {
    importItems: () => Promise<Result<string[]>>
    openLogin: () => Promise<Result<void>>
    resolve: (shortUrl: string) => Promise<Result<LinkConversionItem>>
    export: (items: LinkConversionItem[]) => Promise<Result<string | null>>
    onCookiesCaptured: (listener: () => void) => () => void
  }
  bloggers: {
    openBrowser: (accountId: string) => Promise<Result<void>>
    openDetail: (accountId: string, profileUrl: string) => Promise<Result<void>>
    fetchPage: (page: number) => Promise<Result<{ items: BloggerListItem[]; total: number }>>
    closeBrowser: () => Promise<Result<void>>
    export: (items: BloggerListItem[]) => Promise<Result<string | null>>
    onRequestCaptured: (listener: () => void) => () => void
  }
  invites: {
    importItems: () => Promise<Result<InviteItem[]>>
    exportTemplate: () => Promise<Result<string | null>>
    openBrowser: (accountId: string, profileUrl: string) => Promise<Result<void>>
    send: (item: InviteItem, accountId: string) => Promise<Result<InviteItem>>
    export: (items: InviteItem[]) => Promise<Result<string | null>>
    onRequestCaptured: (listener: () => void) => () => void
  }
}