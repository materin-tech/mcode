# MCode 智能体设计

> MCode 是一个终端 AI 编程智能体（CLI Agent），对标 Claude Code 的交互形态：
> 上下布局 TUI、`/` 指令与 `@` 文件补全、权限模式切换、工具调用、subagent 与插件化扩展。
> 依赖最少、可扩展优先、万物皆插件。

---

## 1、整体技术规划

### 1.1 技术选型

| 维度 | 选型 | 说明 |
|------|------|------|
| 运行时 | Node.js (TypeScript) | 单语言全栈，`bin.js` 入口，npm 分发 |
| 终端 UI | React 完整技术栈 + Ink 渲染层 | **完整引入 React 技术栈**，Ink 仅作为终端渲染层（reconciler）。组件化 + Hooks 状态管理 + 自定义 hook 抽象（useCompletion / useChat / usePermissions）+ ink-testing-library 测试，用完整 React 的心智模型和生态重构整个 REPL，对齐 Claude Code 体验 |
| 模型接口 | OpenAI Responses API（唯一协议） | 统一走 Responses 格式，多家模型通过 baseURL/model 切换 |
| 语言/构建 | TypeScript + tsup/esbuild | 少依赖、快速构建 |
| 测试 | vitest | 单测 + 集成测试 |

### 1.2 运行模式（一步到位：compact-harness）

不引入过渡性的 loop 模式，**直接按 compact-harness 模式实现**。Agent Core 从第一天起就具备完整形态：

- **harness 内核**：系统提示词组装 / 消息历史管理 / 工具调度 / 权限门控 / token 统计，全部是独立模块，主循环只做编排；
- **compact 内建**：上下文压缩是 harness 的原生能力（历史摘要化 + 阈值自动触发），不是后期补丁；
- **subagent 上下文隔离**：`task` 工具派发的子 agent 拥有独立消息数组，长任务天然不撑爆主上下文。

> 所谓 "loop" 只是 harness 内核里的那个 while 工具调用循环，属于实现细节，不是一种独立运行模式，不为其单独设计。

### 1.3 扩展机制顶层设计

**万物皆插件，两个顶层入口：**

- `plugin.ts` —— 插件定义的顶层入口。一个插件可以打包：指令（slash command）、工具（tool）、hook、subagent。通过策略注册进 registry。
- `skill.ts` —— 技能的顶层入口。skill 是「提示词 + 可选脚本」的知识包，多技能并存、按需加载（渐进式披露：先只给模型看 name+description，命中后再展开全文）。
- skill 与 plugin 的指令统一暴露到 `>` 对话框的 `/` 提示列表中，即「输入 `/xxx` 调用对应 skill / command」，与 Claude Code 行为对齐。
- 用户级目录：`~/.mcode/{commands,skills}`；项目级目录：`.mcode/{commands,skills}`（当前项目骨架已建好这两个目录）。

### 1.4 架构设计

```
┌─────────────────────────────────────────────┐
│  chat 对话输入层（Ink TUI）                    │
│  Banner / 滚动消息区 / thinking / 输入框 /      │
│  mode 提示（shift+tab）/ / 与 @ 补全面板        │
└───────────────┬─────────────────────────────┘
                │ 消息（用户输入 / 指令 / @文件引用）
┌───────────────▼─────────────────────────────┐
│  调度层（command router）                     │
│  ├─ / 指令 → 内置指令 / plugin 指令 / skill 指令│
│  └─ 普通对话 → Agent Core（compact-harness）   │
└───────────────┬─────────────────────────────┘
┌───────────────▼─────────────────────────────┐
│  模型层（Agent Core）                         │
│  系统提示词组装 → Responses API → 工具调用循环   │
│      ├─ plugin 调用（tools / hooks）          │
│      ├─ skill（按需注入提示词）                │
│      ├─ extensions（MCP 等外部扩展）           │
│      └─ permission 门控（工具执行前）           │
└─────────────────────────────────────────────┘
```

### 1.5 模型接口设计

- 仅采用 **OpenAI Responses API** 一种协议，`src/api/client.ts` 统一封装（流式 SSE 优先）。
- 多模型配置：`~/.mcode/config.json` 中定义 providers 列表（name / baseURL / apiKey(env) / models）。
- `/model` 指令：运行时切换模型，交互式列出可选模型（同 Claude Code 的 `/model` 体验），当前模型显示在状态提示区。
- **首次启动检查与引导、`mcode add_provider` / `mcode switch` / `mcode reset` 供应商管理**：详见 2.5。

---

## 2、核心交互逻辑

### 2.1 TUI 布局（对齐画布 & Claude Code）

```
┌──────────────────────────────────────────────┐
│ MCODE Banner                                 │
│ v{version}  {PWD} 当前目录                     │
├──────────────────────────────────────────────┤
│                                              │
│         消息滚动区（占满剩余高度）               │
│   用户消息 / AI 回复 / 工具调用卡片 / diff        │
│                                              │
├──────────────────────────────────────────────┤
│ thinking ...                 │ 运行中的指令     │
│                              │ 如 /goal active │
├──────────────────────────────────────────────┤
│ ───────────────────────────────────────────  │
│  AI 对话输入框（上方有横线，占满宽度）            │
├──────────────────────────────────────────────┤
│ mode: auto / manual / plan / passon          │
│              （shift + tab 切换）             │
└──────────────────────────────────────────────┘
```

要点：

- 上下布局：上方消息区随对话输出与输入滚动并占满窗口，下方输入框带横线。
- Banner 固定窗口最顶部，展示版本号与当前目录。
- `thinking ...` 状态显示在输入框上方左侧；右侧显示运行中的指令提示（如 `/goal active`）。
- 底部提示行信息不能少：mode 提示（shift+tab 切换）、`/` 与 `@` 的补全提示。

### 2.1.1 React 组件架构（完整技术栈，不是残缺 TUI）

Ink 只承担「React → 终端」的渲染（自定义 reconciler），上层全部按标准 React 工程实践组织：

```
<App>
 ├─ <BannerProvider>            // Context：version / cwd / model
 ├─ <MessageList>               // 滚动消息区（useRef 滚动控制）
 │    └─ <MessageBlock>         // 用户/AI/工具卡片/diff 多态渲染
 ├─ <StatusBar>                 // thinking 状态 + 运行中指令提示
 ├─ <InputBox>                  // 受控输入组件
 │    ├─ useCompletion()        // 自定义 hook：驱动 CompletionState 状态机
 │    └─ useInputHistory()      // 自定义 hook：↑/↓ 历史召回（跨会话持久化）
 │         └─ <CompletionPanel> // '/' 与 '@' 补全面板（纯受控渲染）
 └─ <ModeHint>                  // mode 提示（shift+tab 循环切换）
```

- 状态管理：标准 React 手段（Context + useReducer + 自定义 hooks），不额外引第三方状态库；
- 组件间零直接依赖，全部通过 props / Context 通信——补全面板就是 `<InputBox>` 的受控子组件，2.2 的 CompletionState 即其 reducer state；
- 测试：`ink-testing-library` 组件级测试 + useCompletion 等 hooks 的纯单测（vitest），2.2 里的按键序列用例直接写成 hook 单测。



**`/` 指令补全：**

1. 输入 `/` 立即弹出补全面板：列出全部指令（内置 + plugin + skill 对应指令），带描述。
2. 继续输入过滤；`↑/↓` 循环滚动候选；`tab` 补全选中项；回车执行。
3. **删除字符后面板实时刷新**；删到只剩 `/` 时回到全量列表；删除后重新输入 `/` 也能再次弹出（状态机驱动，非一次性 UI）。

**`@` 文件/目录补全：**

1. 输入 `@` 弹出当前目录的文件**与目录**列表。
2. `@src` 若是目录 → 展示 `src/` 下子内容（完整相对路径），可逐级下探。
3. `tab` 补全路径，补全后可继续输入 `/` 下探或重新触发提示。
4. 退格同样按当前路径片段回退刷新提示；`↑/↓` 循环滚动。
5. 发送时 `@path` 被替换为文件内容引用注入上下文（大文件截断保护）。

> 交互状态机：输入框维护一个 `CompletionState { trigger: '/' | '@' | null, query, selectedIndex }`，所有按键（输入/删除/tab/方向键）都只更新该状态，面板纯函数渲染。这是上一轮 @ 与 tab 失效问题的根治方案。

### 2.3 会话与历史

**输入历史召回（↑/↓，对齐 Linux 命令行与 Claude Code）：**

1. 直接按 `↑` 将上一条输入内容填入对话框（光标移到行尾），连续 `↑` 逐条向前回溯；`↓` 反向回走，走回到最新一条时恢复按 `↑` 之前的未发送草稿。
2. **跨会话生效**：输入历史持久化到 `~/.mcode/history.jsonl`（每行含 `text / cwd / ts`，多行输入原样保存）。退出 mcode 再次进入（同目录）后，`↑` 依然能召回上次会话的输入；召回优先当前 cwd 的记录，其次全局。
3. 连续重复的输入去重折叠，不占历史位。
4. **与补全的按键优先级**：补全面板打开时（`/` 或 `@` 触发中）`↑/↓` 循环候选；面板关闭时 `↑/↓` 召回历史——两态互斥，由 2.2 的 CompletionState 一并驱动，避免按键抢占。
5. 历史 + 补全同样是状态机行为而非一次性 UI：召回过程中再输入/删除字符，正常退出召回态回到编辑态。

**会话持久化：**

- `/clear` 清空上下文；`/compact` 手动压缩；上下文逼近上限时自动 compact。
- 会话持久化到 `~/.mcode/projects/<hash-of-pwd>/`（消息 JSONL），`mcode --resume` 恢复。
- 指令全集见 2.4；模型供应商配置见 2.5。

### 2.4 指令体系（v1 全量对齐 Claude Code）

第一版指令集**完整对齐 Claude Code 的全部指令**，命名与行为保持一致，用户零学习成本；MCode 特有指令在表格末尾。不适配 Claude Code 专属能力的指令（如 IDE 集成）保留入口，执行时给出对应替代提示。

| 分组 | 指令 | 作用 |
|------|------|------|
| 会话与上下文 | `/clear` | 清空上下文，重置对话 |
| | `/compact` | 手动压缩历史（支持附加聚焦指令） |
| | `/context` | 查看上下文占用分布（系统提示词 / 工具 / 历史 / 空闲） |
| | `/export` | 导出当前会话为文件或剪贴板 |
| | `/resume` | 恢复历史会话 |
| | `/rewind` | 回退到检查点（代码与对话） |
| | `/todos` | 查看/管理当前任务列表 |
| | `/copy` | 复制最后一条回复 |
| 配置与状态 | `/config` | 打开配置面板 |
| | `/model` | 交互式切换模型（读取 providers 列表） |
| | `/status` | 展示版本、模型、cwd、权限模式等状态 |
| | `/cost` | token 与费用统计汇总 |
| | `/token` | **MCode 新增**：按模型打印所有调用过的模型的 token 明细——输入 / 输出 / 缓存（读 util/token-usage.ts 的累计记录） |
| | `/language` | **MCode 新增**：切换语言环境（`zh_CN` 简体中文 / `en_US` English / `zh_TW` 繁體中文 / `ja_JP` 日本語 / `ko_KR` 한국어…），同时作用于界面文案与模型回复语言，写入 config.json 持久化 |
| | `/doctor` | 诊断安装与配置健康度 |
| | `/output-style` | 切换输出风格 |
| | `/statusline` | 配置状态栏 |
| | `/terminal-setup` | 终端按键适配（shift+enter 换行等） |
| | `/vim` | vim 编辑模式开关 |
| | `/memory` | 编辑记忆文件（MCODE.md / 规则文件） |
| 权限与安全 | `/permissions` | 权限规则管理（allow/deny 列表） |
| | `/add-dir` | 追加工作目录 |
| 扩展生态 | `/agents` | subagent 管理与查看 |
| | `/hooks` | hook 管理与查看 |
| | `/mcp` | MCP server 管理与连接状态 |
| | `/init` | 扫描仓库生成 MCODE.md |
| 账号与帮助 | `/help` | 帮助 |
| | `/login` `/logout` | 映射为模型供应商配置（提示 `mcode add_provider` / 清除当前供应商） |
| | `/bug` | 问题反馈 |
| | `/release-notes` | 版本说明 |
| | `/upgrade` | 检查更新 |
| | `/review` | 代码评审 |
| | `/pr-comments` | 获取 PR 评论 |
| 保留入口 | `/ide` `/install-github-app` `/migrate-installer` | CC 专属，v1 保留指令名，执行时提示暂未支持或给出替代方案 |

> 补全行为：所有指令（含后续 plugin/skill 注册的）统一进入 2.2 的 `/` 补全面板，`↑/↓` 循环、`tab` 补全、支持参数（如 `/compact focus on xxx`）。

### 2.5 模型供应商管理与首次启动引导

**首次启动强制检查**：mcode 启动时读取 `~/.mcode/config.json`——

1. 文件不存在（首次启动）→ 依次进入**交互式引导**，完成所有需要初始化的配置项：
   1. **语言环境**：列出语言清单（`zh_CN` / `zh_TW` / `en_US` / `ja_JP` / `ko_KR`…），默认值来自终端 `LANG` 探测（见 2.6），确定后引导界面本身即刻切换为所选语言；
   2. **模型供应商**：选择 provider 类型 → 输入 baseURL → 选择鉴权方式（apiKey 引用环境变量）→ 录入模型列表；
   3. **权限默认模式**：展示四模式说明并确认，默认 `passon`（红色警示文案告知全自动放行的风险，可改选 manual / auto / plan）；
   4. **写入 config.json**（含语言、供应商、defaultMode 全部字段），引导完成后方可进入对话。
2. 文件存在但 `providers` 为空（跳过过引导）→ 只补模型供应商引导步骤（语言等已有默认值不重复问）。
3. 无任何供应商时，初始化 `config.json` 骨架（见下），保证后续读写有唯一事实源。

```json
{
  "language": "zh_CN",
  "activeProvider": null,
  "providers": [],
  "defaultMode": "passon"
}
```

引导项与 config.json 字段一一对应，后续 `/config` 可随时修改；`mcode reset` 只重置供应商并回到引导（语言等用户已确认的偏好保留）。

**CLI 子命令**（`mcode <subcommand>`，非对话框内指令）：

| 子命令 | 作用 |
|--------|------|
| `mcode add_provider <name>` | 交互式添加模型供应商（baseURL / apiKey 引用环境变量 / 可用模型列表），写入 config.json |
| `mcode switch <name>` | 切换当前激活供应商（activeProvider），等价于对话框内 `/model` 持久化 |
| `mcode reset` | 重置模型供应商：清空 providers 并回到首次启动引导状态 |
| `mcode token` | 终端侧打印历史调用 token 统计（与 `/token` 同源数据：按模型分组的输入 / 输出 / 缓存） |

config.json 是唯一事实源，`/model` 的切换结果也回写于此；apiKey 一律存环境变量名，不落明文。

### 2.6 语言环境（`/language`，国际化设计）

`/language` 切换的语言环境**同时作用于两条链路**：

1. **TUI 界面文案**：`src/ui/locales/<lang>.ts` 维护各语言的界面字符串表（Banner、补全提示、权限确认、mode 提示、thinking 等），组件只消费 key，运行时按当前语言取值——新增语言 = 新增一个 locales 文件，不改组件。
2. **模型回复语言**：harness `context.ts` 组装系统提示词时注入语言指令（如 `zh_CN` → "Always respond in Simplified Chinese"，`en_US` → "Always respond in English"），保证对话内容、工具调用的 explanation、subagent 报告全部跟随语言环境。

- 语言清单：v1 内置 `zh_CN`（简体中文）、`zh_TW`（繁體中文）、`en_US`（English）、`ja_JP`（日本語）、`ko_KR`（한국어），预留扩展位。
- 切换即时生效（更新 Context + 回写 config.json 的 `language` 字段），跨会话持久。
- 默认值：首次启动时探测终端 `LANG` 环境变量（`zh_CN*` → `zh_CN`，其余 → `en_US`），并允许首次启动引导中一并选择。
- 代码注释 / 提交信息等产出物同样遵循当前语言环境（随系统提示词指令下发）。



- `/clear` 清空上下文；`/compact` 主动压缩；上下文逼近上限时自动 compact。
- 会话持久化到 `~/.mcode/projects/<hash-of-pwd>/`（消息 JSONL），`mcode --resume` 恢复。

---

## 3、工具和插件设计

### 3.1 Tool 接口定义

```typescript
interface ToolDefinition {
  name: string;                    // 模型可见的工具名
  description: string;             // 模型可见的描述
  parameters: JSONSchema;          // 参数 schema（校验后执行）
  permission?: PermissionPolicy;   // 执行前权限策略
  isReadOnly?: boolean;            // 只读工具在 plan 模式下放行
  execute(input, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: string;          // 回传给模型的文本
  display?: RenderBlock;   // 给 TUI 的渲染块（diff / 代码卡片）
}
```

内置工具首批：`read_file`、`write_file`、`edit_file`、`bash`、`glob`、`grep`、`task`（派发 subagent）。所有工具参数必须先过 schema 校验（`tools/validate.ts`），路径统一收敛到工作区内（防路径逃逸）。

### 3.2 插件体系

```
plugin.ts
├── commands?: SlashCommand[]    // 注册 / 指令
├── tools?: ToolDefinition[]     // 注册工具
├── hooks?: HookDefinition[]     // 生命周期钩子（PreToolUse / PostToolUse / Stop）
├── agents?: AgentDefinition[]   // 注册 subagent
└── skills?: SkillDefinition[]   // 打包技能
```

- 注册策略：registry 统一收纳（`tools/registry.ts`），按 `namespace:name` 去重，插件指令与内置指令同名时用户级 > 内置并提示。
- 加载顺序：内置 → 用户级 `~/.mcode` → 项目级 `.mcode`（后者可覆盖前者）。
- MCP：作为 extensions 的一种，MCP server 的 tools 自动转成 ToolDefinition 挂进 registry。

### 3.3 Skill 设计

```typescript
interface SkillDefinition {
  name: string;
  description: string;        // 渐进式披露：第一层只有这两项进入模型上下文
  body: string;               // 第二层：命中后注入的完整指令内容
  allowedTools?: string[];    // 可选：技能激活期间的工具白名单
}
```

- 触发方式：① `/skill-name` 显式调用；② 模型根据 description 自主匹配。
- 存放：`~/.mcode/skills/<name>/SKILL.md` 与 `.mcode/skills/<name>/SKILL.md`。

### 3.4 权限模式（shift+tab 切换）

| mode | 行为 |
|------|------|
| manual | 每个非只读工具执行前弹确认 |
| auto | 白名单内的工具自动放行，其余确认 |
| plan | 只读模式：只允许只读工具，输出计划不落盘 |
| passon | 全自动放行——**默认模式**（MCode 启动即 passon，状态栏红色警示提示） |

权限决策记录进 `~/.mcode` 会话配置，支持 `always allow` 记忆；默认值可被 `/config` 或 config.json 中的 `defaultMode` 覆盖。

---

## 4、智能体和 subagent 设计

### 4.1 主循环（Agent Loop）

```
用户输入 → 组装系统提示词（身份 + 工具说明 + skill 索引 + 环境信息）
       → Responses API（流式）
       ├─ 返回文本 → 渲染到消息区
       └─ 返回 tool_call → 权限门控 → 执行工具 → 结果回传 → 继续循环
       循环终止：无 tool_call / 达到 max-turns / 用户 ESC 打断
```

- 打断：ESC 触发 AbortController，立即终止当前请求与工具执行。
- token 统计：每轮累计（`util/token-usage.ts`），状态区展示用量。

### 4.2 Subagent 设计

```typescript
interface AgentDefinition {
  name: string;
  description: string;          // 主模型据此决定何时派发
  systemPrompt: string;
  tools?: string[];             // 工具白名单，缺省继承全部
  model?: string;               // 可用更便宜/更快的模型
}
```

- 通过 `task` 工具派发：主 agent 输出 `task(subagent_type, prompt)` → 子 agent 拿到**独立上下文**（独立消息数组 + 独立系统提示词）自行循环 → 只把最终报告回传主上下文。
- 价值：① 上下文隔离（大范围搜索不污染主对话，为 compact-harness 打基础）；② 并行（多个 task 调用并发执行）；③ 工具收窄（子 agent 给更小权限）。
- 首批内置 subagent：`general-purpose`（多步任务）、`code-explorer`（只读代码检索，白名单 = read/glob/grep）。

### 4.3 Harness 内核架构

```
harness/
├── context.ts     系统提示词组装 + 环境信息注入
├── history.ts     消息历史管理（持久化 / resume）
├── compaction.ts  上下文压缩（compact 策略：旧消息摘要化）
├── scheduler.ts   工具调度 + 并发控制
└── lifecycle.ts   hook 触发与生命周期管理
```

compact-harness 是唯一的运行模式：`agent/loop.ts` 里的 while 循环只是 scheduler 的实现细节，context / history / compaction / permission 从第一天起就参与每一轮执行。

---

## 5、Session 设计与 ECC 能力原生集成

### 5.1 Session 设计（对齐 Claude Code）

Session 是一次对话的完整生命周期实体，**原生内置于 harness**，不依赖任何第三方实现：

```
~/.mcode/
├── projects/<hash-of-pwd>/sessions/
│   ├── <session-id>.jsonl      # 消息流（用户/AI/工具调用/结果，追加写）
│   └── <session-id>.meta.json  # 元数据：started/updated/cwd/model/mode/token 累计/标题
└── session-data/
    └── 2026-10-14-<slug>.md    # save-session 结构化快照（对齐 ECC 格式）
```

**自动保存（默认开启）**：每一轮对话结束追加写入 jsonl；退出 / ESC 打断时刷盘并更新 meta。会话标题取首轮用户输入截断。

**save-session（结构化快照，原生指令 `/save`）**：除 jsonl 原始流外，支持导出 ECC save-session 格式的 markdown 快照——包含 Date / Project / Worktree、Tasks、Files Modified、Tools Used、Stats（token 用量）、Notes for Next Session、Context to Load，便于人工归档与跨会话交接。

**resume（恢复）：**

| 入口 | 行为 |
|------|------|
| `mcode --resume` | 交互式列出该目录历史会话（时间 / 标题 / 轮数 / token），选择后完整恢复消息流与配置 |
| `mcode --continue` | 直接恢复最近一次会话 |
| `/resume`（对话框内） | 同 `--resume`，运行中随时切换会话 |
| `/rewind` | 会话内回退到检查点（消息级，配合工具调用前快照） |

恢复时若历史超过上下文阈值，自动走 compact（摘要化早期历史）后再进入对话——session 与 compact-harness 共用同一套 history 模块。

### 5.2 ECC 能力原生集成（内置，不经第三方）

MCode 直接继承 **Everything Claude Code（ECC）的全部能力**——ECC 的 agents / skills / commands / hooks / rules 作为**内置核心资产**随 mcode 安装包分发，通过 `plugin.ts` 统一加载器注册，不需要用户安装任何第三方插件：

| ECC 资产 | MCode 原生承载 |
|----------|----------------|
| skills（277 个） | `skills/` 加载器默认源。渐进式披露：仅 name + description 进入模型上下文索引，模型判定或用户 `/skill` 命中后才展开完整 body |
| agents（67 个 subagent） | 注册为 `AgentDefinition` 进 registry，`task` 工具可直接派发（planner / architect / code-reviewer / security-reviewer / tdd-guide 等），工具白名单与 model 按各 agent 定义收敛 |
| commands（93 个） | 合并进 2.4 指令全集，与内置指令同优先级，`/` 补全面板统一呈现 |
| hooks | 挂到 harness `lifecycle.ts`（PreToolUse / PostToolUse / Stop），由 3.4 权限层门控 |
| rules（common + 语言级） | 系统提示词组装时注入：common 规则常驻；语言级规则按项目技术栈探测后激活对应目录，避免全量灌入 |

**加载策略（防上下文爆炸）：**

1. **ecc-core = 一个普通内置 plugin**（打包进安装包，加载顺序在最前、优先级最低，用户级/项目级扩展可覆盖它）——ECC 的全部内容对加载器而言没有特殊性，完全复用 3.2 的插件注册策略。
2. skill 索引分层：常用核心 skill（如 session、code-review、planner 相关）description 常驻上下文；长尾 skill 收进本地索引，模型通过 `skill-search` 工具按需检索再展开，控制每轮固定 token 开销。
3. rules 同理按需注入（技术栈探测），subagent 按需实例化——全量能力在盘上，上下文里只有索引。

**与 session 的关系**：5.1 的 save/resume 是 harness 原生模块（history/sessions），ECC 的 save-session / resume-session skill 退役为对 `/save` 与 `--resume` 的薄别名，保证 ECC 用户习惯平滑迁移，但数据链路只有一条。

---

## 6、目录结构规划

```
mcode/
├── bin.js                 # 入口（含 CLI 子命令：add_provider / switch / reset / token）
├── assets/
│   └── ecc-core/          # 内置 ECC 核心资产（skills / agents / commands / hooks / rules）
├── src/
│   ├── config/            # constants / config（providers、模型列表）
│   ├── api/               # client.ts —— OpenAI Responses 封装（SSE 流式）
│   ├── agent/             # loop.ts / harness/ / types.ts
│   ├── sessions/          # 会话持久化：jsonl 流 / meta / resume 选择器 / /save 快照导出
│   ├── tools/             # 内置工具 + validate.ts + registry.ts + types.ts
│   ├── permission/        # manager.ts / prompt.ts（权限确认 UI）
│   ├── ui/                # Ink 组件：Banner / MessageList / InputBox /
│   │                      # CompletionPanel(/ 与 @) / ModeHint / Thinking
│   ├── commands/          # 内置 slash 指令（2.4 指令全集）
│   ├── plugins/           # plugin.ts 加载器与注册策略（ecc-core 走同一加载器）
│   ├── skills/            # skill.ts 加载器（渐进式披露 + skill-search 索引）
│   └── util/              # errors / paths / diff / token-usage
├── .mcode/                # 项目级 commands / skills（用户扩展）
└── vitest.config.ts
```

## 7、里程碑

| 阶段 | 交付 | 验收标准 |
|------|------|----------|
| M1 内核闭环 | compact-harness 主循环（context/history/scheduler/compaction 全模块就位）+ TUI 布局 + 输入框 + `/`、`@` 补全状态机 + `↑/↓` 历史召回（跨会话）+ read/write/bash 三工具 | 对话可跑通；补全在输入/删除/tab 各种序列下行为正确；`↑` 召回上会话输入、`↓` 恢复草稿、补全打开时方向键归补全；长对话自动触发压缩不爆上下文 |
| M2 完整权限与扩展 | 全部内置工具 + 权限四模式 + 指令全集（2.4 全量对齐，含 `/token`）+ 首次启动完整引导（语言 / 供应商 / 默认权限）与 `add_provider` / `switch` / `reset` 子命令 + 插件/skill 加载器 + 会话持久化（jsonl / meta / `--resume` / `--continue`） | shift+tab 四模式切换生效（默认 passon）；`/` 能列出并执行 skill 指令；冷启动引导覆盖语言→供应商→权限三项并生成完整 config.json；`/token` 按模型打印输入/输出/缓存；`/language` 切 zh_CN / en_US 后界面与回复即时全量切换；退出重进后 `--resume` 完整恢复会话 |
| M3 subagent 与 ECC 原生集成 | task 工具派发 subagent + hook 体系 + token 统计 + ecc-core 内置资产接入（skills 索引 / agents 注册 / rules 按需注入）+ `/save` 快照 | subagent 隔离上下文并回传报告；ECC 的 skill 可被 `/` 调用、agent 可被 task 派发；恢复超限会话自动 compact |
