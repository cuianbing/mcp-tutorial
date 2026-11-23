// 生产级数据库集成示例（SQLite 驱动，可平移到 PostgreSQL）
// 分层：工具层（MCP）→ 仓储层（业务 SQL）→ 驱动层（node:sqlite）
// 多用户隔离：authInfo → userId → 每条 SQL 强制带 user_id
import { createServer } from "node:http";
import { toWebRequest } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const TOKENS = { "alice-token": "alice", "bob-token": "bob" };

// ---------- 驱动层 ----------
const db = new DatabaseSync(process.env.DB_PATH || ":memory:");
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id, id);
`);

// ---------- 仓储层：所有查询强制带 user_id ----------
const repo = {
  add(userId, text) {
    const info = db.prepare("INSERT INTO todos (user_id, text) VALUES (?, ?)").run(userId, text);
    return { id: Number(info.lastInsertRowid), text, done: 0 };
  },

  // keyset 分页：cursor = 上一页最后一条 id（base64url）
  page(userId, { limit, cursor }) {
    const after = cursor ? Number(Buffer.from(cursor, "base64url").toString()) : 0;
    const rows = db.prepare(
      "SELECT id, text, done FROM todos WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?"
    ).all(userId, after, limit + 1);          // 多取一条判断是否有下一页
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore && items.length
      ? Buffer.from(String(items[items.length - 1].id)).toString("base64url")
      : null;
    return { items, nextCursor };
  },

  // 关键词检索（SQLite 用 LIKE；PostgreSQL 可换 ILIKE / to_tsvector / pgvector）
  search(userId, query, limit) {
    return db.prepare(
      "SELECT id, text, done FROM todos WHERE user_id = ? AND text LIKE ? ORDER BY id DESC LIMIT ?"
    ).all(userId, `%${query}%`, limit);
  },

  stats(userId) {
    return db.prepare(
      "SELECT COUNT(*) AS total, SUM(done) AS done FROM todos WHERE user_id = ?"
    ).get(userId);
  },

  complete(userId, id) {
    const r = db.prepare("UPDATE todos SET done = 1 WHERE id = ? AND user_id = ?").run(id, userId);
    return r.changes > 0;
  },
};

// ---------- 工具层 ----------
function createTodoServer(userId) {
  const server = new McpServer({ name: "todo-db", version: "1.0.0" });

  server.registerTool("add_todo", {
    description: "添加待办（写入数据库，重启不丢）",
    inputSchema: z.object({ text: z.string().min(1).describe("待办内容") }),
  }, async ({ text }) => {
    const t = repo.add(userId, text);
    return { content: [{ type: "text", text: `已添加 [${t.id}] ${t.text}` }] };
  });

  server.registerTool("list_todos", {
    description: "分页列出待办。返回 nextCursor 时传回它以翻下一页（null 表示末页）",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).default(10),
      cursor: z.string().optional().describe("上一页返回的 nextCursor"),
    }),
    outputSchema: z.object({
      items: z.array(z.object({ id: z.number(), text: z.string(), done: z.number() })),
      nextCursor: z.string().nullable(),
    }),
  }, async ({ limit, cursor }) => {
    const { items, nextCursor } = repo.page(userId, { limit, cursor });
    const text = items.map((t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`).join("\n") || "（空）";
    return {
      content: [{ type: "text", text: nextCursor ? `${text}\n--- 还有更多：${nextCursor}` : text }],
      structuredContent: { items, nextCursor },
    };
  });

  server.registerTool("search_todos", {
    description: "按关键词检索当前用户的待办（只搜自己的数据）",
    inputSchema: z.object({
      query: z.string().min(1).describe("关键词，例如：周报"),
      limit: z.number().int().min(1).max(20).default(5),
    }),
  }, async ({ query, limit }) => {
    const rows = repo.search(userId, query, limit);
    const text = rows.length
      ? rows.map((t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`).join("\n")
      : `没有匹配「${query}」的待办`;
    return { content: [{ type: "text", text }] };
  });

  server.registerTool("todo_stats", {
    description: "返回当前用户待办统计（结构化输出）",
    inputSchema: z.object({}),
    outputSchema: z.object({ total: z.number(), done: z.number(), open: z.number() }),
  }, async () => {
    const s = repo.stats(userId);
    const out = { total: s.total ?? 0, done: s.done ?? 0, open: (s.total ?? 0) - (s.done ?? 0) };
    return {
      content: [{ type: "text", text: `共 ${out.total} 条：完成 ${out.done}，未完成 ${out.open}` }],
      structuredContent: out,
    };
  });

  server.registerTool("complete_todo", {
    description: "把当前用户的指定待办标记为完成",
    inputSchema: z.object({ id: z.number().int().positive() }),
  }, async ({ id }) => {
    const ok = repo.complete(userId, id);
    return ok
      ? { content: [{ type: "text", text: `已完成 [${id}]` }] }
      : { content: [{ type: "text", text: `找不到编号为 ${id} 的待办` }], isError: true };
  });

  return server;
}

// ---------- HTTP 入口 ----------
const handler = createMcpHandler((ctx) => {
  const userId = ctx.authInfo?.extra?.userId;
  if (!userId) throw new Error("missing authenticated principal");
  return createTodoServer(userId);
});

const PORT = Number(process.env.PORT || 3006);
createServer(async (req, res) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const userId = token ? TOKENS[token] : null;
  if (!userId) {
    res.writeHead(401, { "WWW-Authenticate": "Bearer" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }));
    return;
  }
  try {
    const response = await handler.fetch(await toWebRequest(req), {
      authInfo: { token, clientId: userId, scopes: ["todos"], extra: { userId } },
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e?.message ?? e) } }));
    }
  }
}).listen(PORT, "127.0.0.1", () => {
  console.error(`todo-db MCP server on http://127.0.0.1:${PORT}/mcp`);
});
