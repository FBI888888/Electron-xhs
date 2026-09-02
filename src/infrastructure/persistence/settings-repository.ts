import type { CollectionSettings } from '@shared/models'
import { DEFAULT_SETTINGS, migrateLegacySettings } from '@domain/migration'
import { JsonStore } from './json-store'

export class SettingsRepository {
  private readonly store: JsonStore<CollectionSettings>

  constructor(filePath: string) {
    this.store = new JsonStore(filePath, DEFAULT_SETTINGS, migrateLegacySettings)
  }

  read(): Promise<CollectionSettings> {
    return this.store.read()
  }

  write(settings: CollectionSettings): Promise<CollectionSettings> {
    return this.store.write(settings)
  }
}