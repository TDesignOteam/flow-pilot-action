import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getPackages } from '../src/utils/get-packages'

const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-pilot-packages-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  tempDirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true }))
})

describe('getPackages', () => {
  it('discovers Flutter and Node packages while excluding the repository root', () => {
    expect(getPackages('fixtures/repo3')).toMatchObject([
      { name: 'flutter_a', version: '1.0.0', type: 'flutter', private: false, relativeDir: 'packages/flutter-a' },
      { name: 'flutter_private', version: '1.0.0', type: 'flutter', private: true, relativeDir: 'packages/flutter-private' },
      { name: 'node-tool', version: '1.0.0', type: 'node', private: true, relativeDir: 'packages/node-tool' },
    ])
  })

  it('returns the root manifest for a single-package repository', () => {
    const packages = getPackages('fixtures/repo3/packages/flutter-a')
    expect(packages).toMatchObject([
      { name: 'flutter_a', version: '1.0.0', type: 'flutter', private: false, relativeDir: '.' },
    ])
    expect(packages[0].dir).toBe(resolve('fixtures/repo3/packages/flutter-a'))
  })

  it('reads Node runtime and development dependencies', () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'example',
      dependencies: { runtime: 'workspace:^', shared: '^1.0.0' },
      devDependencies: { development: '^1.0.0', shared: '^1.0.0' },
      peerDependencies: { peer: '^1.0.0' },
    }))

    expect(getPackages(dir)[0].dependencies).toEqual(['runtime', 'shared', 'development'])
  })

  it('keeps a Flutter root package when it contains an example app', () => {
    const dir = createTempDir()
    mkdirSync(join(dir, 'example'), { recursive: true })
    writeFileSync(join(dir, 'pubspec.yaml'), 'name: root_package\nversion: 1.0.0')
    writeFileSync(join(dir, 'example/pubspec.yaml'), 'name: example_app\nversion: 1.0.0\npublish_to: none')

    expect(getPackages(dir)).toMatchObject([
      { name: 'root_package', type: 'flutter', relativeDir: '.' },
    ])
  })

  it('rejects multiple manifests in the same package directory', () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'package.json'), '{"name":"node-package"}')
    writeFileSync(join(dir, 'pubspec.yaml'), 'name: flutter_package')

    expect(() => getPackages(dir)).toThrow(/Multiple package manifests found/)
  })

  it('does not validate an excluded repository root manifest', () => {
    const dir = createTempDir()
    mkdirSync(join(dir, 'packages/child'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{"private":true}')
    writeFileSync(join(dir, 'packages/child/package.json'), '{"name":"child"}')

    expect(getPackages(dir)).toMatchObject([
      { name: 'child', type: 'node', relativeDir: 'packages/child' },
    ])
  })

  it('ignores dependency and build output directories', () => {
    const dir = createTempDir()
    mkdirSync(join(dir, 'node_modules/ignored'), { recursive: true })
    mkdirSync(join(dir, 'build/ignored'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{"name":"root-package"}')
    writeFileSync(join(dir, 'node_modules/ignored/package.json'), '{"name":"ignored-node"}')
    writeFileSync(join(dir, 'build/ignored/pubspec.yaml'), 'name: ignored_flutter')

    expect(getPackages(dir)).toMatchObject([
      { name: 'root-package', type: 'node', relativeDir: '.' },
    ])
  })

  it('reports malformed manifests with their path', () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'pubspec.yaml'), 'name: [')

    expect(() => getPackages(dir)).toThrow(/Failed to parse package manifest .*pubspec\.yaml/)
  })

  it('rejects manifests without a name', () => {
    const dir = createTempDir()
    writeFileSync(join(dir, 'package.json'), '{"version":"1.0.0"}')

    expect(() => getPackages(dir)).toThrow(/package\.json.*missing a valid "name" field/)
  })

  it('rejects directories without package manifests', () => {
    const dir = createTempDir()

    expect(() => getPackages(dir)).toThrow(/No package\.json or pubspec\.yaml found/)
  })
})
