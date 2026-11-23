# 02 - 第一个 MCP Server：20 分钟写出待办清单服务器

> 本篇动手实操：从零搭建一个"待办清单"MCP 服务器（4 个工具），用官方 Inspector 调试，
> 最后接入 Claude Desktop / Claude Code / ZCode 等真实客户端。
> 全程约 20~30 分钟，所有命令在 Windows 10 + Node v22.23.1 + CMD 实测通过。

[← 上一篇：认识 MCP](01-认识MCP.md) · [目录](README.md) · [下一篇：协议内核 →](03-协议内核JSONRPC与消息流.md)

---

## 1. 我们要做什么（为什么选待办清单）

本篇用 **TypeScript + 官方 TS SDK v2** 写一个待办清单服务器，暴露 4 个工具：

| 工具名 | 功能 | 输入 |
|---|---|---|
| `add_todo` | 添加待办 | `text: string` |
| `list_todos` | 列出待办（可按状态过滤） | `filter: "all" \| "open" \| "done"` |
| `complete_todo` | 标记完成 | `id: number` |
| `delete_todo` | 删除 | `id: number` |

> **为什么不用官方教程的"天气服务器"？** 天气服务器要调美国 NWS 的外网 API，国内网络经常超时，新手第一步就卡死。待办清单**零外部依赖**（数据存内存），任何环境都能跑通，学到的 API 完全一样。想练"调真实 API"的，把每个工具的实现换成 fetch 调用即可（官方天气版参考文末链接）。

学完本篇你将掌握 MCP 开发的完整闭环：

```mermaid
graph LR
    A["① 装 SDK"] --> B["② 写工具函数"]
    B --> C["③ 编译"]
    C --> D["④ Inspector 调试"]
    D --> E["⑤ 接入真实客户端"]
```

## 2. 环境准备

### 2.1 检查 Node

MCP TS SDK 要求 Node.js ≥ 20。打开 CMD 检查：

```cmd
node --version
:: 输出 v22.23.1（≥20 即可）
npm --version
```

没有装的，去 [nodejs.org](https://nodejs.org) 下载 22 LTS 安装包，一路下一步。

### 2.2 初始化项目

```cmd
mkdir todo-mcp && cd todo-mcp
npm init -y
npm install @modelcontextprotocol/server zod
npm install -D typescript @types/node
```

三样依赖说明：

| 包 | 作用 |
|---|---|
| `@modelcontextprotocol/server` | **服务器 SDK**。注意：SDK v2 已把服务器和客户端拆成两个包（旧教程里的 `@modelcontextprotocol/sdk` 是 v1 线，不再推荐） |
| `zod` | Schema 定义库，用来声明工具参数的类型与校验规则（SDK 会把 zod schema 转成 JSON Schema 给模型看） |
| `typescript` / `@types/node` | 编译 TS 用 |

### 2.3 工程配置

`package.json` 里加两个字段（`"type": "module"` 必须加，SDK 是 ESM 包）：

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc"
  }
}
```

`tsconfig.json`（与官方 quickstart 相同，可直接抄）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "types": ["node"],
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

## 3. 写代码：完整的服务器

新建 `src/todo-server.ts`，直接全量抄入（本代码已实测，文末验证记录）：

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// ---------- 内存数据（重启即清空，教学用） ----------
interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

const todos: Todo[] = [];
let nextId = 1;

// ---------- 工具注册 ----------
// 注意：本函数会被 serveStdio 在需要时重复调用，每次都要返回全新实例
function createServer() {
  const server = new McpServer({ name: "todo", version: "1.0.0" });

  server.registerTool(
    "add_todo",
    {
      title: "新增待办",
      description: "向待办清单中添加一条新待办事项",
      inputSchema: z.object({
        text: z.string().min(1).describe("待办内容，例如：给客户发周报"),
      }),
    },
    async ({ text }) => {
      const todo: Todo = {
        id: nextId++,
        text,
        done: false,
        createdAt: new Date().toISOString(),
      };
      todos.push(todo);
      return {
        content: [
          { type: "text", text: `已添加 [${todo.id}] ${text}` },
        ],
      };
    },
  );

  server.registerTool(
    "list_todos",
    {
      title: "列出待办",
      description: "列出当前所有待办事项，可按完成状态过滤",
      inputSchema: z.object({
        filter: z
          .enum(["all", "open", "done"])
          .default("all")
          .describe("过滤条件：all=全部，open=未完成，done=已完成"),
      }),
    },
    async ({ filter }) => {
      const rows = todos.filter((t) =>
        filter === "all" ? true : filter === "done" ? t.done : !t.done,
      );
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "（清单是空的）" }] };
      }
      const lines = rows.map(
        (t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "complete_todo",
    {
      title: "完成待办",
      description: "把指定编号的待办标记为已完成",
      inputSchema: z.object({
        id: z.number().int().positive().describe("待办编号（list_todos 返回的 [n]）"),
      }),
    },
    async ({ id }) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        return {
          content: [{ type: "text", text: `找不到编号为 ${id} 的待办` }],
          isError: true,
        };
      }
      todo.done = true;
      return { content: [{ type: "text", text: `已完成 [${id}] ${todo.text}` }] };
    },
  );

  server.registerTool(
    "delete_todo",
    {
      title: "删除待办",
      description: "删除指定编号的待办事项",
      inputSchema: z.object({
        id: z.number().int().positive().describe("待办编号"),
      }),
    },
    async ({ id }) => {
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) {
        return {
          content: [{ type: "text", text: `找不到编号为 ${id} 的待办` }],
          isError: true,
        };
      }
      const [removed] = todos.splice(index, 1);
      return { content: [{ type: "text", text: `已删除 [${id}] ${removed.text}` }] };
    },
  );

  return server;
}

// ---------- 启动（stdio 传输，日志只能走 stderr） ----------
serveStdio(createServer, {
  onerror: (error) => console.error("todo MCP server error:", error),
});
console.error("todo MCP server running on stdio");
```

### 3.1 逐段拆解：这段代码里藏着 6 个 MCP 开发的关键习惯

**① `McpServer` 是高级封装**。它替你处理协议协商、JSON-RPC 分发、Schema 转换，你只管注册工具。（想知道"封装下面发生了什么"？03 篇手写迷你客户端见真章。）

**② `createServer()` 是工厂函数，不是单例**——这是 SDK v2 的新约定。`serveStdio` 会**多次**调用它（每个客户端连接一次，还有一次"探测调用"可能被丢弃），所以每次必须返回全新 `McpServer` 实例。老教程里 `new McpServer()` 后直接 `server.connect(...)` 的写法只兼容旧协议客户端。

**③ `inputSchema` 用 zod 定义参数**。`z.string().min(1).describe("...")` 会被 SDK 转成 JSON Schema：

```json
{
  "type": "string",
  "minLength": 1,
  "description": "待办内容，例如：给客户发周报"
}
```

这份 Schema 就是"给模型看的参数说明书"——`.describe()` 里的中文模型真的会读，**参数描述质量直接影响模型填参数的准确率**。

**④ 工具返回 `{ content: [...] }`**。`content` 是数组，元素可以是文本、图片、音频、资源链接（05 篇详解全部类型）。

**⑤ 业务失败用 `isError: true`，不是抛异常**。"找不到编号 99 的待办"是**业务结果**（模型需要看到失败原因并尝试纠正），要作为正常响应返回、标记 `isError`；只有协议级故障（比如函数崩了）才走异常。

**⑥ `serveStdio` 而不是 `server.connect(new StdioServerTransport())`**。前者是 v2 的推荐入口，自动与客户端协商协议时代（modern 的 2026-07-28 和 legacy 的 initialize 握手都能接）；后者写死旧协议。

## 4. 编译与运行

```cmd
npx tsc
```

无输出 = 编译成功，`build/todo-server.js` 已生成。试着直接跑：

```cmd
node build/todo-server.js
```

屏幕上**只出现一行** `todo MCP server running on stdio`，然后程序"卡住"——**这是正常的**！它正等着从标准输入读消息（MCP 客户端还没来）。按 Ctrl+C 退出，进入下一步用专业工具和它对话。

> 🚨 **stdout 雷区（MCP stdio 开发第一大坑）**：stdio 传输下，**stdout 只能承载 JSON-RPC 消息**，任何 `console.log()`/`print()` 输出都会混进协议流，客户端直接解析失败。日志一律走 stderr（JS 的 `console.error`，Python 的 `logging`）。官方教程把这条列为最高优先级警告，本系列每篇都会提醒。

## 5. 用 Inspector 调试（最关键的一步）

MCP Inspector 是官方调试工具，无需写客户端就能与你的服务器对话。

### 5.1 列出工具

```cmd
npx -y @modelcontextprotocol/inspector --cli node build/todo-server.js --protocol-era modern --method tools/list
```

实测输出（节选）：

```json
{
  "tools": [
    {
      "name": "add_todo",
      "title": "新增待办",
      "description": "向待办清单中添加一条新待办事项",
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "text": {
            "type": "string",
            "minLength": 1,
            "description": "待办内容，例如：给客户发周报"
          }
        },
        "required": ["text"]
      }
    }
    // ...list_todos、complete_todo、delete_todo
  ]
}
```

看到 4 个工具，说明：你的 zod 定义已正确转成 JSON Schema、服务器已正确响应 2026-07-28 协议。

### 5.2 双时代验证（v2 SDK 的特色测试）

Inspector 有 `--protocol-era` 参数。用 **legacy** 时代（2025 年的 initialize 握手）再测一次：

```cmd
npx -y @modelcontextprotocol/inspector --cli node build/todo-server.js --protocol-era legacy --method tools/list
```

实测同样返回 4 个工具（CMD 下可过滤查看）：

```
      "name": "add_todo",
      "name": "list_todos",
      "name": "complete_todo",
      "name": "delete_todo",
```

`serveStdio` 的自动协商生效了：**同一份服务器代码，新协议客户端和旧协议客户端都能连**。这个双时代测试值得成为你的习惯——写完服务器两个 era 各跑一遍。

### 5.3 实际调用工具

```cmd
npx -y @modelcontextprotocol/inspector --cli node build/todo-server.js --protocol-era modern --method tools/call --tool-name add_todo --tool-arg text=给客户发周报
```

实测输出：

```json
{
  "_meta": {
    "io.modelcontextprotocol/serverInfo": { "name": "todo", "version": "1.0.0" }
  },
  "content": [
    { "type": "text", "text": "已添加 [1] 给客户发周报" }
  ]
}
```

> ⚠️ CMD 注意：`--tool-arg text=给客户发周报` 中若参数值含空格或特殊字符，用引号包住：`--tool-arg text="buy milk"`。PowerShell 下引号规则不同，报参数错误时优先怀疑引号。

### 5.4 Web 界面版 Inspector

命令行适合脚本化，图形界面适合探索式调试：

```cmd
npx -y @modelcontextprotocol/inspector node build/todo-server.js
```

会自动打开浏览器（默认 `http://localhost:6274`），左侧选 Tools 面板即可点点点调试。Web 版还带 OAuth 授权配置，调试远程服务器时更方便（04 篇会再用到）。

## 6. 接入真实客户端：让 AI 真的用上你的工具

### 6.1 Claude Desktop

配置文件位置：`%AppData%\Claude\claude_desktop_config.json`（Windows）。

```json
{
  "mcpServers": {
    "todo": {
      "command": "node",
      "args": ["C:\\绝对路径\\todo-mcp\\build\\todo-server.js"]
    }
  }
}
```

三个要点：
- 路径用**绝对路径**，JSON 里反斜杠转义成 `\\`（或直接用正斜杠 `C:/...`）；
- `command` 若找不到，写 node 的完整路径（`where node` 查看）；
- 改完配置要**彻底退出** Claude Desktop（托盘图标右键退出）再启动，只是关窗口不生效。

重启后在输入框点"+"→ Connectors，能看到 `todo` 服务器和 4 个工具。现在对 Claude 说"帮我记一条待办：明天上午 10 点开产品评审会"，观察它调用 `add_todo`（会先弹出授权确认）。

### 6.2 Claude Code（CLI）

```cmd
claude mcp add todo -- node C:\绝对路径\todo-mcp\build\todo-server.js
```

进入交互后直接说"列出我的待办"即可验证。

### 6.3 ZCode / 其他客户端

主流客户端配置格式基本同构（`command`+`args` 启动本地子进程）。ZCode 在扩展资源设置里添加 MCP 服务器，填同样的命令即可。若想测试**标准兼容性**而不装任何客户端，写一个 10 行的"宿主模拟器"：直接用下一章的手写迷你客户端。

## 7. 怎么验证自己做对了：检查清单

| 检查项 | 命令/方法 | 期望结果 |
|---|---|---|
| 编译通过 | `npx tsc` | 无报错 |
| modern 协议列出工具 | Inspector `--protocol-era modern --method tools/list` | 4 个工具 + JSON Schema |
| legacy 协议兼容 | Inspector `--protocol-era legacy --method tools/list` | 同样 4 个工具 |
| 工具可调用 | `--method tools/call --tool-name add_todo --tool-arg text=hi` | `已添加 [1] hi` |
| 参数校验生效 | `--tool-arg text=`（空串） | 返回校验错误，程序不崩 |
| 客户端接入 | Claude/ZCode 中连接 | 工具出现在列表、调用前弹确认 |

## 8. 踩坑 FAQ

**Q1：服务器一启动就闪退/客户端连接失败，日志说 stdout 被污染？**
某处用了 `console.log`（或第三方库向 stdout 打印）。stdio 下 stdout 专属协议。全局排查：业务日志改 `console.error`；启动 banner 类输出删除；Spring/Java 服务器记得 `spring.main.bannerMode=off`。

**Q2：Claude Desktop 里看不到服务器？**
按顺序排查：① 配置文件 JSON 语法（多余逗号最常见）；② 路径必须是绝对路径；③ 彻底退出重启（托盘退出，不是关窗口）；④ 看 Claude 日志 `%AppData%\Claude\logs\` 下的 `mcp*.log`，里面有启动 stderr 输出。

**Q3：Inspector 报 "Unsupported protocol version"？**
你的服务器可能是 v1 SDK 写的（只支持旧协议）而 Inspector 用 modern era 测——对老代码用 `--protocol-era legacy` 测试，或迁移到 v2 SDK（`serveStdio` 双时代兼容）。

**Q4：`--tool-arg` 传中文或带空格参数失败？**
CMD 引号嵌套问题。带空格值用 `--tool-arg text="buy milk"`；引号还是有问题时，改用 Web 版 Inspector 点 UI 传参，绕开命令行转义。

**Q5：数据在两次对话之间丢了？**
正常。内存数据随进程存亡——stdio 模式下客户端断开时子进程退出。真实项目把 `todos` 换成文件/数据库读写即可（第 05 篇实操）。

**Q6：能不写 TypeScript 吗？**
能。SDK 支持 JS（去掉类型注解、`.ts` 改 `.mjs`）。但 zod schema + 类型提示的"编译期防错"在工具参数上收益很大，建议坚持 TS。Java/C#/Python 等语言版见第 09 篇对照表。

## 参考链接

- [官方 Quickstart：Build an MCP server](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server)（含天气服务器多语言版）
- [官方天气服务器代码](https://github.com/modelcontextprotocol/quickstart-resources/tree/main/weather-server-typescript)
- [Inspector 文档](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) · [CLI 用法](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli)
- [Debugging 指南](https://modelcontextprotocol.io/docs/2026-07-28/tools/debugging)

---

**下一篇**深入协议层：不借任何 SDK，手写 JSON-RPC 消息与你的服务器对话——你会彻底看清 MCP 的"数据层"长什么样。

[← 上一篇：认识 MCP](01-认识MCP.md) · [目录](README.md) · [下一篇：协议内核 →](03-协议内核JSONRPC与消息流.md)
