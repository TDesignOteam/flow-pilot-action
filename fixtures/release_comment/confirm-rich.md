<!-- eslint-disable markdown/no-multiple-h1 -->
# 🎉 发布 @tdesign/web-components-chat
## 🌈 1.3.2 `2026-09-03`

### 📦 分包与迁移说明

> [!WARNING]
> 原 `tdesign-web-components` 包中的基础 UI 组件与 AI Chat 组件现已拆分为两个独立发布的 npm 包。原包用户升级时需调整依赖名称和引入路径。
>
> - `@tdesign/web-components`：承接原包的基础 UI 组件，如 Button、Input、Dialog 等，可独立使用。
> - `@tdesign/web-components-chat`：承接原包的 AI Chat 组件，如 Chatbot、ChatMessage、ChatSender 等，并且依赖 `@tdesign/web-components` 提供基础 UI，并依赖 `@tdesign/ai-chat-engine` 提供对话引擎能力。

依赖关系：

```text
@tdesign/web-components-chat
├── @tdesign/web-components（基础 UI）
└── @tdesign/ai-chat-engine（对话引擎）
```

原包用户需调整依赖名称和引入路径：

| 用途 | 原引入路径 | 新引入路径 |
| --- | --- | --- |
| 基础组件 | `tdesign-web-components/button` | `@tdesign/web-components/button` |
| 对话组件 | `tdesign-web-components/chatbot` | `@tdesign/web-components-chat/chatbot` |
| 基础样式 | `tdesign-web-components/style/index.css` | `@tdesign/web-components/style/index.css` |

### 🚀 Features

- `ChatMessage`: 支持通过命名 slot 自定义文本、Markdown、图片等内置消息内容 @LzhengH ([#422](https://github.com/TDesignOteam/tdesign-web-components/pull/422))

### 🐞 Bug Fixes

- `ChatMarkdown`: 修复引用块内列表缩进丢失导致样式重叠的问题 @RSS1102 ([#431](https://github.com/TDesignOteam/tdesign-web-components/pull/431))
- `ChatSender`: 修复使用中文输入法时，在拼音组合阶段按 Enter 会误发送消息的问题 @LzhengH ([#422](https://github.com/TDesignOteam/tdesign-web-components/pull/422))
- `Chatbot`:
  - 修复消息完成后，操作栏等动态内容需要等到下一次更新才显示的问题 @LzhengH ([#422](https://github.com/TDesignOteam/tdesign-web-components/pull/422))
  - 修复通过 `senderProps` 配置的发送和停止回调不触发的问题 @LzhengH ([#422](https://github.com/TDesignOteam/tdesign-web-components/pull/422))

---

# 🎉 发布 @tdesign/web-components
## 🌈 1.3.2 `2026-09-03`

### 📦 分包与迁移说明

> [!WARNING]
> 原 `tdesign-web-components` 包中的基础 UI 组件与 AI Chat 组件现已拆分为两个独立发布的 npm 包。原包用户升级时需调整依赖名称和引入路径。
>
> - `@tdesign/web-components`：承接原包的基础 UI 组件，如 Button、Input、Dialog 等，可独立使用，不依赖 Chat 包。
> - `@tdesign/web-components-chat`：承接原包的 AI Chat 组件，如 Chatbot、ChatMessage、ChatSender 等，并且依赖 `@tdesign/web-components`，需使用对话组件时请安装此基础 UI 包。

原包用户需调整依赖名称和引入路径：

| 用途 | 原引入路径 | 新引入路径 |
| --- | --- | --- |
| 全量基础组件 | `tdesign-web-components` | `@tdesign/web-components` |
| 按需基础组件 | `tdesign-web-components/button` | `@tdesign/web-components/button` |
| 基础样式 | `tdesign-web-components/style/index.css` | `@tdesign/web-components/style/index.css` |
| 对话组件 | `tdesign-web-components/chatbot` | `@tdesign/web-components-chat/chatbot` |

### 🐞 Bug Fixes

- `Space`: 修复在 React 中无法正确显示子内容，以及动态更新间距不生效的问题 @LzhengH ([#422](https://github.com/TDesignOteam/tdesign-web-components/pull/422))
