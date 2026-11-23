// 取消探针：长任务工具，客户端断开连接后应感知 signal.aborted 并停止
import { createServer } from "node:http";
import { toWebRequest } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function createSlowServer() {
  const server = new McpServer({ name: "cancel-probe", version: "1.0.0" });

  server.registerTool(
    "slow_job",
    {
      description: "模拟 20 秒长任务；客户端断开时应尽快停止",
      inputSchema: z.object({ label: z.string().default("job") }),
    },
    async ({ label }, extra) => {
      const signal = extra.mcpReq.signal;
      const startedAt = Date.now();
      console.error(`[${label}] 开始执行`);
      for (let i = 1; i <= 40; i++) {
        if (signal?.aborted) {
          console.error(`[${label}] 检测到取消，已停止（第 ${i} 步，耗时 ${Date.now() - startedAt}ms）`);
          return { content: [{ type: "text", text: `已取消（第 ${i} 步）` }] };
        }
        await new Promise((r) => setTimeout(r, 500));
        if (i % 4 === 0) console.error(`[${label}] 进度 ${i}/40`);
      }
      console.error(`[${label}] 正常完成，耗时 ${Date.now() - startedAt}ms`);
      return { content: [{ type: "text", text: "完成" }] };
    },
  );

  return server;
}

const handler = createMcpHandler(createSlowServer);
const PORT = Number(process.env.PORT || 3005);

createServer(async (req, res) => {
  // 关键：监听 res 的 close（连接终止）而不是 req 的 close（请求体读完就会触发）
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      console.error("[server] 检测到客户端断开，触发 abort");
      ac.abort();
    }
  });

  try {
    const response = await handler.fetch(await toWebRequest(req, undefined, { signal: ac.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("[server] 请求处理异常:", err?.name, err?.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(err?.message ?? err) } }));
    }
  }
}).listen(PORT, "127.0.0.1", () => {
  console.error(`cancel-probe listening on http://127.0.0.1:${PORT}/mcp`);
});
