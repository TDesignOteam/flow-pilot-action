# FlowPilot

结合 "Flow"（流程）和 "Pilot"（导航），寓意工具像导航仪一样自动化驱动 Changelog 生成、版本更新和发包流程

## 更新日志格式

FlowPilot 从 PR 描述中的 `### 📝 更新日志` 区块提取日志。包名使用四级标题，日志项使用以下格式：

```text
type(scope): message
```

- `type`：日志类型，支持 `feat`、`fix`、`docs`/`doc`、`perf`/`refactor`、`breaking`/`break`；其他类型归入 `Others`。
- `scope`：可选，表示组件或功能名称，生成日志时会转换为 PascalCase。
- `message`：必填，从用户视角描述本次变更。
- 包名必须与 `package.json` 或 `pubspec.yaml` 中的 `name` 一致；使用 `all` 可将日志应用到所有包。

示例：

```md
### 📝 更新日志

#### all

- docs: 更新公共使用说明

#### pkg-a

- feat(Button): 新增加载状态
- feat(Button): 新增图标插槽
- fix(use-popup): 修复弹层关闭异常
- breaking: 移除废弃属性
```

勾选 `本条 PR 不需要纳入 Changelog`，或为 PR 添加 `skip-changelog` 标签，可跳过日志收集。

## 转换后的日志

PR 合并后，每条日志会自动补充贡献者与 PR 链接，并按类型分组；相同 scope 下存在多条日志时会生成二级列表。以上 `pkg-a` 日志将转换为：

```md
### 🚨 Breaking Changes

- 移除废弃属性 @contributor ([#123](https://github.com/owner/repo/pull/123))

### 🚀 Features

- `Button`:
  - 新增加载状态 @contributor ([#123](https://github.com/owner/repo/pull/123))
  - 新增图标插槽 @contributor ([#123](https://github.com/owner/repo/pull/123))

### 🐞 Bug Fixes

- `UsePopup`: 修复弹层关闭异常 @contributor ([#123](https://github.com/owner/repo/pull/123))

### 📝 Documentation

- 更新公共使用说明 @contributor ([#123](https://github.com/owner/repo/pull/123))
```

类型与最终分组的对应关系：

| 输入类型 | 最终分组 |
| --- | --- |
| `breaking`、`break` | Breaking Changes |
| `feat` | Features |
| `fix` | Bug Fixes |
| `perf`、`refactor` | Performance |
| `docs`、`doc` | Documentation |
| 其他类型 | Others |

## 发布配置

- Node 包通过 `pnpm publish` 发布；Flutter 包只创建 GitHub Release 及 `${name}@${version}` tag，由 tag 触发配置了 OIDC 的发布工作流。
- `package.json` 的 `private: true` 和 `pubspec.yaml` 的 `publish_to: none` 只跳过 registry 发布，仍允许创建 GitHub Release/tag。
- release PR 合并发布只能配置 `pull_request: closed` 或 `pull_request_target: closed` 其中一种事件，不能同时配置，否则会重复触发同一版本的发布。
