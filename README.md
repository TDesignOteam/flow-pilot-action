# FlowPilot

FlowPilot 是用于 monorepo 发布流程的 GitHub Action。它从 PR 描述中收集 Changelog，将日志暂存到对应包，在 release PR 中生成发布日志，并在 release PR 合并后发布 Node 包或创建 GitHub Release/tag。

FlowPilot 支持包含 `package.json` 的 Node 包和包含 `pubspec.yaml` 的 Flutter 包。版本更新、`release/*` 分支及 release PR 需要由 Changesets、自有脚本或其他发布工具创建，FlowPilot 不负责修改包版本或创建 release PR。

## 功能概览

- 从普通 PR 描述中提取结构化更新日志。
- 通过 `/changelog` 指令、Review 通过或编辑确认评论提交日志。
- 按包生成 `.changelog/pr-<PR number>.md` 暂存文件，并补充贡献者和 PR 链接。
- 在 release PR 中按类型和 scope 汇总日志，生成中英文 Changelog 确认评论。
- release PR 合并后发布 Node 包，并按规则创建 GitHub Release 及 `${name}@${version}` tag。
- 识别同一仓库中的 Node 和 Flutter 包。

## 接入示例

以下配置将 Changelog、Review 回调和 release 发布拆分为三个 workflow。

### `auto-changelog.yml`

Review 通过时上传 PR 编号；release PR 打开或 PR 评论发生变化时，直接运行 FlowPilot。

```yaml
name: auto-changelog

on:
  pull_request:
    types: [opened]
  pull_request_review:
    types: [submitted]
  issue_comment:
    types: [created, edited]

jobs:
  changelog:
    if: github.event_name == 'pull_request_review' && github.event.review.state == 'approved'
    runs-on: ubuntu-latest
    steps:
      - run: echo "${{ github.event.pull_request.number }}" > pr-id.txt

      - uses: actions/upload-artifact@v4
        with:
          name: pr-id
          path: pr-id.txt
          retention-days: 5

  comment-release-changelog:
    if: github.event_name == 'pull_request' && startsWith(github.head_ref, 'release/')
    runs-on: ubuntu-latest
    steps:
      - name: auto-changelog
        uses: TDesignOteam/flow-pilot-action@develop
        with:
          token: ${{ secrets.TDESIGN_BOT_TOKEN }}
          packages: 'tdesign-miniprogram,@tdesign/uniapp,@tdesign/uniapp-chat'

  commit-changelog:
    if: github.event_name == 'issue_comment' && github.event.issue.pull_request
    runs-on: ubuntu-latest
    steps:
      - name: auto-changelog
        uses: TDesignOteam/flow-pilot-action@develop
        with:
          token: ${{ secrets.TDESIGN_BOT_TOKEN }}
          packages: 'tdesign-miniprogram,@tdesign/uniapp,@tdesign/uniapp-chat'
```

### `auto-changelog-callback.yml`

Review workflow 成功后下载 PR 编号，并在可信的 `workflow_run` 上下文中提交 Changelog。

```yaml
name: auto-changelog-callback

on:
  workflow_run:
    workflows:
      - auto-changelog
    types:
      - completed

jobs:
  commit-changelog:
    if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'pull_request_review' }}
    runs-on: ubuntu-latest
    steps:
      - name: Download pr id
        uses: dawidd6/action-download-artifact@v8
        with:
          workflow: ${{ github.event.workflow_run.workflow_id }}
          run_id: ${{ github.event.workflow_run.id }}
          name: pr-id

      - name: Output pr id
        id: pr
        run: echo "id=$(cat pr-id.txt)" >> "$GITHUB_OUTPUT"

      - name: auto-changelog
        uses: TDesignOteam/flow-pilot-action@develop
        with:
          token: ${{ secrets.TDESIGN_BOT_TOKEN }}
          packages: 'tdesign-miniprogram,@tdesign/uniapp,@tdesign/uniapp-chat'
          pr_number: ${{ steps.pr.outputs.id }}
```

### `auto-release.yml`

release PR 合并后完成项目构建，并通过 OIDC 发布。`pnpm install` 和构建命令可按项目调整。

```yaml
name: auto-release

on:
  pull_request:
    types: [closed]

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    if: github.event.pull_request.merged && startsWith(github.head_ref, 'release/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          submodules: recursive

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version

      - run: pnpm install

      - run: pnpm build

      - run: pnpm run uniapp build:npm

      - uses: actions/setup-node@v6
        with:
          node-version: 24

      - uses: TDesignOteam/flow-pilot-action@develop
        with:
          token: ${{ secrets.TDESIGN_BOT_TOKEN }}
          packages: 'tdesign-miniprogram,@tdesign/uniapp,@tdesign/uniapp-chat'
```

`TDESIGN_BOT_TOKEN` 用于读取 PR、提交日志和创建 GitHub Release/tag。发布 workflow 必须使用 `pull_request: closed`；不要改为 `pull_request_target`，否则后续 OIDC 发布会被拒绝。

## Action 参数

| 参数 | 是否必需 | 说明 |
| --- | --- | --- |
| `token` | 按流程 | GitHub API、Git clone/push 和创建 Release 使用的 token。仅生成普通 PR 的 `changelog` output 时可为空，完整流程需要有效 token。 |
| `packages` | Changelog 流程必需 | 参与日志提取的包名。支持逗号或多行输入，名称必须与 manifest 中的 `name` 完全一致。release 检测未配置时会使用发现的全部包。 |
| `pr_number` | `workflow_run` 必需 | `workflow_run` 无法从事件直接获得 PR 编号时使用，其他事件不需要。 |
| `translate-secret-id` | 否 | 腾讯混元翻译 SecretId；与 `translate-secret-key` 同时配置后生成英文 release 日志评论。 |
| `translate-secret-key` | 否 | 腾讯混元翻译 SecretKey。 |
| `mode` | 否 | 仓库模式：`single`(单仓) 或 `monorepo`(monorepo)。默认 `monorepo`。`single` 模式下不依赖 `.changelog/*.md` 暂存文件,直接从 tag 区间已合并 PR 的 body 生成发布日志,且使用纯版本号 git tag(如 `1.2.3`)。 |
| `package-json-path` | 否 | `single` 模式下指定 `package.json` 的相对路径,默认读取仓库根目录的 `package.json`。仅 `single` 模式生效。 |
| `changelog-path` | 否 | `single` 模式下指定 `CHANGELOG.md` 的相对路径,默认在包目录下读写 `CHANGELOG.md` / `CHANGELOG.en-US.md`。仅 `single` 模式生效。 |
| `from-tag` | 否 | 覆盖日志区间起始 tag。默认取上个发布版本号(单仓为纯版本号,如 `1.2.3`)。 |
| `to-tag` | 否 | 覆盖日志区间结束 ref。默认取 release PR 的 base 分支。 |

| Output | 说明 |
| --- | --- |
| `changelog` | 普通 PR 打开且提取到日志时输出待确认的评论正文。FlowPilot 不会自动发布该评论，如需使用该模式，应由后续步骤消费 output 并创建评论。 |

## 更新日志格式

FlowPilot 从 PR 描述中的 `### 📝 更新日志` 区块提取日志。包名使用四级标题，日志项使用以下格式：

```text
type(scope): message
```

- `type`：日志类型，使用小写；支持 `feat`、`fix`、`docs`/`doc`、`perf`/`refactor`、`breaking`/`break`，其他类型归入 `Others`。
- `scope`：可选，表示组件或功能名称，生成日志时会转换为 PascalCase。
- `message`：必填，从用户视角描述本次变更。
- 包名区分大小写，必须与 `package.json` 或 `pubspec.yaml` 中的 `name` 一致。
- 使用 `all` 可将日志应用到 `packages` 参数列出的所有包。

日志提取阶段不会校验条目格式；不符合 `type(scope): message` 的条目可能被暂存，但在生成 release 日志时会被忽略。

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

### 跳过日志

满足以下任一条件时，不会为 PR 写入暂存日志；如果同一 PR 已存在暂存文件，对应文件会被删除：

- PR 作者类型为 Bot。
- PR 带有 `skip-changelog` 标签。
- PR 分支以 `release/` 开头。
- PR 描述中勾选 `[x] 本条 PR 不需要纳入 Changelog`。

普通 PR 打开时仍可能先生成 `changelog` output，跳过条件在确认并写入暂存文件时生效。

## 确认与暂存

普通 PR 打开后，FlowPilot 通过 `changelog` output 提供一条带提示行的待确认评论。可以通过以下任一方式确认日志：

1. 编辑待确认评论，检查日志内容并删除第一行提示，使评论以 `### 📝 更新日志` 开头。
2. 由白名单成员在 PR 下创建内容为 `/changelog` 的评论。指令允许首尾空白，但不能包含其他内容；PR 已合并时会从目标分支创建补日志 PR。
3. 由白名单成员提交状态为 `approved` 的 PR Review。

通过 `/changelog` 或 Review 确认时，FlowPilot 从最新 PR 描述提取日志；编辑待确认评论时，以修改后的评论内容为准。随后 FlowPilot 向 PR 分支提交：

```text
<package-dir>/.changelog/pr-<PR number>.md
```

暂存文件包含 PR 编号、贡献者、日志内容和 PR 链接，提交信息为 `chore: stash changelog [ci skip]`。重复确认同一 PR 会更新对应文件，不会创建多份日志。

如果原 PR 已合并，FlowPilot 不再向原 head 分支推送，而是从原 PR 的 base 分支创建 `changelog/pr-<PR number>` 分支并提交补日志 PR。重复执行 `/changelog` 时，如果该补日志 PR 仍处于打开状态，则更新现有分支，不会重复创建 PR。该流程要求 token 具有 Contents 写权限和 Pull requests 写权限。

### `/changelog` 指令限制

- 只响应 PR 评论，不响应普通 Issue 评论。
- 只响应 `created` 事件，不会因编辑已有评论为 `/changelog` 而触发。
- 不处理 `release/*` PR。
- 评论者必须在维护者白名单中。

当前白名单固定读取 [Tencent/tdesign 的 `.pr-comment-ci-whitelist`](https://github.com/Tencent/tdesign/blob/main/.github/.pr-comment-ci-whitelist)，尚不支持通过 Action 参数或仓库文件配置。Review approved 和编辑确认评论同样受该白名单限制。

编辑确认根据评论正文前缀识别，不校验评论是否由 FlowPilot 创建。以 `### 📝 更新日志`、`# 🎉 发布` 或 `# 🎉 Release` 开头的任意已编辑 PR 评论都可能触发对应流程，因此白名单应只包含可信维护者。

## 转换后的日志

release PR 打开时，FlowPilot 读取各包的 `.changelog/*.md`，按类型分组；相同 scope 下存在多条日志时会生成二级列表。上面的 `pkg-a` 日志将转换为：

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
| `breaking`、`break` | 🚨 Breaking Changes |
| `feat` | 🚀 Features |
| `fix` | 🐞 Bug Fixes |
| `perf`、`refactor` | 📈 Performance |
| `docs`、`doc` | 📝 Documentation |
| 其他类型 | 🚧 Others |

## 基于 tag 的发布日志(单仓)

单仓场景下,各 PR 的更新日志直接写在 PR 描述的 `### 📝 更新日志` 下(扁平列表,无 `#### package` 分段):

```md
### 📝 更新日志

- fix(aa): aa
```

设置 `mode: single` 后,release PR 打开时 FlowPilot 会:

1. 取上个发布版本号(或 `from-tag`)作为区间起点,release PR 的 base 分支(或 `to-tag`)作为终点。
2. 通过 GitHub compare API 获取区间内的 merge commit,并关联出对应的已合并 PR 编号(去重)。
3. 逐个拉取 PR body,复用与普通 PR 相同的跳过规则(Bot / `skip-changelog` 标签 / release 分支 / 手动勾选),从 `### 📝 更新日志` 抓取日志。
4. 拼接贡献者与 PR 链接,按类型分组渲染,生成与暂存模式完全一致的 `# 🎉 发布` / `# 🎉 Release` 确认评论;下游确认与 Release 创建流程不变。

单仓模式下,release PR 合并后的 GitHub tag 也会使用纯版本号(如 `1.2.3`)而非 `${name}@${version}`,与区间起点保持一致。

可通过 `package-json-path` 指定非根目录的 `package.json`,通过 `changelog-path` 指定自定义的 `CHANGELOG.md` 读写位置。

注意:`compareCommitsWithBasehead` 在超大区间存在 commits 截断,超大版本跨度下建议显式传入 `from-tag` / `to-tag` 缩小区间。

## Release 流程

### 1. 创建 release PR

外部发布工具需要完成以下工作：

- 创建以 `release/` 开头的分支和 PR。
- 从当前仓库创建 release PR，不使用 fork 分支。
- 修改待发布包 manifest 中已有的 `version`。
- 确保版本 manifest 在 PR 中属于 `modified` 文件，而不是新增文件。

FlowPilot 根据 GitHub API 返回的 `package.json` 或 `pubspec.yaml` patch 识别待发布包和版本。版本包含 `alpha` 或 `beta` 时分别使用对应 dist-tag，其他版本当前均按 `latest` 处理。大型 diff 导致 GitHub 不返回 manifest patch 时，FlowPilot 无法识别该发布。

### 2. 确认 release 日志

release PR 打开后，FlowPilot 为 `latest` 版本生成以 `# 🎉 发布` 开头的中文确认评论。配置两个翻译参数后，还会生成以 `# 🎉 Release` 开头的英文评论。

检查评论内容并删除第一行提示后，FlowPilot 会：

- 删除该包的 `.changelog/*.md` 暂存文件。
- 将中文内容写入 `CHANGELOG.md`，英文内容写入 `CHANGELOG.en-US.md`。
- 将变更提交并推送到 release 分支。

中英文是两条独立评论，需要分别确认。

### 3. 合并并发布

release PR 合并后，各类包的处理方式如下：

| 包类型 | Registry 发布 | GitHub Release/tag |
| --- | --- | --- |
| 公共 Node 包 | 执行 `pnpm publish --no-git-checks --filter <name> --tag <tag>` | 仅 `latest` 且存在非空 Changelog 时尝试创建 |
| `private: true` 的 Node 包 | 跳过 | 仅 `latest` 且存在非空 Changelog 时尝试创建 |
| 公共 Flutter 包 | FlowPilot 不执行 `flutter pub publish` | 所有版本均尝试创建 |
| `publish_to: none` 的 Flutter 包 | 跳过 | 所有版本均尝试创建 |

GitHub Release 标题和 tag 均为 `${name}@${version}`。Flutter 包可使用该 tag 触发独立的 OIDC 发布工作流。

Node 发布固定使用 pnpm 的 `--filter`，因此 Node monorepo 必须配置 pnpm workspace，并在运行 FlowPilot 前安装 pnpm；仅包含 Flutter 包时不需要 pnpm。

Registry 发布失败会使 workflow 失败；创建 GitHub Release/tag 失败时，FlowPilot 当前只记录日志并继续处理其他包，应结合 Action 日志或后续检查确认 Release 已创建。

release PR 合并发布必须使用 `pull_request: closed`。FlowPilot 不支持 `pull_request_target`，避免由该事件创建的 Release/tag 导致后续 OIDC 发布被拒绝。

## 包发现规则

FlowPilot 会递归查找 `package.json` 和 `pubspec.yaml`，包发现本身不依赖 `pnpm-workspace.yaml`：

- 如果发现嵌套包，则忽略仓库根目录的 manifest；没有嵌套包时，根 manifest 作为单包处理。
- 忽略 `.git`、`node_modules`、`dist`、`build`、`coverage`、`example`、`examples`、`.dart_tool` 和 `.pub-cache` 等目录。
- 不跟随符号链接。
- 同一目录不能同时包含 `package.json` 和 `pubspec.yaml`。
- manifest 必须包含非空字符串 `name`。
- `packages` 参数按包名精确过滤。未知包名可能出现在普通 PR 的预览评论中，但确认时不会写入暂存文件，因此应在接入时校验包名。

当前不需要 `.flow-pilot.json`，FlowPilot 也不会读取该文件。

## 支持的事件

| 事件 | 条件 | 行为 |
| --- | --- | --- |
| `pull_request: opened` | 普通 PR | 生成 `changelog` output |
| `pull_request: opened` | 非 fork 的 `release/*` PR | 生成 release Changelog 确认评论 |
| `pull_request: closed` | 已合并的 `release/*` PR | 发布 Node 包并创建符合条件的 GitHub Release/tag |
| `pull_request_review: submitted` | approved、白名单成员、普通 PR | 从 PR 描述确认并暂存日志 |
| `issue_comment: created` | PR 评论为 `/changelog`、白名单成员 | 从 PR 描述确认并暂存日志；原 PR 已合并时创建补日志 PR |
| `issue_comment: edited` | 白名单成员 | 确认普通 PR 或 release Changelog 评论 |
| `workflow_run: completed` | 来源为成功的 `pull_request_review` workflow | 使用 `pr_number` 确认日志的兼容入口 |

`workflow_run` 路径依赖调用流程提供 `pr_number` 和工作区中的 `pr-id.txt`。接入示例通过 artifact 在两个 workflow 之间传递这两项信息。

## 开发

项目使用 pnpm：

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

修改 `src` 后需要执行 `pnpm build` 更新 `dist/index.mjs`，GitHub Action 实际运行该构建产物。
