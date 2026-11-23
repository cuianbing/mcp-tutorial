// 现代无状态 HTTP 服务器（2026-07-28 风格）：
// createMcpHandler(工厂) → fetch handler → toNodeHandler 挂到 node:http
import { createServer } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const todos = [];
let nextId = 1;

// 工厂：createMcpHandler 每个请求都会调用一次，必须返回全新实例
function createTodoServer(ctx) {
  const server = new McpServer({ name: "todo-http2", version: "1.0.0" });

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

// createMcpHandler 返回 web 标准 fetch handler，自动兼容 modern + legacy 双时代
const handler = createMcpHandler(createTodoServer);

// 绑定地址可配：默认 127.0.0.1（安全默认值）；
// Docker/容器内部需要 0.0.0.0（容器隔离本身就是边界），再由 -p 127.0.0.1:3002:3002 限制宿主机暴露
const PORT = Number(process.env.PORT || 3002);
const BIND_ADDR = process.env.BIND_ADDR || "127.0.0.1";

createServer(toNodeHandler(handler)).listen(PORT, BIND_ADDR, () => {
  console.error(`todo MCP server (modern Streamable HTTP) listening on http://${BIND_ADDR}:${PORT}/mcp`);
});
