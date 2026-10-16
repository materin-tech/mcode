# MCode

Terminal AI coding agent — Claude Code style interactive TUI speaking the OpenAI Responses API.

> npm 包名 `@materin-tech/materin-mcode`，命令名 `mcode`，权属 Materin-tech，MIT。

## Install

```bash
npm install -g @materin-tech/materin-mcode
```

## Quick start

```bash
# first launch: interactive guide (language → provider → permission mode)
mcode

# add a model provider non-interactively
mcode add_provider glm

# switch provider / reset / token 统计
mcode switch glm
mcode reset
mcode token

# sessions
mcode --resume          # 本目录会话列表（无则全局降级）
mcode --resume <id>     # 恢复会话
mcode --continue        # 恢复最近会话
```

## In-app

- `/goal` — 设置目标并持续工作直到达成（Status bar 显示 /goal active）
- `/` — 指令补全（对齐 Claude Code 的全集 + skill）
- `@` — 文件/目录补全，`@path` 注入文件内容
- `↑/↓` — 历史召回（跨会话持久化）
- `shift+tab` — 权限四模式循环（passon 默认/manual/auto/plan）
- `/model` — 交互式选模型；`/token` — 按模型 token 明细；`/language` — 语言环境切换
- `/init` — 生成 MCODE.md；`/memory` — 查看生效文档

## Tools

read_file / write_file / edit_file / bash / glob / grep / webfetch / websearch / task（subagent）/ skill。

websearch 主路 DuckDuckGo、降级 Bing CN；webfetch 抓 URL 抽正文。

## Skills

`~/.mcode/skills/<name>/SKILL.md`（全局）或 `.mcode/skills/`（项目级），
frontmatter：name + description + 正文。`/skill-name` 直接执行，模型经 `skill`
工具按需拉全文。

## Permission modes

| mode | 行为 |
|------|------|
| passon | 全自动（默认，红色警示） |
| manual | 非只读工具逐次确认 |
| auto | 只读工具自动放行 |
| plan | 只读计划模式 |

## License

MIT © Materin-tech
