// 用官方 SDK Client 连接 stdio 服务器（第 07 篇的验证代码）
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const serverPath = process.argv[2] ?? "build/todo-server.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
});

const client = new Client(
  { name: "sdk-demo-client", version: "1.0.0" },
  { versionNegotiation: { mode: "auto" } },
);

await client.connect(transport);
console.error("已连接，服务器信息:", JSON.stringify(await client.getServerVersion()));

const { tools } = await client.listTools();
console.error("工具列表:", tools.map((t) => t.name).join(", "));

const addResult = await client.callTool({
  name: "add_todo",
  arguments: { text: "用 SDK 客户端跑通一次调用" },
});
console.error("add_todo:", addResult.content[0].text);

const listResult = await client.callTool({
  name: "list_todos",
  arguments: { filter: "open" },
});
console.error("list_todos:", listResult.content[0].text);

await client.close();
console.error("连接已关闭");
