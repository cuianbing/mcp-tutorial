// 探针客户端：用 SDK Client 触发一轮 MRTR（工具第一次返回 input_required，客户端重试）
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: "node",
  args: ["src/probe-elicitation-server.mjs"],
});

const client = new Client(
  { name: "elicit-probe-client", version: "1.0.0" },
  { versionNegotiation: { mode: "auto" }, capabilities: { elicitation: { form: {} } } },
);

// 注册 elicitation 处理器：客户端收到服务器的提问时怎么回答（真实客户端会弹 UI）
client.setRequestHandler("elicitation/create", async (request) => {
  console.log("== 客户端收到提问 ==");
  console.log("  message:", request.params.message);
  console.log("  requestedSchema:", JSON.stringify(request.params.requestedSchema));
  return { action: "accept", content: { confirm: true } };
});

await client.connect(transport);

const result = await client.callTool({ name: "confirm_delete", arguments: { id: 1 } });
console.log("== callTool 第一次返回 ==");
console.log(JSON.stringify(result, null, 2));
await client.close();
