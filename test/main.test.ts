import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:process', async (importOriginal) => {
  return {
    ...await importOriginal<typeof import('node:process')>(),
    // this will only affect "foo" outside of the original module
    cwd: () => path.resolve(__dirname, '../fixtures'),
  }
})

describe('main', () => {
  it('main', async () => {
    const { main } = await import('../src/main')
    try {
      main()
    }
    catch (error) {
      expect(error.message).toBe('The file .flow-pilot.json does not exist.')
    }
  })
})
