import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  platform: 'node',
  shims: true,
  format: 'cjs',
  entry: ['src/index.ts'],
  noExternal: [...Object.keys(packageJson.dependencies)],
})
