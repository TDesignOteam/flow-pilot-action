# FlowPilot

结合 "Flow"（流程）和 "Pilot"（导航），寓意工具像导航仪一样自动化驱动 Changelog 生成、版本更新和发包流程

## 发布配置

- Node 包通过 `pnpm publish` 发布；Flutter 包只创建 GitHub Release 及 `${name}@${version}` tag，由 tag 触发配置了 OIDC 的发布工作流。
- `package.json` 的 `private: true` 和 `pubspec.yaml` 的 `publish_to: none` 只跳过 registry 发布，仍允许创建 GitHub Release/tag。
- release PR 合并发布只能配置 `pull_request: closed` 或 `pull_request_target: closed` 其中一种事件，不能同时配置，否则会重复触发同一版本的发布。
