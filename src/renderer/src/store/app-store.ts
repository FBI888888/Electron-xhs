import { create } from 'zustand'
import type {
  AccountView,
  AppInfo,
  CollectionSettings,
  CollectionTaskState,
  LicenseInfo
} from '@shared/models'
import { DEFAULT_SETTINGS } from '@domain/migration'
import { createIdleTaskState } from '@domain/task-machine'

interface AppState {
  ready: boolean
  loading: boolean
  appInfo: AppInfo | null
  license: LicenseInfo | null
  licenseError: string
  accounts: AccountView[]
  settings: CollectionSettings
  task: CollectionTaskState
  initialize: () => Promise<void>
  setLicense: (license: LicenseInfo | null, error?: string) => void
  setAccounts: (accounts: AccountView[]) => void
  reloadAccounts: () => Promise<boolean>
  setSettings: (settings: CollectionSettings) => void
  persistSettings: (settings: CollectionSettings) => Promise<boolean>
  setTask: (task: CollectionTaskState) => void
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  loading: true,
  appInfo: null,
  license: null,
  licenseError: '',
  accounts: [],
  settings: DEFAULT_SETTINGS,
  task: createIdleTaskState(),

  initialize: async () => {
    set({ loading: true })
    const [appInfo, license, accounts, settings, task] = await Promise.all([
      window.desktop.app.getInfo(),
      window.desktop.license.verify(),
      window.desktop.accounts.list(),
      window.desktop.settings.get(),
      window.desktop.collection.getState()
    ])
    set({
      ready: true,
      loading: false,
      appInfo: appInfo.ok ? appInfo.data : null,
      license: license.ok ? license.data : null,
      licenseError: license.ok ? '' : license.error.message,
      accounts: accounts.ok ? accounts.data : [],
      settings: settings.ok ? settings.data : DEFAULT_SETTINGS,
      task: task.ok ? task.data : createIdleTaskState()
    })
  },

  setLicense: (license, licenseError = '') => set({ license, licenseError }),
  setAccounts: (accounts) => set({ accounts }),
  reloadAccounts: async () => {
    const result = await window.desktop.accounts.list()
    if (!result.ok) return false
    set({ accounts: result.data })
    return true
  },
  setSettings: (settings) => set({ settings }),
  persistSettings: async (settings) => {
    const result = await window.desktop.settings.save(settings)
    if (!result.ok) return false
    set({ settings: result.data })
    return true
  },
  setTask: (task) => set({ task })
}))

interface ToastMessage {
  id: string
  kind: 'success' | 'warning' | 'error' | 'info'
  title: string
  message: string
}

interface ToastState {
  messages: ToastMessage[]
  push: (toast: Omit<ToastMessage, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  messages: [],
  push: (toast) => {
    const id = crypto.randomUUID()
    set((state) => ({ messages: [...state.messages, { ...toast, id }] }))
    window.setTimeout(() => {
      set((state) => ({ messages: state.messages.filter((item) => item.id !== id) }))
    }, 3500)
  },
  dismiss: (id) =>
    set((state) => ({ messages: state.messages.filter((item) => item.id !== id) }))
}))