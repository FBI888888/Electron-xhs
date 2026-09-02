import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonStore } from './json-store'

const temporaryDirectories: string[] = []

const createStore = async <T>(fallback: T): Promise<{ directory: string; filePath: string; store: JsonStore<T> }> => {
  const directory = await mkdtemp(join(tmpdir(), 'xhs-json-store-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'store.json')
  return { directory, filePath, store: new JsonStore(filePath, fallback) }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('JsonStore', () => {
  it('serializes reads and writes in invocation order', async () => {
    const { directory, store } = await createStore<number[]>([])

    const firstWrite = store.write([1])
    const secondWrite = store.write([1, 2])
    const readAfterWrites = store.read()

    await expect(Promise.all([firstWrite, secondWrite, readAfterWrites])).resolves.toEqual([
      [1],
      [1, 2],
      [1, 2]
    ])
    await expect(store.read()).resolves.toEqual([1, 2])
    await expect(readdir(directory)).resolves.toEqual(['store.json'])
  })

  it('rejects malformed persisted data without overwriting it with fallback data', async () => {
    const { filePath, store } = await createStore<string[]>([])
    await writeFile(filePath, '{invalid-json', 'utf8')

    await expect(store.read()).rejects.toThrow()
    await expect(store.write(['recovered'])).resolves.toEqual(['recovered'])
    await expect(store.read()).resolves.toEqual(['recovered'])
  })

  it('accepts legacy UTF-8 BOM files', async () => {
    const { filePath, store } = await createStore<{ value: number }>({ value: 0 })
    await writeFile(filePath, '\uFEFF{"value":42}', 'utf8')

    await expect(store.read()).resolves.toEqual({ value: 42 })
  })
})