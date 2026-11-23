// 探针实验：验证工具回调的 extra 参数内容（progress 能力）
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "probe", version: "1.0.0" });

  server.registerTool(
    "probe_extra",
    {
      description: "打印回调收到的 extra 参数，并演示 progress 通知",
      inputSchema: z.object({}),
    },
    async (_args, extra) => {
      console.error("extra keys:", Object.keys(extra).join(", "));
      console.error("extra JSON:", JSON.stringify(extra, (k, v) => (typeof v === "function" ? "[fn]" : v), 1));
      // 用 extra.mcpReq.notify 发送与当前请求关联的 progress 通知
      try {
        await extra.mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken: extra.mcpReq.id, progress: 50, total: 100, message: "一半了" },
        });
        console.error("progress 通知已发送");
      } catch (e) {
        console.error("progress 发送失败:", e.message);
      }
      return { content: [{ type: "text", text: "probe 完成" }] };
    },
  );

  // 结构化输出示例：outputSchema + structuredContent
  server.registerTool(
    "structured_stats",
    {
      title: "结构化统计",
      description: "返回待办统计的结构化数据（演示 outputSchema）",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number().describe("总数"),
        done: z.number().describe("已完成数"),
      }),
    },
    async () => {
      const output = { total: 3, done: 1 };
      return {
        content: [{ type: "text", text: `共 ${output.total} 条，完成 ${output.done} 条` }],
        structuredContent: output,
      };
    },
  );

  return server;
}

serveStdio(createServer);
console.error("probe server on stdio");
