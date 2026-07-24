import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

export type PullRequestData = RestEndpointMethodTypes['pulls']['get']['response']['data']
export type PullRequestFiles = RestEndpointMethodTypes['pulls']['listFiles']['response']['data']
export type PackagesChangelog = Record<string, string[]>
export type PackageType = 'node' | 'flutter'

export interface ReleasePackage {
  dir: string
  name: string
  version: string
  oldVersion: string
  type: PackageType
  private: boolean
  tag: string
  changelog: string
}
