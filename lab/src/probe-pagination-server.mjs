// 分页探针服务器：注册 15 个工具，用于观察 tools/list 是否返回 nextCursor
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "page-probe", version: "1.0.0" });
  for (let i = 1; i <= 15; i++) {
    server.registerTool(
      `tool_${String(i).padStart(2, "0")}`,
      { description: `演示工具 ${i}`, inputSchema: z.object({}) },
      async () => ({ content: [{ type: "text", text: `ok ${i}` }] }),
    );
  }
  return server;
}

serveStdio(createServer);
console.error("page-probe server on stdio (15 tools)");
