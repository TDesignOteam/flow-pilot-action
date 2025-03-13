import type { TokensList } from 'marked'
import { marked } from 'marked'

export function parseMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown)
}

export function renderChangelog(markdown: string, pkgs: object) {
  const md = parseMarkdown(markdown)
  const logNode = parseMarkdown('### 📝 更新日志')[0]

  md.forEach((token) => {
    if (token.type === 'heading' && token.depth === logNode.depth && token.text === logNode.text) {
      token.text = `${pkgs[0]}: ${token.text}`
    }
  })
}
