import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

export type PullRequestData = RestEndpointMethodTypes['pulls']['get']['response']['data']
export type PackagesChangelog = Record<string, string[]>
