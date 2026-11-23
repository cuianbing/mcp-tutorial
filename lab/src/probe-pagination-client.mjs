// 原始协议客户端：直接观察 tools/list 的分页行为（不借 SDK）
import { spawn } from "node:child_process";

const child = spawn("node", ["src/probe-pagination-server.mjs"], { stdio: ["pipe", "pipe", "inherit"] });
let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let i;
  while ((i = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
let nextId = 0;
const request = (method, params) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});

// legacy 握手，确保兼容
await request("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "page-probe-client", version: "1.0.0" },
});
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

// 1) 不带 cursor
const r1 = await request("tools/list", {});
console.log("== tools/list 无 cursor ==");
console.log("  返回工具数:", r1.result.tools.length);
console.log("  顶层字段:", Object.keys(r1.result).join(", "));
console.log("  nextCursor:", JSON.stringify(r1.result.nextCursor));

// 2) 显式带一个非法 cursor，观察服务器行为
const r2 = await request("tools/list", { cursor: "bogus-cursor" });
console.log("== tools/list 带非法 cursor ==");
console.log("  结果:", JSON.stringify(r2.result ?? r2.error).slice(0, 300));

// 3) 显式带一个合法形态的 cursor（用 nextCursor 若存在）
if (r1.result.nextCursor) {
  const r3 = await request("tools/list", { cursor: r1.result.nextCursor });
  console.log("== 用 nextCursor 翻页 ==");
  console.log("  第二页工具数:", r3.result.tools.length, "nextCursor:", JSON.stringify(r3.result.nextCursor));
}

child.stdin.end();
await new Promise((r) => child.on("close", r));
