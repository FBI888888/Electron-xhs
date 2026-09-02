import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ensureDirectory = (directory: string): string => {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  return directory
}

export interface AppPaths {
  root: string
  data: string
  userData: string
  sessionData: string
  cache: string
  logs: string
  temp: string
}

export const resolveAppRoot = (): string =>
  app.isPackaged ? dirname(app.getPath('exe')) : process.cwd()

export const configureAppPaths = (): AppPaths => {
  const root = resolveAppRoot()
  const data = ensureDirectory(join(root, 'data'))
  const sessionData = ensureDirectory(app.getPath('sessionData'))
  const paths: AppPaths = {
    root,
    data,
    userData: ensureDirectory(join(data, 'userData')),
    sessionData,
    cache: ensureDirectory(join(sessionData, 'Cache')),
    logs: ensureDirectory(join(data, 'logs')),
    temp: ensureDirectory(join(data, 'temp'))
  }

  return paths
}