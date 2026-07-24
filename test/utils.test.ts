import type { Tokens } from 'marked'
import type { PullRequestData } from '../src/types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flutter_pull_request_files, merged_pull_request_files, merged_pull_request_files2, merged_pull_request_files3, pull_request_data, pull_request_files } from '../fixtures/pull_request_data'
import {
  buildReleaseComments,
  extractChangelog,
  extractReleaseLog,
  extractReleaseLogs,
  getInputPkgs,
  getPackages,
  getPullRequestReleaseDirs,
  getStashChangelog,
  isExtractPRLog,
  parseMarkdown,
  renderChangelogMarkdown,
  stashPackageChangelog,
} from '../src/utils/common'

describe('utils', () => {
  it('getInputPkgs supports comma and multiline formats', () => {
    process.env.INPUT_PACKAGES = 'pkg-a,pkg-b\npkg-c\r\n\npkg-d'

    try {
      expect(getInputPkgs()).toEqual(['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d'])
    }
    finally {
      delete process.env.INPUT_PACKAGES
    }
  })

  it('parseMarkdown', () => {
    const list = parseMarkdown('### 📝 更新日志')
    const data = list[0] as Tokens.Heading
    expect(list.length).toBe(1)
    expect(data.type).toBe('heading')
    expect(data.depth).toBe(3)
    expect(data.text).toBe('📝 更新日志')
  })

  it('getPackages', () => {
    const packages = getPackages('fixtures/repo1')
    expect(packages.length).toBe(3)
    expect(packages[0].name).toBe('pkg-a')
    expect(packages[0].relativeDir).toBe('packages/pkg-a')
    expect(packages[1].name).toBe('pkg-b')
    expect(packages[1].relativeDir).toBe('packages/pkg-b')
    expect(packages[2].name).toBe('pkg-c')
    expect(packages[2].relativeDir).toBe('packages/pkg-c')
  })
  describe('isExtractPRLog', () => {
    it('labels 包含 skip-changelog', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.labels = [{
        id: 1,
        node_id: '123',
        name: 'skip-changelog',
        url: 'q3',
        color: '123',
        default: true,
        description: '123',
      }]
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('发布版本PR，release/ 开头', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.head.ref = 'release/1.0.0'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('pr body 申明不纳入 Changelog', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.body = '### 📝 更新日志 \n\n - [x] 本条 PR 不需要纳入 Changelog'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('pr user type 是 Bot', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.user.type = 'Bot'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('正常PR 数据', () => {
      expect(isExtractPRLog(pull_request_data)).toBe(true)
    })
  })

  describe('extractChangelog', () => {
    it('repo1 pkg-b是私有包，不收集日志', () => {
      const packages = getPackages('fixtures/repo1')
      expect(packages.length).toBe(3)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-b')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.name))
      expect(log).toMatchSnapshot()
    })

    it('repo2 无私有包', () => {
      const packages = getPackages('fixtures/repo2')
      expect(packages.length).toBe(3)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-b')
      expect(packages[2].relativeDir).toBe('packages/pkg-c')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.name))
      expect(log).toMatchSnapshot()
    })

    it('all 日志应用到所有包', () => {
      const packages = getPackages('fixtures/repo2')
      const body = readFileSync('fixtures/pull_request_body/pr_body4.md', 'utf8')
      const log = extractChangelog(body, packages.map(pkg => pkg.name))
      expect(log).toMatchSnapshot()
    })

    // it('本条 PR 不需要纳入 Changelog', () => {
    //   const packages = getPackages('fixtures/repo1')

    //   const body = readFileSync('fixtures/pull_request_body/pr_body2.md', 'utf8').replaceAll('\n', '\r\n')
    //   const log = extractChangelog(body, packages.map(pkg => pkg.name))
    //   expect(log).toBe(null)
    // })
  })
  describe('stashPackageChangelog', () => {
    it('stashPackageChangelog1', () => {
      const packages = getPackages('fixtures/repo2')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.name))
      stashPackageChangelog(pull_request_data, packages, log)

      packages.forEach((pkg) => {
        const text = readFileSync(`${pkg.dir}/.changelog/pr-${pull_request_data.number}.md`, 'utf8')
        expect(text).toMatchSnapshot()
      })
    })
    it('stashPackageChangelog2', () => {
      const packages = getPackages('fixtures/repo2')
      const body = readFileSync('fixtures/pull_request_body/pr_body3.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.name))
      pull_request_data.number = 7
      stashPackageChangelog(pull_request_data, packages, log)

      packages.forEach((pkg) => {
        if (!existsSync(`${pkg.dir}/.changelog/pr-${pull_request_data.number}.md`)) {
          return
        }

        const text = readFileSync(`${pkg.dir}/.changelog/pr-${pull_request_data.number}.md`, 'utf8')
        expect(text).toMatchSnapshot()
      })
    })
  })

  it('getPullRequestReleaseDirs', () => {
    const paths = getPullRequestReleaseDirs(pull_request_files)
    expect(paths.length).toBe(2)
    expect(paths[0].dir).toBe('fixtures/repo1/packages/pkg-a')
    expect(paths[0].name).toBe('pkg-a')
    expect(paths[0].version).toBe('1.0.1')
    expect(paths[0].type).toBe('node')
    expect(paths[0].tag).toBe('latest')
    expect(paths[1].dir).toBe('fixtures/repo1/packages/pkg-c')
    expect(paths[1].version).toBe('1.0.1')
    expect(paths[1].name).toBe('pkg-c')
    expect(paths[1].tag).toBe('latest')
  })

  it('getFlutterPullRequestReleaseDirs', () => {
    const paths = getPullRequestReleaseDirs(flutter_pull_request_files)
    expect(paths).toMatchObject([
      {
        dir: 'fixtures/repo3/packages/flutter-a',
        name: 'flutter_a',
        version: '1.0.0',
        type: 'flutter',
        private: false,
        tag: 'latest',
      },
      {
        dir: 'fixtures/repo3/packages/flutter-private',
        name: 'flutter_private',
        version: '1.0.0',
        type: 'flutter',
        private: true,
        tag: 'latest',
      },
    ])
  })

  it('filters release manifests to discovered packages', () => {
    const packages = getPackages('fixtures/repo3').filter(pkg => pkg.name === 'flutter_a')
    const paths = getPullRequestReleaseDirs(flutter_pull_request_files, packages)

    expect(paths).toHaveLength(1)
    expect(paths[0].name).toBe('flutter_a')
  })

  it('fails when a release manifest patch is unavailable', () => {
    const file = { ...flutter_pull_request_files[0], patch: undefined }

    expect(() => getPullRequestReleaseDirs([file])).toThrow(/patch for .*pubspec\.yaml.* is unavailable/)
  })

  it('fails when the checked-out manifest version does not match the diff', () => {
    const file = {
      ...flutter_pull_request_files[0],
      patch: flutter_pull_request_files[0].patch?.replace('+version: "1.0.0"', '+version: "2.0.0"'),
    }

    expect(() => getPullRequestReleaseDirs([file])).toThrow(/has version "1\.0\.0", expected "2\.0\.0"/)
  })

  it('ignores nested pubspec dependency version changes', () => {
    const file = {
      ...flutter_pull_request_files[0],
      patch: '@@ -5,4 +5,4 @@\n dependencies:\n   hosted_package:\n-    version: 1.0.0\n+    version: 2.0.0',
    }

    expect(getPullRequestReleaseDirs([file])).toEqual([])
  })

  it('getMergedPullRequestReleaseDirs', () => {
    const paths = getPullRequestReleaseDirs(merged_pull_request_files)
    expect(paths).toMatchSnapshot()

    const paths2 = getPullRequestReleaseDirs(merged_pull_request_files2)
    expect(paths2).toMatchSnapshot()

    const paths3 = getPullRequestReleaseDirs(merged_pull_request_files3)
    expect(paths3).toMatchSnapshot()
  })

  it('getStashChangelog', () => {
    const changelog = getStashChangelog('./fixtures/repo2/packages/pkg-a', 'node')

    expect(changelog).toMatchSnapshot()
  })

  it('getFlutterStashChangelog', () => {
    const changelog = getStashChangelog('./fixtures/repo3/packages/flutter-a', 'flutter')

    expect(changelog).toEqual({ pkg: 'flutter_a', version: '1.0.0', changelogs: [] })
  })

  it('renderChangelogMarkdown', () => {
    const changelog = getStashChangelog('./fixtures/repo2/packages/pkg-a', 'node')
    const md = renderChangelogMarkdown(changelog.changelogs)
    expect(md).toMatchSnapshot()
  })

  it('extractReleaseLog', () => {
    const body = readFileSync('fixtures/release_comment/confirm.md', 'utf8').replaceAll('\n', '\r\n')
    const releaseLog = extractReleaseLog(body)
    expect(releaseLog).toMatchSnapshot()
  })

  it('extractReleaseLogs (merged)', () => {
    const body = readFileSync('fixtures/release_comment/confirm-merged.md', 'utf8').replaceAll('\n', '\r\n')
    const releaseLogs = extractReleaseLogs(body)
    expect(releaseLogs).toMatchSnapshot()
    expect(releaseLogs).toHaveLength(3)
    expect(releaseLogs.map(l => l.pkgName)).toEqual(['pkg-a', 'pkg-b', 'pkg-c'])
  })

  it('extractReleaseLogs (single - backward compat)', () => {
    const body = readFileSync('fixtures/release_comment/confirm.md', 'utf8').replaceAll('\n', '\r\n')
    const releaseLogs = extractReleaseLogs(body)
    expect(releaseLogs).toHaveLength(1)
    expect(releaseLogs[0].pkgName).toBe('pkg-a')
  })

  it('extractReleaseLogs tolerates edited separators', () => {
    const body = '# 🎉 发布 pkg-a\n## 🌈 1.0.0\n\n- feature a\n---\n# 🎉 发布 pkg-b\n## 🌈 2.0.0\n\n- feature b'

    expect(extractReleaseLogs(body)).toEqual([
      { pkgName: 'pkg-a', changelog: '## 🌈 1.0.0\n\n- feature a\n\n' },
      { pkgName: 'pkg-b', changelog: '## 🌈 2.0.0\n\n- feature b\n\n' },
    ])
  })

  it('extractReleaseLogs rejects a nested package heading', () => {
    const body = '# 🎉 发布 pkg-a\n## 🌈 1.0.0\n\n- feature a\n\n## 🎉 发布 pkg-b\n## 🌈 2.0.0\n\n- feature b'

    expect(() => extractReleaseLogs(body)).toThrow('must be level 1')
  })

  it('extractReleaseLogs rejects mixed languages', () => {
    const body = '# 🎉 发布 pkg-a\n## 🌈 1.0.0\n\n- feature a\n\n# 🎉 Release pkg-b\n## 🌈 2.0.0\n\n- feature b'

    expect(() => extractReleaseLogs(body, '🎉 发布')).toThrow('mixed languages')
  })

  it('extractReleaseLogs rejects a missing package name', () => {
    const body = '# 🎉 发布 pkg-a\n## 🌈 1.0.0\n\n- feature a\n\n# 🎉 发布\n## 🌈 2.0.0\n\n- feature b'

    expect(() => extractReleaseLogs(body, '🎉 发布')).toThrow('missing a package name')
  })

  it('buildReleaseComments merges sections within the limit', () => {
    expect(buildReleaseComments('head\n', ['section-a', 'section-b'], 40)).toEqual([
      'head\nsection-a\n\n---\n\nsection-b',
    ])
  })

  it('buildReleaseComments splits comments at section boundaries', () => {
    expect(buildReleaseComments('head\n', ['section-a', 'section-b'], 20)).toEqual([
      'head\nsection-a',
      'head\nsection-b',
    ])
  })

  it('buildReleaseComments rejects an oversized package section', () => {
    expect(() => buildReleaseComments('head\n', ['section-a'], 10)).toThrow('exceeds the GitHub comment length limit')
  })
})
