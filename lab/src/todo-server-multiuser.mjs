// 多用户会话隔离 + 状态外置示例
// 1) 每个 Bearer Token 映射到一个用户，服务器实例由"该用户"的工厂创建（官方多租户模式：ctx.authInfo）
// 2) 业务状态放在"每请求新建的实例之外"，无状态模式可水平扩展
// 3) DB_MODE=sqlite 时用 Node 22 内置 node:sqlite 持久化（本机实测可用）
import { createServer } from "node:http";
import { toWebRequest } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

// ---------- 用户目录：token -> userId（生产环境用数据库/IdP） ----------
const TOKENS = {
  "alice-token": "alice",
  "bob-token": "bob",
};

// ---------- 业务状态：在实例之外 ----------
const todosByUser = new Map(); // userId -> Todo[]（内存版，按用户分桶）

// 生产版（DB_MODE=sqlite）：一张表 + user_id 列
let db = null;
if (process.env.DB_MODE === "sqlite") {
  const { DatabaseSync } = await import("node:sqlite");
  db = new DatabaseSync(process.env.DB_PATH || "todos.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function addTodoFor(userId, text) {
  if (db) {
    const info = db.prepare("INSERT INTO todos (user_id, text) VALUES (?, ?)").run(userId, text);
    return { id: Number(info.lastInsertRowid), text, done: 0 };
  }
  const list = todosByUser.get(userId) ?? [];
  const todo = { id: list.length + 1, text, done: 0 };
  list.push(todo);
  todosByUser.set(userId, list);
  return todo;
}

function listTodosFor(userId) {
  if (db) {
    return db.prepare("SELECT id, text, done FROM todos WHERE user_id = ? ORDER BY id").all(userId);
  }
  return todosByUser.get(userId) ?? [];
}

// ---------- 工具工厂：userId 经闭包绑进这个用户的实例 ----------
function createTodoServer(userId) {
  const server = new McpServer({ name: "todo-multiuser", version: "1.0.0" });

  server.registerTool(
    "add_todo",
    {
      title: "新增待办",
      description: "向当前用户的待办清单中添加一条新待办事项",
      inputSchema: z.object({ text: z.string().min(1).describe("待办内容") }),
    },
    async ({ text }) => {
      const todo = addTodoFor(userId, text); // ← 只写当前用户的数据
      return { content: [{ type: "text", text: `已添加 [${todo.id}] ${text}` }] };
    },
  );

  server.registerTool(
    "list_todos",
    {
      title: "列出待办",
      description: "列出当前用户的所有待办事项",
      inputSchema: z.object({}),
    },
    async () => {
      const rows = listTodosFor(userId);
      const lines = rows.map((t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`);
      return { content: [{ type: "text", text: lines.join("\n") || "（空）" }] };
    },
  );

  return server;
}

// ---------- 一个 handler：工厂从 ctx.authInfo 读取调用者身份（多租户标准姿势） ----------
const handler = createMcpHandler((ctx) => {
  const userId = ctx.authInfo?.extra?.userId;
  if (!userId) throw new Error("missing authenticated principal");
  return createTodoServer(userId);
});

// ---------- HTTP 入口：校验 token → 构造 authInfo → 交给 handler ----------
const BIND_ADDR = process.env.BIND_ADDR || "127.0.0.1";
const PORT = Number(process.env.PORT || 3004);

createServer(async (req, res) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const userId = token ? TOKENS[token] : null;

  if (!userId) {
    res.writeHead(401, { "WWW-Authenticate": "Bearer" });
    res.end(JSON.stringify({
      jsonrpc: "2.0", id: null,
      error: { code: -32001, message: "Unauthorized: unknown bearer token" },
    }));
    return;
  }

  const response = await handler.fetch(await toWebRequest(req), {
    authInfo: { token, clientId: userId, scopes: ["todos"], extra: { userId } },
  });

  // Response（可能是 SSE 流）逐块写回 Node 响应
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}).listen(PORT, BIND_ADDR, () => {
  console.error(`todo MCP server (multiuser) listening on http://${BIND_ADDR}:${PORT}/mcp`);
});
