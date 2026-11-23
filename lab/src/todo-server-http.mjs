// Streamable HTTP 版本：把同一个 todo 服务器从 stdio 搬到 HTTP 上。
// 每个请求新建一对 server/transport（无状态模式），与 2026-07-28 的无状态协议匹配。
import { createServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const todos = [];
let nextId = 1;

function createTodoServer() {
  const server = new McpServer({ name: "todo-http", version: "1.0.0" });

  server.registerTool(
    "add_todo",
    {
      title: "新增待办",
      description: "向待办清单中添加一条新待办事项",
      inputSchema: z.object({ text: z.string().min(1).describe("待办内容") }),
    },
    async ({ text }) => {
      todos.push({ id: nextId++, text, done: false });
      return { content: [{ type: "text", text: `已添加 [${nextId - 1}] ${text}` }] };
    },
  );

  server.registerTool(
    "list_todos",
    {
      title: "列出待办",
      description: "列出当前所有待办事项",
      inputSchema: z.object({}),
    },
    async () => {
      const lines = todos.map((t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`);
      return { content: [{ type: "text", text: lines.join("\n") || "（空）" }] };
    },
  );

  return server;
}

// ---------- 安全护栏（规范要求：校验 Origin，绑定 127.0.0.1） ----------
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

createServer(async (req, res) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  console.error(`← ${req.method} ${req.url}`);

  // 无状态模式：每个请求独立创建（2026-07-28 已移除协议级会话）
  const server = createTodoServer();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(3001, "127.0.0.1", () => {
  console.error("todo MCP server (Streamable HTTP) listening on http://127.0.0.1:3001/mcp");
});
