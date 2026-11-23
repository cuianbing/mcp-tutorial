// 探针：参数校验失败时，SDK 是抛异常还是返回 isError？
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client(
  { name: "validate-probe", version: "1.0.0" },
  { versionNegotiation: { mode: "auto" } },
);
await client.connect(new StdioClientTransport({ command: "node", args: ["build/todo-server.js"] }));

async function probe(label, args) {
  try {
    const r = await client.callTool({ name: "add_todo", arguments: args });
    console.log(`[${label}] 未抛异常 → isError=${r.isError}`);
    console.log(`  content: ${JSON.stringify(r.content).slice(0, 300)}`);
    if (r.structuredContent) console.log(`  structuredContent: ${JSON.stringify(r.structuredContent).slice(0, 200)}`);
  } catch (e) {
    console.log(`[${label}] 抛异常 → ${e.name}: ${String(e.message).slice(0, 300)}`);
  }
}

await probe("空字符串", { text: "" });
await probe("缺字段", {});
await probe("类型错", { text: 123 });

await client.close();
