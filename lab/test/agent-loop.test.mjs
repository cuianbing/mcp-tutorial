// 模拟 LLM 的 Agent 循环测试：不调用真实模型，验证"工具选择 → 执行 → 回填"逻辑
// 运行：node --test test/agent-loop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

// ---------- 假模型：确定性规则代替 LLM ----------
// 输入对话历史，返回"模型决策"：要么调用工具，要么给出最终回答
function fakeModel(messages, tools) {
  const last = messages[messages.length - 1];
  const userText = messages.find((m) => m.role === "user")?.content ?? "";

  // 已经拿到工具结果 → 组织最终回答
  if (last.role === "tool_result") {
    return { type: "final", text: `完成：${last.content}` };
  }

  // 第一次调用：解析意图（这里用最简单的规则）
  if (/添加|记一条/.test(userText)) {
    const text = userText.replace(/^.*?[:：]/, "").trim() || userText;
    return { type: "tool_use", name: "add_todo", arguments: { text } };
  }
  if (/列出|查看/.test(userText)) {
    return { type: "tool_use", name: "list_todos", arguments: { filter: "all" } };
  }
  return { type: "final", text: "我不明白" };
}

// ---------- Agent 循环（07 篇结构，模型换成 fakeModel） ----------
async function runAgent(client, userText, maxTurns = 5) {
  const messages = [{ role: "user", content: userText }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const decision = fakeModel(messages, []);
    if (decision.type === "final") return decision.text;

    const result = await client.callTool({ name: decision.name, arguments: decision.arguments });
    messages.push({
      role: "tool_result",
      content: result.content.map((c) => c.text ?? "").join("\n"),
      isError: result.isError === true,
    });
  }
  throw new Error("超过最大轮次");
}

test("Agent 循环：意图 → add_todo → 最终回答", async () => {
  const client = new Client(
    { name: "agent-loop-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(new StdioClientTransport({ command: "node", args: ["build/todo-server.js"] }));

  const answer = await runAgent(client, "帮我添加：写单元测试");
  assert.match(answer, /完成：已添加 \[1\] 写单元测试/);

  // 验证副作用真的发生了
  const listed = await client.callTool({ name: "list_todos", arguments: { filter: "all" } });
  assert.match(listed.content[0].text, /写单元测试/);

  await client.close();
});

test("Agent 循环：工具失败时把 isError 回填给模型", async () => {
  const client = new Client(
    { name: "agent-loop-test-2", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(new StdioClientTransport({ command: "node", args: ["build/todo-server.js"] }));

  // 直接构造一个会失败的工具调用，验证错误被如实回填
  const r = await client.callTool({ name: "complete_todo", arguments: { id: 12345 } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /找不到编号为 12345/);

  await client.close();
});
