// 探针实验：MRTR + Elicitation 全流程
// 服务器：第一次进入工具 → 返回 input_required（嵌入 elicitation 请求）
//         第二次进入（客户端带答案重试）→ 读取答案并返回最终结果
import { McpServer, inputRequired } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "elicit-probe", version: "1.0.0" });

  server.registerTool(
    "confirm_delete",
    {
      description: "删除待办（需要用户确认，演示 Elicitation/MRTR）",
      inputSchema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, extra) => {
      const responses = extra.mcpReq.inputResponses ?? null;
      console.error("== 进入工具 ==");
      console.error("  round:", responses ? "≥2（客户端带回答案）" : "1（第一次）");
      if (responses) {
        console.error("  requestState:", extra.mcpReq.requestState);
        console.error("  inputResponses:", JSON.stringify(responses));
      }

      if (!responses) {
        // 第 1 轮：向用户要确认。requestState 用不透明串携带业务状态
        return inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({
              message: `确定要删除待办 ${id} 吗？此操作不可撤销。`,
              requestedSchema: z.object({
                confirm: z.boolean().describe("true=确认删除，false=取消"),
              }),
            }),
          },
          requestState: JSON.stringify({ id }), // 生产环境应 HMAC 保护！
        });
      }

      // 第 2 轮：读取用户答案
      const answer = responses.confirm?.content?.confirm; // 结构按回传形态取
      console.error("  用户回答:", JSON.stringify(answer));
      if (answer === true || answer?.confirm === true || answer === "true") {
        return { content: [{ type: "text", text: `已删除待办 ${id}` }] };
      }
      return { content: [{ type: "text", text: `已取消删除待办 ${id}` }] };
    },
  );

  return server;
}

serveStdio(createServer);
console.error("elicit-probe server on stdio");
