import path from 'node:path'
import { afterEach, describe, it, vi } from 'vitest'

vi.mock('node:process', async (importOriginal) => {
  return {
    ...await importOriginal<typeof import('node:process')>(),
    // this will only affect "foo" outside of the original module
    cwd: () => path.resolve(__dirname, '../fixtures/repo2'),
  }
})
describe('main', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('repo2', async () => {
    vi.mock('node:process', async (importOriginal) => {
      return {
        ...await importOriginal<typeof import('node:process')>(),
        // this will only affect "foo" outside of the original module
        cwd: () => path.resolve(__dirname, '../fixtures/repo2'),
      }
    })
    const { main } = await import('../src/main')
    await main()
  })
})
