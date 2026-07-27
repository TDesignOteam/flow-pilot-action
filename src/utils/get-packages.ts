import type { PackageType } from '../types'
import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { globSync } from 'tinyglobby'
import { parse } from 'yaml'

export interface Package {
  name: string
  version?: string
  type: PackageType
  private: boolean
  dependencies: string[]
  dir: string
  relativeDir: string
}

const MANIFEST_PATTERN = '**/{package.json,pubspec.yaml}'
const IGNORE_PATTERNS = [
  '**/.dart_tool/**',
  '**/.git/**',
  '**/.pub-cache/**',
  '**/build/**',
  '**/coverage/**',
  '**/dist/**',
  '**/example/**',
  '**/examples/**',
  '**/node_modules/**',
]

function parseManifest(manifestPath: string) {
  const content = readFileSync(manifestPath, 'utf8')

  try {
    return basename(manifestPath) === 'package.json' ? JSON.parse(content) : parse(content)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse package manifest "${manifestPath}": ${message}`)
  }
}

function getNodeDependencies(manifest: Record<string, unknown>) {
  return [...new Set(['dependencies', 'devDependencies'].flatMap((field) => {
    const dependencies = manifest[field]
    return dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)
      ? Object.keys(dependencies)
      : []
  }))]
}

export function getPackages(path: string): Package[] {
  const rootDir = resolve(path)
  const manifestPaths = globSync(MANIFEST_PATTERN, {
    absolute: true,
    cwd: rootDir,
    followSymbolicLinks: false,
    ignore: IGNORE_PATTERNS,
  })

  if (!manifestPaths.length) {
    throw new Error(`No package.json or pubspec.yaml found in "${rootDir}"`)
  }

  const hasNestedPackages = manifestPaths.some(manifestPath => relative(rootDir, dirname(manifestPath)) !== '')
  const packageManifestPaths = hasNestedPackages
    ? manifestPaths.filter(manifestPath => relative(rootDir, dirname(manifestPath)) !== '')
    : manifestPaths

  const packageDirs = new Set<string>()
  packageManifestPaths.forEach((manifestPath) => {
    const dir = dirname(manifestPath)
    if (packageDirs.has(dir))
      throw new Error(`Multiple package manifests found in "${dir}"`)
    packageDirs.add(dir)
  })

  return packageManifestPaths.map((manifestPath) => {
    const manifest = parseManifest(manifestPath)
    if (!manifest || typeof manifest !== 'object' || !('name' in manifest) || typeof manifest.name !== 'string' || !manifest.name.trim()) {
      throw new Error(`Package manifest "${manifestPath}" is missing a valid "name" field`)
    }

    const dir = dirname(manifestPath)
    const relativeDir = relative(rootDir, dir).split(sep).join('/') || '.'
    const type = basename(manifestPath) === 'package.json' ? 'node' as const : 'flutter' as const

    return {
      name: manifest.name,
      version: typeof manifest.version === 'string' ? manifest.version : undefined,
      type,
      private: type === 'node' ? manifest.private === true : manifest.publish_to === 'none',
      dependencies: type === 'node' ? getNodeDependencies(manifest) : [],
      dir,
      relativeDir,
    }
  }).sort((a, b) => a.relativeDir.localeCompare(b.relativeDir) || a.type.localeCompare(b.type))
}

export function getSinglePackage(rootDir: string, manifestPath: string): Package {
  const absolutePath = resolve(rootDir, manifestPath)
  const manifest = parseManifest(absolutePath)
  if (!manifest || typeof manifest !== 'object' || !('name' in manifest) || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error(`Package manifest "${absolutePath}" is missing a valid "name" field`)
  }

  const dir = dirname(absolutePath)
  const relativeDir = relative(rootDir, dir).split(sep).join('/') || '.'
  const type = basename(absolutePath) === 'package.json' ? 'node' as const : 'flutter' as const

  return {
    name: manifest.name,
    version: typeof manifest.version === 'string' ? manifest.version : undefined,
    type,
    private: type === 'node' ? manifest.private === true : manifest.publish_to === 'none',
    dependencies: type === 'node' ? getNodeDependencies(manifest) : [],
    dir,
    relativeDir,
  }
}
