import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export class JsonStore<T> {
  private operations: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly fallback: T,
    private readonly migrate?: (value: unknown) => T
  ) {}

  read(): Promise<T> {
    return this.enqueue(async () => {
      if (!existsSync(this.filePath)) return structuredClone(this.fallback)
      const content = await fs.readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ''))
      return this.migrate ? this.migrate(parsed) : (parsed as T)
    })
  }

  write(value: T): Promise<T> {
    return this.enqueue(async () => {
      await fs.mkdir(dirname(this.filePath), { recursive: true })
      const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8')
        await fs.rename(tempPath, this.filePath)
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => undefined)
      }
      return value
    })
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.operations.then(operation, operation)
    this.operations = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}