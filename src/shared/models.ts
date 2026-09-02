export type MemberLevel = 'VIP' | 'VVIP' | 'SVIP'
export type AccountStatus = 'unchecked' | 'checking' | 'active' | 'expired' | 'error'
export type TaskStatus =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'cancelled'
  | 'completed'
  | 'failed'

export type TargetStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'

export interface Account {
  id: string
  remark: string
  nickname: string
  cookies: string
  status: AccountStatus
  email?: string
  password?: string
  lastUseDate?: string
  todayUseCount: number
  createdAt: string
  updatedAt: string
}

export interface AccountView {
  id: string
  remark: string
  nickname: string
  status: AccountStatus
  cookiePreview: string
  emailMasked?: string
  hasCredentials: boolean
  lastUseDate?: string
  todayUseCount: number
  createdAt: string
  updatedAt: string
}

export interface AccountCreateInput {
  remark: string
  cookies: string
  email?: string
  password?: string
}

export interface AccountUpdateInput {
  remark?: string
  cookies?: string
  email?: string
  password?: string
  clearCredentials?: boolean
}

export interface PasswordLoginInput {
  remark: string
  email: string
  password: string
}

export type AccountSessionStage =
  | 'opening'
  | 'waiting'
  | 'submitting'
  | 'verifying'
  | 'refreshing'
  | 'completed'
  | 'failed'

export interface AccountSessionEvent {
  operation: 'web-login' | 'password-login' | 'refresh' | 'check-all'
  stage: AccountSessionStage
  message: string
  accountId?: string
  account?: AccountView
  accounts?: AccountView[]
}

export type CollectionConcurrency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface CollectionSettings {
  schemaVersion: 1
  output: {
    filename: string
    directory: string
  }
  performanceFields: string[]
  maxCount: number
  concurrency: CollectionConcurrency
  throttleMs: number
  splitFansProfile: boolean
}

export interface CollectionTarget {
  id: string
  userId: string
  pgyUrl: string
  xhsUrl: string
  nickname: string
  healthLevel?: string | number
  status: TargetStatus
  statusText: string
  collectedAt?: string
  snapshot?: BloggerSnapshot
  errors: CollectionSubtaskError[]
}

export interface CollectionSubtaskError {
  source: string
  code: string
  message: string
  retryable: boolean
}

export interface BloggerSnapshot {
  schemaVersion: 1
  userId: string
  capturedAt: string
  accountId: string
  data: Record<string, unknown>
}

export interface CollectionTaskState {
  id: string | null
  status: TaskStatus
  targets: CollectionTarget[]
  total: number
  completed: number
  succeeded: number
  failed: number
  startedAt?: string
  finishedAt?: string
  message?: string
}

export interface CollectionTaskInput {
  targets: Array<Pick<CollectionTarget, 'userId' | 'pgyUrl' | 'xhsUrl'>>
  settings: CollectionSettings
}

export interface LicenseInfo {
  licenseKey: string
  memberLevel: MemberLevel
  expireAt: string
  daysRemaining: number
  machineCode?: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDirectory: string
  security: {
    secretsEncrypted: boolean
    warning?: string
  }
}

export interface LinkConversionItem {
  id: string
  shortUrl: string
  longUrl: string
  status: 'pending' | 'running' | 'success' | 'unrecognized' | 'failed'
  message?: string
}

export interface BloggerListItem {
  userId: string
  name: string
  location?: string
  fansCount?: number
  picturePrice?: number
  videoPrice?: number
  raw: Record<string, unknown>
}

export interface InviteItem {
  id: string
  profileUrl: string
  accountNickname?: string
  cooperationType: string
  productName: string
  content: string
  contact: string
  status: 'pending' | 'running' | 'success' | 'failed'
  message?: string
  invitedAt?: string
}