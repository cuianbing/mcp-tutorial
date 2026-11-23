# 14 - MCP Apps 与扩展生态：协议之外的第二层

> 核心协议只保证"工具能调通"。图表、表单、看板这类富交互，靠的是 **Extensions（扩展）**。
> 本篇讲清扩展机制、实测 MCP Apps 的三个协议事实，并补上 08 篇没讲完的 **CIMD vs DCR** 授权注册。

[← 上一篇：测试与质量保障](13-测试与质量保障.md) · [目录](README.md) · [下一篇：生产级数据库集成 →](15-生产级数据库集成.md)

---

## 1. 为什么需要"扩展"，而不是把所有东西塞进核心协议

MCP 核心协议刻意保持小而稳（工具/资源/提示/传输/授权）。但生态要的东西越来越多：交互式 UI、长任务、技能包、企业级授权……如果全塞进核心协议，规范会变成一锅粥，且每加一个特性都要所有实现跟着升级。

**Extensions 机制**（SEP-1724 引入）解决这个问题：

| 维度 | 核心协议 | 扩展 |
|---|---|---|
| 是否必选 | 必须实现 | **可选**，不实现也能互操作 |
| 协商方式 | 版本 + capabilities | **显式协商**（双方都声明支持才启用） |
| 演进速度 | 慢（季度级、严格兼容） | 快（独立版本、独立仓库） |
| 失败模式 | 不兼容即失败 | **优雅降级**（不支持时退回纯文本行为） |

当前官方扩展（据 `modelcontextprotocol.io/llms.txt` 与扩展总览）：

| 扩展 | 解决什么 | 状态 |
|---|---|---|
| **MCP Apps**（SEP-1865） | 服务器向客户端提供交互式 UI | Final（扩展轨道） |
| **Tasks**（SEP-1686） | 长任务句柄 + 轮询（06 篇 4 节） | 演进中 |
| **Skills** | 以 MCP 分发可复用的技能说明 | 新增 |
| **Authorization：OAuth Client Credentials** | 机器对机器授权 | 新增 |
| **Authorization：Enterprise-Managed** | 企业集中管控授权 | 新增 |

**给开发者的判断**：核心协议能做的（工具/资源/提示）不要用扩展做；只有"需要富交互/长生命周期/企业管控"时才上扩展，并且**必须设计降级路径**。

## 2. MCP Apps：让工具返回"界面"而不只是"文本"

### 2.1 问题

`get_sales_report` 返回一段 CSV 文本——模型能读懂，但用户看到的是一堆逗号。想展示折线图、可筛选表格、表单？纯文本做不到。

MCP Apps 的答案：**工具声明一个 UI 资源，客户端在沙箱 iframe 里渲染它**。

### 2.2 核心设计：模板与数据分离（两处注册）

```mermaid
sequenceDiagram
    participant H as Host（Claude 等）
    participant S as MCP服务器
    participant U as 沙箱 iframe

    H->>S: tools/list
    S-->>H: show_todos + _meta.ui.resourceUri = "ui://todo/view.html"
    Note over H: 可预取并缓存 UI 模板（也可先做安全审查）
    H->>S: resources/read ui://todo/view.html
    S-->>H: HTML（text/html;profile=mcp-app）
    H->>S: tools/call show_todos
    S-->>H: 纯数据（content + structuredContent），不是 HTML
    H->>U: 在 iframe 中加载模板 + 注入数据
    U->>H: （可选）通过 host 调用其它工具（双向通信）
```

两个关键点：

1. **工具返回数据，资源返回模板**——工具不再拼 HTML，模板可被缓存、可被安全审查（这是"预取"设计的价值）；
2. **HTML 运行在沙箱 iframe** 里，通过宿主桥接层通信——不是直接给你 `document` 权限。

### 2.3 实测：三个协议事实

用 `@modelcontextprotocol/ext-apps`（v2.0.4）写一个最小 App 服务器（`lab/src/probe-app-server.mjs`）：

```javascript
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE }
  from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "app-probe", version: "1.0.0" });

  // ① 工具：用 _meta.ui.resourceUri 指向 UI 资源
  registerAppTool(server, "show_todos", {
    description: "以交互卡片展示当前待办（有 UI 的客户端会渲染卡片）",
    inputSchema: z.object({}),
    _meta: { ui: { resourceUri: "ui://todo/view.html" } },
  }, async () => ({
    content: [{ type: "text", text: "共 2 条待办" }],     // 降级文本
    structuredContent: { items: ["示例 A", "示例 B"] },     // 给 UI 的数据
  }));

  // ② 资源：返回 HTML，MIME 固定为 text/html;profile=mcp-app
  registerAppResource(server, "Todo View", "ui://todo/view.html", {}, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: VIEW_HTML }],
  }));

  return server;
}
serveStdio(createServer);
```

**实测 1**：`tools/list` 里工具确实带 UI 元数据（注意同时出现了嵌套与扁平两种键）：

```
"name": "show_todos"
  "ui": { "resourceUri": "ui://todo/view.html" }
  "ui/resourceUri": "ui://todo/view.html"
```

**实测 2**：`resources/read ui://todo/view.html` 返回：

```
"uri": "ui://todo/view.html"
"mimeType": "text/html;profile=mcp-app"
"text": "<!doctype html>\n<html lang=\"zh-CN\">…"
```

**实测 3**：`tools/call show_todos` 返回的是**数据**（`structuredContent.items`），不是 HTML——模板与数据分离在真机行为上成立。

### 2.4 `_meta.ui` 的进阶字段（按 SEP-1865）

| 字段 | 作用 | 举例 |
|---|---|---|
| `resourceUri` | 指向 UI 模板 | `ui://todo/view.html` |
| `visibility` | 工具对谁可见：`["app"]` 表示只给界面用、**不出现在模型的工具清单** | 表单提交、翻页这类"纯 UI 动作" |
| `csp` | 声明 iframe 允许的外部域（CDN 等），宿主据此设 CSP | `{"connect-src": ["https://api.example.com"]}` |
| `permissions` | 申请浏览器能力（摄像头/麦克风/剪贴板等） | `["clipboardWrite"]` |

`visibility: ["app"]` 是一个很妙的设计：**给界面用的工具不必污染模型的工具清单**——既省上下文，也避免模型误调"保存草稿"这种内部动作。

### 2.5 双向通信：界面能反向调工具

界面里的按钮（"标记完成"）可以直接通过宿主桥接调用服务器工具，**不需要模型参与**——这是"富应用"和"渲染个静态图表"的分水岭。`ext-apps` 的 `App` 类（浏览器侧）负责订阅工具数据、发起工具调用；宿主侧用 `app-bridge` 嵌入。

### 2.6 客户端支持与降级

- 支持 MCP Apps 的宿主：Claude、ChatGPT 等（据 ext-apps README："renders inline in Claude, ChatGPT and any other compliant chat client"）；具体以**扩展支持矩阵**为准（官方 `extensions/client-matrix`）。
- **必须有降级**：不支持 UI 的客户端只看到 `content` 里的文本。所以 2.3 的例子里 `content` 写了"共 2 条待办"——**永远让文本通道独立成立**。

### 2.7 什么时候不该用 MCP Apps

| 场景 | 建议 |
|---|---|
| 一次性数据展示（一段文本就够） | 不用，纯文本更省 |
| 需要离线/极简客户端兼容 | 不用，或严格做降级 |
| 复杂业务前端（多页面、路由） | 用独立 Web 应用，MCP 只提供数据和动作（08 篇的资源链接模式） |
| 图表、表单、看板、可视化编辑 | **用**，这是它的主战场 |

## 3. 授权注册：CIMD 与 DCR（08 篇的补完）

08 篇讲了 OAuth 的角色分工（MCP 服务器 = Resource Server），但漏了"**客户端怎么向授权服务器注册**"。这块在 2025-2026 年发生了重要变化。

### 3.1 两种注册方式

| | **DCR**（Dynamic Client Registration，RFC 7591） | **CIMD**（Client ID Metadata Document） |
|---|---|---|
| 机制 | 客户端向 AS 的注册端点 POST，换取 `client_id` | `client_id` **本身就是一个 HTTPS URL**，指向客户端自托管的元数据文档 |
| 服务器侧成本 | 每次注册写一行数据库；端点公开可写 | **零端点、零存储**——按需拉取 URL |
| 信任锚 | AS 发的凭证 | 客户端域名 + TLS |
| 主要风险 | 注册端点被滥用（灌库）、垃圾客户端 | **SSRF**（AS 去拉客户端给的 URL）、仿冒（要看重定向 URI 的 hostname） |

### 3.2 规范时间线（很重要，决定你该实现哪个）

| 协议版本 | DCR | CIMD |
|---|---|---|
| `2025-06-18` | SHOULD | — |
| `2025-11-25` | MAY（仅向后兼容） | **SHOULD**（推荐） |
| `2026-07-28` | **Deprecated**（SEP-2596 生命周期，至少 12 个月移除窗口） | 推荐路径 |

客户端注册的**优先级顺序**（2025-11-25 起规范）：

```
1. 预注册的客户端信息（有就用）
2. CIMD（若 AS 元数据声明 client_id_metadata_document_supported: true）
3. DCR（向后兼容回退）
4. 手动填写 client_id
```

### 3.3 CIMD 的硬性要求（实现时逐条对）

- `client_id` 必须是 **HTTPS URL 且带路径**（不能有 fragment、用户名密码、`.`/`..` 段）；
- 文档里的 `client_id` 字段必须与 URL **完全一致**；
- **禁用共享密钥**类认证（`client_secret_basic/post/jwt`）；机密客户端用 `private_key_jwt` + 发布的 `jwks_uri`；
- AS 在 RFC 8414 元数据里声明 `client_id_metadata_document_supported: true`；
- 拉取文档时做 **SSRF 防护**：拒绝回环/内网地址、域名白名单或准入策略、限制大小与超时。

### 3.4 实操建议

**如果你是 MCP 服务器作者**（最常见）：

- 你通常**不需要**实现注册——注册是客户端与 AS 之间的事；
- 你要做的是：在 401 响应里给出 `WWW-Authenticate` 挑战与受保护资源元数据（08 篇 4.1），让客户端能找到 AS；
- **别透传下游 token**（08 篇 confused deputy）。

**如果你在运营授权服务器**：

- 现在就支持 CIMD（含 SSRF 防护），同时保留 DCR 到 2026 年底之后（迁移期）；
- 同意页展示**重定向 URI 的 hostname**，不要只展示自报的 `client_name`；
- 记录 CIMD 拉取失败率——它是客户端配置错误的主要信号。

**如果你是客户端作者**：按 3.2 的优先级实现；遇到"AS 既不支持 CIMD 也不支持 DCR"时明确报错（有真实案例：Claude Code 会直接拒绝这类 AS）。

## 4. 扩展选型总表

| 你的需求 | 用哪个 | 备注 |
|---|---|---|
| 普通工具调用 | 核心协议 | 90% 的场景 |
| 图表/表单/看板 | **MCP Apps** | 必须做纯文本降级 |
| 跑 10 分钟的任务 | Tasks 扩展 或 应用层 jobId（06 篇） | Tasks 仍在演进 |
| 分发团队规范/技能 | Skills 扩展 | 也可用 Prompt + 资源 |
| 机器对机器授权 | OAuth Client Credentials 扩展 | 无用户交互场景 |
| 企业统一管控授权 | Enterprise-Managed Authorization | 需 IdP 配合 |

## 5. 踩坑 FAQ

**Q1：我的工具加了 `_meta.ui`，客户端没渲染 UI？**
分三步查：① 客户端是否支持 MCP Apps（查扩展支持矩阵，绝大多数终端客户端暂不支持）；② `resources/read` 返回的 mimeType 是否精确为 `text/html;profile=mcp-app`（实测用 `RESOURCE_MIME_TYPE` 常量可避免拼错）；③ 是否用 `registerAppTool`/`registerAppResource` 注册（普通 `registerTool` 不会规范化 UI 元数据）。

**Q2：UI 里想调服务器工具，为什么要经过宿主？**
安全模型：iframe 是沙箱，没有你的 token，也不该直接拿到网络权限。双向通信由宿主桥接（`App` 类 + `app-bridge`），宿主可以审计/限制每一次工具调用——这正是"沙箱"的意义。

**Q3：CSP 配了 CDN 还是加载失败？**
`_meta.ui.csp` 是**声明**，宿主据此设置 iframe 的 CSP；不同宿主实现严格度不同。最稳的做法：模板内联关键样式与脚本，外部依赖尽量少。

**Q4：AS 支持 CIMD 了，为什么我的客户端还在走 DCR？**
检查 AS 的 RFC 8414 元数据是否真的带 `client_id_metadata_document_supported: true`；客户端按优先级选择，若 CIMD 拉取失败（例如客户端文档 URL 不可达）会回退 DCR——看 AS 日志的拉取错误。

**Q5：`visibility: ["app"]` 的工具，模型怎么还能调用？**
它不该出现在模型的清单里；如果出现了，检查是否用了普通 `registerTool`（没走 App 元数据规范化），或宿主未实现该字段。**这个字段是给宿主用的约定**，别把它当权限控制——真正的权限在服务器侧（11 篇 authInfo/scopes）。

**Q6：我要不要现在就为 MCP Apps 重写服务器？**
不要。**先把核心协议的三原语做扎实**（本篇之前 13 篇的内容），UI 是锦上添花；而且 UI 只对支持它的宿主生效，文本通道才是所有人都能用的底线。

## 参考链接

- [SEP-1865：MCP Apps 规范](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) · [ext-apps 仓库](https://github.com/modelcontextprotocol/ext-apps) · [API 文档](https://apps.extensions.modelcontextprotocol.io/api/)
- [Extensions 总览](https://modelcontextprotocol.io/extensions/overview) · [扩展支持矩阵](https://modelcontextprotocol.io/extensions/client-matrix)
- [规范：Authorization（2026-07-28）](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) · [客户端注册](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- [IETF draft：OAuth Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
- [本篇配套代码：MCP App 探针](lab/src/probe-app-server.mjs)

---

**下一篇**（收官）：把 todo 服务器升级成"生产级数据库集成"——PostgreSQL、行级安全、向量检索与 pgvector，对齐主流课程里最硬的那个 capstone。

[← 上一篇：测试与质量保障](13-测试与质量保障.md) · [目录](README.md) · [下一篇：生产级数据库集成 →](15-生产级数据库集成.md)
