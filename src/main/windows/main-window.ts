import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

export const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: '蒲公英达人采集系统',
    autoHideMenuBar: true,
    backgroundColor: '#f4f2ef',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}