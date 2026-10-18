# MCode

**MCode** 是一个运行在终端里的 AI 编程智能体（Terminal AI Coding Agent）。

上下布局的交互式 TUI，对标 Claude Code 的使用体验：`/` 指令补全、`@` 文件引用、工具调用、subagent 任务派发、权限模式切换，模型接口统一走 OpenAI Responses API，可自由接入多家模型。

- npm 包名 `@materin-tech/materin-mcode`，命令名 `mcode`
- 权属 Materin-tech，MIT 开源

## Install

```bash
npm install -g @materin-tech/materin-mcode
```

要求 Node.js >= 20。

## Quick start

```bash
# 首次启动：交互式引导（语言 → 模型供应商 → 权限模式）
mcode

# 非交互添加模型供应商
mcode add_provider glm

# 切换供应商 / 重置 / token 统计
mcode switch glm
mcode reset
mcode token

# 会话
mcode --resume          # 本目录会话列表（无则全局降级）
mcode --resume <id>     # 恢复会话
mcode --continue        # 恢复最近会话
```

## 核心能力

### 智能体运行时

- **harness 内核**：系统提示词组装、消息历史管理、工具调度、权限门控、token 统计，全部独立模块化
- **上下文压缩**：历史摘要化 + 阈值自动触发，长会话不爆上下文
- **subagent 隔离**：`task` 工具派发子 agent，独立消息数组，长任务不污染主上下文

### 会话与历史

- 多会话管理，支持恢复指定会话或最近会话
- `↑/↓` 输入历史召回，跨会话持久化
- 排队插话、多行粘贴、推理过程折叠

### 多模态与扩展

- 图片附件（多模态输入）
- 异步文件扫描
- 代理（proxy）配置

### In-app 指令

| 指令 | 说明 |
|------|------|
| `/goal` | 设置目标并持续工作直到达成（Status bar 显示 /goal active） |
| `/` | 指令补全（对齐 Claude Code 的全集 + skill） |
| `@` | 文件/目录补全，`@path` 注入文件内容 |
| `shift+tab` | 权限四模式循环（passon 默认 / manual / auto / plan） |
| `/model` | 交互式选模型 |
| `/token` | 按模型 token 明细 |
| `/language` | 语言环境切换 |
| `/init` | 生成 MCODE.md |
| `/memory` | 查看生效文档 |

## Tools

内置工具集：

```
read_file / write_file / edit_file / bash / glob / grep / webfetch / websearch / task（subagent）/ skill
```

- `websearch`：主路 DuckDuckGo，降级 Bing CN
- `webfetch`：抓取 URL 并抽取正文

## Skills

```
~/.mcode/skills/<name>/SKILL.md    # 全局
.mcode/skills/                     # 项目级
```

frontmatter 提供 `name` + `description` + 正文。`/skill-name` 直接执行，模型经 `skill` 工具按需拉取全文。

## Permission modes

| mode | 行为 |
|------|------|
| passon | 全自动（默认，红色警示） |
| manual | 非只读工具逐次确认 |
| auto | 只读工具自动放行 |
| plan | 只读计划模式 |

## License

MIT © [Materin-tech](https://github.com/materin-tech)
