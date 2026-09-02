import { app, BrowserWindow, dialog, Menu } from 'electron'
import { configureAppPaths } from '@infrastructure/paths/app-paths'
import { IPC } from '@shared/ipc'
import { createMainWindow } from './windows/main-window'
import { createServices } from './services'
import { registerIpc } from './ipc/register-ipc'

const paths = configureAppPaths()
let mainWindow: BrowserWindow | null = null
let services: ReturnType<typeof createServices> | null = null

const createWindow = (): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const boot = async (): Promise<void> => {
  Menu.setApplicationMenu(null)
  services = createServices(paths, () => mainWindow)
  registerIpc(services, paths, () => mainWindow)

  services.license.startHeartbeat((message) => {
    services?.accounts.stopPeriodicChecks()
    services?.accounts.cancelLogin()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC.licenseExpired, message)
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '授权提醒',
      message,
      detail: '当前授权已失效，采集相关功能将被暂停。'
    })
  })
  createWindow()
  void services.license.verify().then((verified) => {
    if (verified.ok) services?.accounts.startPeriodicChecks()
  })
}

app.whenReady().then(boot)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  services?.accounts.stopPeriodicChecks()
  services?.accounts.cancelLogin()
  services?.license.stopHeartbeat()
  if (process.platform !== 'darwin') app.quit()
})