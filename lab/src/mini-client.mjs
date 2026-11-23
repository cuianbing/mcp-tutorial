// 迷你 MCP 客户端：不依赖任何 SDK，只靠 Node 原生能力完成一次完整的 MCP 对话。
// 用途：验证你对协议层的理解——MCP 说白了就是"按行分隔的 JSON-RPC 2.0 消息"。
// 运行：node src/mini-client.mjs build/todo-server.js

import { spawn } from "node:child_process";

const serverPath = process.argv[2];
if (!serverPath) {
  console.error("用法：node src/mini-client.mjs <server.js 路径>");
  process.exit(1);
}

// ---------- 第 1 步：把 MCP 服务器当作子进程启动，接上它的 stdin/stdout ----------
const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
const pending = new Map(); // id -> resolve
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let newlineIndex;
  // MCP 的 stdio 传输：每条消息就是一行 JSON
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else {
      // 没有 id 的消息 = 通知，服务器单方面发来，不需要回答
      console.error("← [通知]", JSON.stringify(message));
    }
  }
});

let nextId = 0;
function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

// 发送请求并等待"同 id"的响应（JSON-RPC 的请求-响应关联机制）
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

// ---------- 第 2 步：legacy 时代握手（initialize → 通知 initialized） ----------
const init = await request("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "mini-client", version: "1.0.0" },
});
console.error("→ 握手成功，服务器版本支持:", init.result.protocolVersion);
send({ jsonrpc: "2.0", method: "notifications/initialized" }); // 通知，无 id、无响应

// ---------- 第 3 步：发现工具 ----------
const tools = await request("tools/list", {});
console.error("→ 服务器提供的工具:", tools.result.tools.map((t) => t.name).join(", "));

// ---------- 第 4 步：调用工具 ----------
const addResult = await request("tools/call", {
  name: "add_todo",
  arguments: { text: "读完《深入理解 MCP》第 3 章" },
});
console.error("→ add_todo 结果:", addResult.result.content[0].text);

const listResult = await request("tools/call", {
  name: "list_todos",
  arguments: { filter: "open" },
});
console.error("→ list_todos 结果:", listResult.result.content[0].text);

// ---------- 第 5 步：收尾 ----------
child.stdin.end();
await new Promise((resolve) => child.on("close", resolve));
console.error("连接已关闭");
