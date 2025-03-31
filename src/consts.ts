export const SKIP_CHANGELOG_REG = /\[x\] 本条 PR 不需要纳入 Changelog/i
export const SKIP_CHANGELOG_LABEL = 'skip-changelog'
export const OLD_VERSION_REG = /\s*-\s*"version":\s*"(.*)"/
export const NEW_VERSION_REG = /\s*\+\s*"version":\s*"(.*)"/
export const CHANGELOG_REG = /-\s*([A-Z]+)(?:\(([A-Z\s_-]*)\))?\s*:\s*(.+)/i
