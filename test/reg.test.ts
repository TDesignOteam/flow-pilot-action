import { describe, expect, it } from 'vitest'
import { NEW_VERSION_REG, OLD_VERSION_REG } from '../src/consts'

describe('reg', () => {
  describe(':NEW_VERSION_REG & OLD_VERSION_REG', () => {
    it('版本号无修改', () => {
      const text = `
      - "version": "1.0.0",
      + "version": "1.0.0"
      `
      const oldVersion = text.match(OLD_VERSION_REG)?.[1]
      const newVersion = text.match(NEW_VERSION_REG)?.[1]
      expect(oldVersion === '1.0.0').toBe(true)
      expect(newVersion === '1.0.0').toBe(true)
      expect(oldVersion === newVersion).toBe(true)
    })

    it('版本号有修改，带换行的格式', () => {
      const text = `
- "version": "1.0.0",
+ "version": "1.0.1",
`
      const oldVersion = text.match(OLD_VERSION_REG)?.[1]
      const newVersion = text.match(NEW_VERSION_REG)?.[1]
      expect(oldVersion === '1.0.0').toBe(true)
      expect(newVersion === '1.0.1').toBe(true)
      expect(oldVersion === newVersion).toBe(false)
    })

    it('版本号有修改,无换行格式', () => {
      const text = `\n-  "version": "1.0.0",\n+  "version": "1.0.1",`
      const oldVersion = text.match(OLD_VERSION_REG)?.[1]
      const newVersion = text.match(NEW_VERSION_REG)?.[1]
      expect(oldVersion === '1.0.0').toBe(true)
      expect(newVersion === '1.0.1').toBe(true)
      expect(oldVersion === newVersion).toBe(false)
    })
    it('新版本版本号带beta', () => {
      const text = `\n-  "version": "1.0.0",\n+  "version": "1.0.1.beta",`
      const oldVersion = text.match(OLD_VERSION_REG)?.[1]
      const newVersion = text.match(NEW_VERSION_REG)?.[1]
      expect(oldVersion === '1.0.0').toBe(true)
      expect(newVersion === '1.0.1.beta').toBe(true)
      expect(oldVersion === newVersion).toBe(false)
    })
    it('新版本版本号带beta.1', () => {
      const text = `\n-  "version": "1.0.0",\n+  "version": "1.0.1.beta.1",`
      const oldVersion = text.match(OLD_VERSION_REG)?.[1]
      const newVersion = text.match(NEW_VERSION_REG)?.[1]
      expect(oldVersion === '1.0.0').toBe(true)
      expect(newVersion === '1.0.1.beta.1').toBe(true)
      expect(oldVersion === newVersion).toBe(false)
    })
  })
})
